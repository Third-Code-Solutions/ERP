import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { can, getUserProfile } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { documents, opportunities } from '@third-code-erp/database/schema'
import { writeAuditLogInTransaction } from '@/lib/audit'

const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const opportunityIdSchema = z.string().uuid()

interface RouteContext {
  params: Promise<{ id: string }>
}

function safeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return normalized.slice(0, 160) || 'inspection-photo'
}

/**
 * Captures one inspection image and records it as an opportunity document.
 * The bounded server-side multipart path is intentional: field crews can use
 * the camera before a project exists, so the generic project upload contract
 * cannot be reused here.
 */
export async function POST(request: Request, context: RouteContext) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(profile.role, 'site_inspection.submit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const opportunityId = opportunityIdSchema.safeParse(id)
  if (!opportunityId.success) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
  }

  const [opportunity] = await db
    .select({ id: opportunities.id, project_id: opportunities.project_id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, opportunityId.data),
        eq(opportunities.tenant_id, profile.tenantId),
      ),
    )
    .limit(1)
  if (!opportunity) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Multipart form data is required' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'An image file is required' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: `Photo must be between 1 byte and ${MAX_PHOTO_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    )
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are accepted' }, { status: 415 })
  }

  const caption = String(formData.get('caption') ?? '').trim().slice(0, 255)
  const storagePath = `${profile.tenantId}/opportunities/${opportunity.id}/inspection/${crypto.randomUUID()}-${safeFileName(file.name)}`
  const storage = createSupabaseAdminClient().storage.from('documents')
  const { error: uploadError } = await storage.upload(storagePath, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) {
    return NextResponse.json({ error: 'Photo upload failed' }, { status: 502 })
  }

  try {
    const documentId = await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          tenant_id: profile.tenantId,
          project_id: opportunity.project_id,
          opportunity_id: opportunity.id,
          uploaded_by: profile.user.id,
          document_type: 'image',
          file_name: file.name.slice(0, 255),
          storage_path: storagePath,
          mime_type: file.type.slice(0, 127),
          size_bytes: file.size,
          description: caption || 'WO-12 site inspection photo',
        })
        .returning({ id: documents.id })
      if (!document) throw new Error('Photo document insert returned no row')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'document',
        entityId: document.id,
        action: 'create',
        diff: {
          source: 'site_inspection_photo',
          opportunity_id: opportunity.id,
          project_id: opportunity.project_id,
          size_bytes: file.size,
        },
      })
      return document.id
    })

    return NextResponse.json({
      id: documentId,
      fileName: file.name,
      storagePath,
    })
  } catch {
    await storage.remove([storagePath]).catch(() => undefined)
    return NextResponse.json({ error: 'Photo metadata could not be recorded' }, { status: 500 })
  }
}
