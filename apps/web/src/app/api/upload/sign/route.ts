import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { documents } from '@third-code-erp/database/schema'
import { and, eq, sum } from 'drizzle-orm'
import { getProject } from '@/lib/project-queries'
import { writeAuditLog } from '@/lib/audit'
import { safeActionError } from '@/lib/safe-action-error'

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 // 100 MB per upload (PRD F2.1)
const PROJECT_QUOTA_BYTES = 500 * 1024 * 1024 // 500 MB per project (PRD F2.1)

const SignSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional(),
  // Required so the server can reject oversized uploads BEFORE issuing
  // a signed URL (the complete endpoint also checks, but a malicious caller
  // could skip /complete and stash a 1GB blob in the bucket otherwise).
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
})

export async function POST(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!profile.tenantId) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 403 })
  }
  if (!can(profile.role, 'document.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = SignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { projectId, fileName, sizeBytes } = parsed.data

  const project = await getProject(profile.tenantId, projectId)
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Per-project quota check (PRD F2.1: 500 MB per project). Sum existing
  // documents.size_bytes for this (tenant, project) and reject before issuing
  // a signed URL. Without this check a caller could fill the bucket by
  // looping through small uploads.
  const [quotaRow] = await db
    .select({ total: sum(documents.size_bytes) })
    .from(documents)
    .where(
      and(
        eq(documents.tenant_id, profile.tenantId),
        eq(documents.project_id, projectId)
      )
    )

  // drizzle's sum() returns string | null (Postgres NUMERIC); coerce safely.
  const currentBytes = quotaRow?.total ? Number(quotaRow.total) : 0
  if (currentBytes + sizeBytes > PROJECT_QUOTA_BYTES) {
    return NextResponse.json(
      {
        error: 'Project storage quota exceeded',
        current_bytes: currentBytes,
        requested_bytes: sizeBytes,
        quota_bytes: PROJECT_QUOTA_BYTES,
      },
      { status: 413 }
    )
  }

  // Sanitize filename (storage path is server-controlled to prevent traversal)
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
  const storagePath = `${profile.tenantId}/${projectId}/${crypto.randomUUID()}-${safeName}`

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    console.error('[upload/sign] signed URL creation failed', error)
    return NextResponse.json(
      { error: safeActionError(error, 'Failed to create signed upload URL.') },
      { status: 500 }
    )
  }

  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'document_upload',
      entityId: projectId,
      action: 'query',
      diff: { operation: 'signed_upload_url_created' },
    })
  } catch (auditError) {
    console.error('[upload/sign] audit append failed:', auditError)
    return NextResponse.json(
      { error: 'Failed to audit upload authorization' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath: data.path,
    originalFileName: fileName,
  })
}
