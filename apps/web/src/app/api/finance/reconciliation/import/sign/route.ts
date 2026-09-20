import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import {
  bankStatementImportUploadSignBodySchema,
  bankStatementImportUploadSignResultSchema,
} from '@third-code-erp/shared-types'
import { writeAuditLog } from '@/lib/audit'
import {
  cleanupBankStatementStorageThroughCoreApi,
  financeReconciliationStorageUploadsUseCoreApi,
  financeReconciliationStorageUploadsViaCoreApi,
  signBankStatementStorageThroughCoreApi,
} from '@/lib/erp-core-client'

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

const storageEntityIdPattern =
  /\/bank-statements\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-|\/|$)/i

/**
 * Audit rows use a UUID entity key; keep the complete storage path in diff
 * while using the upload UUID (or tenant UUID for older cleanup paths) as the
 * relational entity id.
 */
function storageEntityId(storagePath: string, tenantId: string): string {
  return storagePath.match(storageEntityIdPattern)?.[1] ?? tenantId
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(profile.role, 'finance.manage_cash')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const storageUploadsViaCoreApi = financeReconciliationStorageUploadsViaCoreApi(
    profile.tenantId
  )
  if (
    !financeReconciliationStorageUploadsUseCoreApi(profile.tenantId) &&
    !storageUploadsViaCoreApi
  ) {
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

  if (storageUploadsViaCoreApi) {
    const coreResult = await signBankStatementStorageThroughCoreApi(parsed.data)
    if (!coreResult.ok || !coreResult.data) {
      return NextResponse.json(
        { error: coreResult.error ?? 'Bank statement upload signing failed.' },
        { status: coreResult.status ?? 503 }
      )
    }
    return NextResponse.json(coreResult.data)
  }

  const storagePath = `${profile.tenantId}/bank-statements/${crypto.randomUUID()}-${safeFileName(parsed.data.fileName)}`
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
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bank_statement_upload',
      entityId: storageEntityId(storagePath, profile.tenantId),
      action: 'query',
      diff: {
        operation: 'signed_upload_url_created',
        file_name: parsed.data.fileName,
        size_bytes: parsed.data.sizeBytes,
        storage_path: storagePath,
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

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(profile.role, 'finance.manage_cash')) {
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

  const expectedPrefix = `${profile.tenantId}/bank-statements/`
  if (
    !parsed.data.storagePath.startsWith(expectedPrefix) ||
    parsed.data.storagePath.includes('..')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (financeReconciliationStorageUploadsViaCoreApi(profile.tenantId)) {
    const coreResult = await cleanupBankStatementStorageThroughCoreApi(parsed.data)
    if (!coreResult.ok || !coreResult.data) {
      return NextResponse.json(
        { error: coreResult.error ?? 'Bank statement source cleanup failed.' },
        { status: coreResult.status ?? 503 }
      )
    }
    return NextResponse.json(coreResult.data)
  }

  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bank_statement_upload',
      entityId: storageEntityId(parsed.data.storagePath, profile.tenantId),
      action: 'delete',
      diff: {
        operation: 'signed_upload_source_cleanup_requested',
        storage_path: parsed.data.storagePath,
      },
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
