import { Injectable } from '@nestjs/common'
import {
  bomLineItems,
  boms,
  documentProcessingEvidence,
  documentProcessingJobs,
  documents,
  users,
} from '@third-code-erp/database/schema'
import {
  CAD_SCOPE_BATCH_SIZE,
  DOCUMENT_PROCESSING_MAX_ITEMS,
  documentProcessingWorkerResponseSchema,
  type DocumentProcessingWorkerResponse,
} from '@third-code-erp/shared-types'
import { and, eq, isNull } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import type { DatabaseTransaction } from '../database/database.service'
import type { ClaimedDocumentProcessingJob } from './document-processing.state'
import type { DocumentProcessingWorkerResult } from './document-processing.worker'

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

function lineTotalCents(
  item: DocumentProcessingWorkerResponse['items'][number]
): number {
  const total =
    BigInt(item.recommended_unit_cost_cents) * BigInt(item.quantity)
  if (total > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error('draft_bom_line_total_out_of_bounds')
  }
  return Number(total)
}

function totalCostCents(lineTotals: readonly number[]): number {
  const total = lineTotals.reduce(
    (sum, value) => sum + BigInt(value),
    0n
  )
  if (total > MAX_SAFE_INTEGER_BIGINT) {
    throw new Error('draft_bom_total_out_of_bounds')
  }
  return Number(total)
}

export interface DraftBomCreationResult {
  draftBomId: string
}

export interface DraftBomCommitContext {
  job: ClaimedDocumentProcessingJob
  result: DocumentProcessingWorkerResult
  evidenceId: string
  draftBomId?: string
}

/** Creates one tenant-scoped draft BOM, keyed durably by processing job. */
@Injectable()
export class DocumentProcessingDraftBomService {
  constructor(private readonly audit: AuditService) {}

