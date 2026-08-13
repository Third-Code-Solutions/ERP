'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { documents, scopeItems } from '@third-code-erp/database/schema'
import { and, eq, like } from 'drizzle-orm'
import { writeAuditLogInTransaction } from '@/lib/audit'

export interface DeleteResult {
  ok: boolean
  error?: string
}

const DeleteDocumentSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
})

class DocumentNotFoundError extends Error {}

export async function deleteDocument(formData: FormData): Promise<DeleteResult> {
  const parsed = DeleteDocumentSchema.safeParse({
    documentId: formData.get('document_id'),
    projectId: formData.get('project_id'),
  })
  if (!parsed.success) {
    return { ok: false, error: 'Invalid document request' }
  }
  const { documentId, projectId } = parsed.data

  const profile = await getUserProfile()
  if (!profile) return { ok: false, error: 'Unauthorized' }
  if (!can(profile.role, 'document.manage')) {
    return { ok: false, error: 'Forbidden' }
  }

  let deletedDocument: {
    id: string
    storage_path: string
    tenant_id: string
    project_id: string
  }
  try {
    deletedDocument = await db.transaction(async (tx) => {
      const [doc] = await tx
        .select({
          id: documents.id,
          storage_path: documents.storage_path,
          tenant_id: documents.tenant_id,
          project_id: documents.project_id,
        })
        .from(documents)
        .where(
          and(
            eq(documents.id, documentId),
            eq(documents.tenant_id, profile.tenantId),
            eq(documents.project_id, projectId)
          )
        )
        .limit(1)
        .for('update')

      if (!doc || !doc.project_id) throw new DocumentNotFoundError()

      const removedScopeItems = await tx
        .delete(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, doc.tenant_id),
            eq(scopeItems.project_id, doc.project_id),
            like(scopeItems.notes, `%document:${doc.id}%`)
          )
        )
        .returning({ id: scopeItems.id })

      const [removedDocument] = await tx
        .delete(documents)
        .where(
          and(
            eq(documents.id, doc.id),
            eq(documents.tenant_id, doc.tenant_id),
            eq(documents.project_id, doc.project_id)
          )
        )
        .returning({ id: documents.id })

      if (!removedDocument) throw new DocumentNotFoundError()

      await writeAuditLogInTransaction(tx, {
        tenantId: doc.tenant_id,
        actorId: profile.user.id,
        entityType: 'document',
        entityId: doc.id,
        action: 'delete',
        diff: {
          project_id: doc.project_id,
          derived_scope_items_removed: removedScopeItems.length,
          storage_cleanup: 'best_effort_after_commit',
        },
      })

      return {
        id: doc.id,
        storage_path: doc.storage_path,
        tenant_id: doc.tenant_id,
        project_id: doc.project_id,
      }
    })
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return { ok: false, error: 'Document not found' }
    }
    console.error('[documents/delete] transaction failed:', error)
    return { ok: false, error: 'Delete failed' }
  }

  // Object Storage cannot join the PostgreSQL transaction. Run cleanup only
  // after the official record, derived rows, and audit entry commit together.
  try {
    const supabase = createSupabaseAdminClient()
    const { error: storageErr } = await supabase.storage
      .from('documents')
      .remove([deletedDocument.storage_path])
    if (storageErr) {
      console.warn('[documents/delete] storage remove warning:', storageErr.message)
    }
  } catch (err) {
    console.warn('[documents/delete] storage remove failed:', err)
  }

  revalidatePath(`/projects/${deletedDocument.project_id}/documents`)
  revalidatePath(`/projects/${deletedDocument.project_id}/scope`)
  revalidatePath(`/projects/${deletedDocument.project_id}/bom`)
  revalidatePath(`/projects/${deletedDocument.project_id}`)
  return { ok: true }
}
