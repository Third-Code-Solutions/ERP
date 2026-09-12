'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { accountKycArtifacts, documents, progressClaimDocuments, scopeItems, siteInspectionPhotos, siteInspections } from '@third-code-erp/database/schema'
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
class ClaimEvidenceRetainedError extends Error {}
class KycEvidenceRetainedError extends Error {}
class InspectionEvidenceRetainedError extends Error {}

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

  const profile = await getUserProfile()
  if (!profile) return { ok: false, error: 'Unauthorized' }
  if (!can(profile.role, 'document.manage')) {
    return { ok: false, error: 'Forbidden' }
  }

  if (documentDeleteWritesUseCoreApi(profile.tenantId)) {
    const coreResult = await deleteDocumentThroughCoreApi(
      documentId,
      parsed.data.idempotencyKey ?? randomUUID(),
    )
    if (!coreResult.ok || !coreResult.data) {
      return {
        ok: false,
        error: coreResult.error ?? 'Document was not deleted.',
      }
    }
    if (
      coreResult.data.documentId !== documentId ||
      coreResult.data.tenantId !== profile.tenantId ||
      coreResult.data.projectId !== projectId
    ) {
      return {
        ok: false,
        error: 'ERP Core API returned an invalid document deletion result.',
      }
    }
    // Never clean a receipt's object path: another document may now own it.
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
            eq(documents.tenant_id, profile.tenantId),
            eq(documents.project_id, projectId)
          )
        )
        .limit(1)
        .for('update')

      if (!doc || !doc.project_id) throw new DocumentNotFoundError()

      // Match Core retention while the document lock excludes new attachments.
      // Do not lock claims here: attachment commands lock claim before document.
      const [claimEvidence] = await tx
        .select({ id: progressClaimDocuments.id })
        .from(progressClaimDocuments)
        .where(and(
          eq(progressClaimDocuments.tenant_id, doc.tenant_id),
          eq(progressClaimDocuments.document_id, doc.id)
        ))
        .limit(1)
      if (claimEvidence) throw new ClaimEvidenceRetainedError()

      // Keep KYC evidence and its replay identity intact, matching Core.
      const [kycEvidence] = await tx
        .select({ id: accountKycArtifacts.id })
        .from(accountKycArtifacts)
        .where(and(
          eq(accountKycArtifacts.tenant_id, doc.tenant_id),
          eq(accountKycArtifacts.document_id, doc.id)
        ))
        .limit(1)
      if (kycEvidence) throw new KycEvidenceRetainedError()

      // Inspection FKs serialize attachment against this document's UPDATE lock.
      // Keep these reads separate from the lock statement to see waited-on commits.
      const [inspectionPhoto] = await tx
        .select({ id: siteInspectionPhotos.id })
        .from(siteInspectionPhotos)
        .where(and(
          eq(siteInspectionPhotos.tenant_id, doc.tenant_id),
          eq(siteInspectionPhotos.document_id, doc.id)
        ))
        .limit(1)
      if (inspectionPhoto) throw new InspectionEvidenceRetainedError()
      const [inspectionReport] = await tx
        .select({ id: siteInspections.id })
        .from(siteInspections)
        .where(and(
          eq(siteInspections.tenant_id, doc.tenant_id),
          eq(siteInspections.pdf_document_id, doc.id)
        ))
        .limit(1)
      if (inspectionReport) throw new InspectionEvidenceRetainedError()

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
          storage_cleanup: 'retained_pending_generation_fencing',
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
    if (error instanceof InspectionEvidenceRetainedError) {
      return { ok: false, error: 'Document is attached to an inspection and cannot be deleted' }
    }
    if (error instanceof KycEvidenceRetainedError) {
      return { ok: false, error: 'Document is attached to a KYC artifact and cannot be deleted' }
    }
    if (error instanceof ClaimEvidenceRetainedError) {
      return { ok: false, error: 'Document is attached to a claim and cannot be deleted' }
    }
    if (error instanceof DocumentNotFoundError) {
      return { ok: false, error: 'Document not found' }
    }
    console.error('[documents/delete] transaction failed:', error)
    return { ok: false, error: 'Delete failed' }
  }

  // Storage paths can be shared or reused by other documents and inspection
  // evidence. Retain private bytes until cleanup can prove object generation
  // ownership atomically; a reference preflight cannot close this race.
  refreshDocumentPaths(deletedDocument.project_id)
  return { ok: true }
}

function refreshDocumentPaths(projectId: string): void {
  revalidatePath(`/projects/${projectId}/documents`)
  revalidatePath(`/projects/${projectId}/scope`)
  revalidatePath(`/projects/${projectId}/bom`)
  revalidatePath(`/projects/${projectId}`)
}
