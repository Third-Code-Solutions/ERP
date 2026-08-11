import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { can, getUser } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { users } from '@third-code-erp/database/schema'
import {
  bankStatementImportUploadSignBodySchema,
  bankStatementImportUploadSignResultSchema,
} from '@third-code-erp/shared-types'
import { eq } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { financeReconciliationStorageUploadsUseCoreApi } from '@/lib/erp-core-client'

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id, role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) {
    return NextResponse.json(
      { error: 'No tenant associated with account' },
      { status: 403 }
    )
  }
  if (!can(userRow.role, 'finance.manage_cash')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!financeReconciliationStorageUploadsUseCoreApi(userRow.tenant_id)) {
    return NextResponse.json(
      { error: 'Storage-backed bank import is not enabled for this tenant' },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = bankStatementImportUploadSignBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid bank statement upload request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const storagePath = `${userRow.tenant_id}/bank-statements/${crypto.randomUUID()}-${safeFileName(parsed.data.fileName)}`
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath)
  if (error || !data?.signedUrl || !data.token) {
    return NextResponse.json(
      { error: 'Failed to create bank statement upload URL' },
      { status: 503 }
    )
  }

  try {
    await writeAuditLog({
      tenantId: userRow.tenant_id,
      actorId: user.id,
      entityType: 'bank_statement_upload',
      entityId: storagePath,
      action: 'query',
      diff: {
        operation: 'signed_upload_url_created',
        file_name: parsed.data.fileName,
        size_bytes: parsed.data.sizeBytes,
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to audit upload authorization' },
      { status: 503 }
    )
  }

  const result = bankStatementImportUploadSignResultSchema.parse({
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
    originalFileName: parsed.data.fileName,
  })
  return NextResponse.json(result)
}

const storagePathSchema = bankStatementImportUploadSignResultSchema.shape.storagePath

export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id, role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) {
    return NextResponse.json(
      { error: 'No tenant associated with account' },
      { status: 403 }
    )
  }
  if (!can(userRow.role, 'finance.manage_cash')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = z
    .object({ storagePath: storagePathSchema })
    .strict()
    .safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid bank statement storage path' },
      { status: 400 }
    )
  }

  const expectedPrefix = `${userRow.tenant_id}/bank-statements/`
  if (
    !parsed.data.storagePath.startsWith(expectedPrefix) ||
    parsed.data.storagePath.includes('..')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await writeAuditLog({
      tenantId: userRow.tenant_id,
      actorId: user.id,
      entityType: 'bank_statement_upload',
      entityId: parsed.data.storagePath,
      action: 'delete',
      diff: { operation: 'signed_upload_source_cleanup_requested' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to audit upload cleanup' },
      { status: 503 }
    )
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.storage
    .from('documents')
    .remove([parsed.data.storagePath])
  if (error) {
    return NextResponse.json(
      { error: 'Failed to clean up bank statement source' },
      { status: 503 }
    )
  }

  return NextResponse.json({ ok: true })
}
