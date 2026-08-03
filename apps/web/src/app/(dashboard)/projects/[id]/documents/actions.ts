'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can, getUser } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { db } from '@third-code-erp/database'
import { documents, scopeItems, users } from '@third-code-erp/database/schema'
import { and, eq, like } from 'drizzle-orm'
import { writeAuditLogInTransaction } from '@/lib/audit'
import {
  deleteDocumentThroughCoreApi,
  documentDeleteWritesUseCoreApi,
} from '@/lib/erp-core-client'

export interface DeleteResult {
  ok: boolean
  error?: string
}

const DeleteDocumentSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(256).optional(),
})

class DocumentNotFoundError extends Error {}

export async function deleteDocument(formData: FormData): Promise<DeleteResult> {
  const parsed = DeleteDocumentSchema.safeParse({
    documentId: formData.get('document_id'),
    projectId: formData.get('project_id'),
    idempotencyKey: formData.get('idempotency_key') ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: 'Invalid document request' }
  }
  const { documentId, projectId } = parsed.data

  const user = await getUser()
  if (!user) return { ok: false, error: 'Unauthorized' }

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id, role: users.role })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { ok: false, error: 'No tenant' }
  if (!can(userRow.role, 'document.manage')) {
    return { ok: false, error: 'Forbidden' }
  }

  if (documentDeleteWritesUseCoreApi(userRow.tenant_id)) {
    const coreResult = await deleteDocumentThroughCoreApi(
      documentId,
      parsed.data.idempotencyKey ?? randomUUID()
    )
    if (!coreResult.ok || !coreResult.data) {
      return {
        ok: false,
        error: coreResult.error ?? 'Document was not deleted.',
      }
    }
    if (
      coreResult.data.documentId !== documentId ||
      coreResult.data.tenantId !== userRow.tenant_id ||
      coreResult.data.projectId !== projectId
    ) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid document deletion result.',
      }
    }

    await cleanupDocumentStorage(coreResult.data.storagePath)
    refreshDocumentPaths(coreResult.data.projectId)
    return { ok: true }
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
            eq(documents.tenant_id, userRow.tenant_id),
            eq(documents.project_id, projectId)
          )
        )
        .limit(1)
        .for('update')

      if (!doc) throw new DocumentNotFoundError()

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
        actorId: user.id,
        entityType: 'document',
        entityId: doc.id,
        action: 'delete',
        diff: {
          project_id: doc.project_id,
          derived_scope_items_removed: removedScopeItems.length,
          storage_cleanup: 'best_effort_after_commit',
        },
      })

      return doc
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
  await cleanupDocumentStorage(deletedDocument.storage_path)
  refreshDocumentPaths(deletedDocument.project_id)
  return { ok: true }
}

async function cleanupDocumentStorage(storagePath: string): Promise<void> {
  // Object Storage cannot join the PostgreSQL transaction. This always runs
  // after the official record, derived rows, and audit entry commit together.
  try {
    const supabase = createSupabaseAdminClient()
    const { error: storageErr } = await supabase.storage
      .from('documents')
      .remove([storagePath])
    if (storageErr) {
      console.warn('[documents/delete] storage remove warning:', storageErr.message)
    }
  } catch (err) {
    console.warn('[documents/delete] storage remove failed:', err)
  }
}

function refreshDocumentPaths(projectId: string): void {
  revalidatePath(`/projects/${projectId}/documents`)
  revalidatePath(`/projects/${projectId}/scope`)
  revalidatePath(`/projects/${projectId}/bom`)
  revalidatePath(`/projects/${projectId}`)
}