  async createInTransaction(
    transaction: DatabaseTransaction,
    job: ClaimedDocumentProcessingJob,
    result: DocumentProcessingWorkerResult,
    evidenceId: string
  ): Promise<DraftBomCreationResult> {
    const evidence = documentProcessingWorkerResponseSchema.parse(
      result.evidence
    )
    if (
      evidence.job_id !== job.jobId ||
      evidence.attempt !== job.attempt ||
      result.sourceSha256 !== evidence.source_sha256 ||
      result.producer.name !== evidence.producer.name ||
      result.producer.version !== evidence.producer.version
    ) {
      throw new Error('draft_bom_evidence_context_mismatch')
    }
    if (evidence.items.length > DOCUMENT_PROCESSING_MAX_ITEMS) {
      throw new Error('draft_bom_item_limit')
    }

    const [evidenceRow] = await transaction
      .select({
        id: documentProcessingEvidence.id,
        sourceSha256: documentProcessingEvidence.source_sha256,
        producerName: documentProcessingEvidence.producer_name,
        producerVersion: documentProcessingEvidence.producer_version,
      })
      .from(documentProcessingEvidence)
      .where(
        and(
          eq(documentProcessingEvidence.id, evidenceId),
          eq(documentProcessingEvidence.tenant_id, job.tenantId),
          eq(documentProcessingEvidence.job_id, job.jobId),
          eq(documentProcessingEvidence.attempt, job.attempt)
        )
      )
      .limit(1)
      .for('share')
    if (
      !evidenceRow ||
      evidenceRow.sourceSha256 !== evidence.source_sha256 ||
      evidenceRow.producerName !== evidence.producer.name ||
      evidenceRow.producerVersion !== evidence.producer.version
    ) {
      throw new Error('draft_bom_evidence_not_found')
    }

    const [jobRow] = await transaction
      .select({
        id: documentProcessingJobs.id,
        tenantId: documentProcessingJobs.tenant_id,
        documentId: documentProcessingJobs.document_id,
        projectId: documentProcessingJobs.project_id,
        createdBy: documentProcessingJobs.created_by,
        status: documentProcessingJobs.status,
        draftBomId: documentProcessingJobs.draft_bom_id,
      })
      .from(documentProcessingJobs)
      .where(
        and(
          eq(documentProcessingJobs.id, job.jobId),
          eq(documentProcessingJobs.tenant_id, job.tenantId)
        )
      )
      .limit(1)
      .for('update')

    if (!jobRow) throw new Error('draft_bom_job_not_found')
    if (
      jobRow.documentId !== job.documentId ||
      jobRow.projectId !== job.projectId ||
      jobRow.createdBy !== job.createdBy
    ) {
      throw new Error('draft_bom_job_context_mismatch')
    }
    if (jobRow.draftBomId) {
      return { draftBomId: jobRow.draftBomId }
    }
    if (jobRow.status !== 'processing') {
      throw new Error('draft_bom_job_not_processing')
    }

    const [membership] = await transaction
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.id, job.createdBy),
          eq(users.tenant_id, job.tenantId)
        )
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (
      !membership ||
      !role ||
      !roleHasCapability(role, 'document.manage')
    ) {
      throw new Error('draft_bom_actor_not_authorized')
    }

    const [document] = await transaction
      .select({
        id: documents.id,
        projectId: documents.project_id,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, job.documentId),
          eq(documents.tenant_id, job.tenantId),
          eq(documents.project_id, job.projectId)
        )
      )
      .limit(1)
      .for('share')
    if (!document?.projectId) {
      throw new Error('draft_bom_document_not_found')
    }

    const principal: ErpPrincipal = {
      userId: job.createdBy,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }
    await this.audit.stampActor(transaction, principal)

    const lineTotals = evidence.items.map(lineTotalCents)
    const [bom] = await transaction
      .insert(boms)
      .values({
        tenant_id: job.tenantId,
        project_id: document.projectId,
        created_by: job.createdBy,
        label: `CAD draft ${job.documentId.slice(0, 8)}`,
        status: 'draft',
        total_cost_cents: totalCostCents(lineTotals),
        tcv_cents: 0,
        gp_cents: 0,
        gp_margin_bps: 0,
        notes:
          `document-processing job:${job.jobId}; evidence:${evidenceId}; ` +
          `source_sha256:${evidence.source_sha256}`,
      })
      .returning({ id: boms.id })
    if (!bom) throw new Error('draft_bom_not_created')

    const rows = evidence.items.map((item, index) => ({
      tenant_id: job.tenantId,
      bom_id: bom.id,
      sort_order: index,
      is_group: 0,
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost_cents: item.recommended_unit_cost_cents,
      markup_bps: 0,
      line_total_cents: lineTotals[index] ?? 0,
      notes:
        `auto-extracted; evidence_item:${item.item_key}` +
        (item.notes ? `; ${item.notes}` : ''),
    }))
    for (let index = 0; index < rows.length; index += CAD_SCOPE_BATCH_SIZE) {
      await transaction
        .insert(bomLineItems)
        .values(rows.slice(index, index + CAD_SCOPE_BATCH_SIZE))
    }

    const [attached] = await transaction
      .update(documentProcessingJobs)
      .set({ draft_bom_id: bom.id, updated_at: new Date() })
      .where(
        and(
          eq(documentProcessingJobs.id, job.jobId),
          eq(documentProcessingJobs.tenant_id, job.tenantId),
          isNull(documentProcessingJobs.draft_bom_id)
        )
      )
      .returning({ id: documentProcessingJobs.id })
    if (!attached) throw new Error('draft_bom_job_attach_failed')

    await this.audit.writeSemantic(transaction, {
      tenantId: job.tenantId,
      actorId: job.createdBy,
      entityType: 'bom',
      entityId: bom.id,
      action: 'create',
      diff: {
        source: 'cad_document_processing',
        document_id: job.documentId,
        processing_job_id: job.jobId,
        evidence_id: evidenceId,
        source_sha256: evidence.source_sha256,
        line_count: rows.length,
      },
    })

    return { draftBomId: bom.id }
  }
}
