import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { documents, users } from '@third-code-erp/database/schema'
import { and, eq, sum } from 'drizzle-orm'
import { getProject } from '@/lib/project-queries'

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
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))

  if (!userRow?.tenant_id) {
    return NextResponse.json({ error: 'No tenant associated with account' }, { status: 403 })
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

  const project = await getProject(userRow.tenant_id, projectId)
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
        eq(documents.tenant_id, userRow.tenant_id),
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
  const storagePath = `${userRow.tenant_id}/${projectId}/${crypto.randomUUID()}-${safeName}`

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    return NextResponse.json(
      { error: `Failed to create signed upload URL: ${error?.message ?? 'unknown'}` },
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
