import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  bomLineItems,
  boms,
  documentProcessingEvidence,
  documentProcessingJobs,
  documents,
  drawingRevisions,
  takeoffImports,
  takeoffMappingProfiles,
  takeoffUnresolvedItems,
  users,
} from '@third-code-erp/database/schema'
import {
  DOCUMENT_PROCESSING_MAX_ITEMS,
  documentProcessingWorkerResponseSchema,
  type DocumentProcessingWorkerResponse,
} from '@third-code-erp/shared-types'
import {
  classifyBomLineKind,
  validateTakeoffRows,
  type StructuredTakeoffRow,
  type TakeoffValidationIssue,
} from '@third-code-erp/shared-types/bom'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import type { DatabaseTransaction } from '../database/database.service'
import type { ClaimedDocumentProcessingJob } from './document-processing.state'
import type { DocumentProcessingWorkerResult } from './document-processing.worker'

const CAD_SOURCE = 'cad-ai'
const CAD_MAPPING_NAME = 'cad-ai-v1'

function buildTakeoffImportKey(
  source: string,
  drawingRevisionKey: string,
  mappingName: string,
): string {
  return createHash('sha256')
    .update(`${source}\n${drawingRevisionKey}\n${mappingName}`)
    .digest('hex')
}

function buildCadTakeoffRows(
  evidence: DocumentProcessingWorkerResponse,
): StructuredTakeoffRow[] {
  return evidence.items.map((item, index) => ({
    sourceRowKey: item.code?.trim() || `cad-row-${index + 1}`,
    description: item.description.trim(),
    quantity: item.quantity,
    unit: item.unit.trim().toLowerCase(),
    division: null,
    location: null,
    itemNo: item.code?.trim() || null,
    notes: item.notes?.trim() || null,
    raw: {
      item_key: item.item_key,
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      recommended_unit_cost_cents: item.recommended_unit_cost_cents,
      notes: item.notes,
    },
  }))
}

function buildCadIssues(
  rows: ReadonlyArray<StructuredTakeoffRow>,
): TakeoffValidationIssue[] {
  const issues = validateTakeoffRows(rows)
  for (const row of rows) {
    issues.push({
      sourceRowKey: row.sourceRowKey,
      code: 'NO_CATALOG_MATCH',
      message: 'CAD evidence is unpriced; attach a DUPA before approval.',
    })
    if (classifyBomLineKind(row.unit).kind === 'material_line') {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'MATERIAL_PARENT_REQUIRED',
        message: 'Material candidates need an explicit parent work item before approval.',
      })
    }
  }
  return issues
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

    const takeoffRows = buildCadTakeoffRows(evidence)
    const issues = buildCadIssues(takeoffRows)
    const issuesByRow = new Map<string, TakeoffValidationIssue[]>()
    for (const issue of issues) {
      const rowIssues = issuesByRow.get(issue.sourceRowKey) ?? []
      rowIssues.push(issue)
      issuesByRow.set(issue.sourceRowKey, rowIssues)
    }
    const drawingRevisionKey = `document:${job.documentId}`
    const sourceKey = buildTakeoffImportKey(
      CAD_SOURCE,
      drawingRevisionKey,
      CAD_MAPPING_NAME,
    )
    const extractedAt = new Date()

    const [bom] = await transaction
      .insert(boms)
      .values({
        tenant_id: job.tenantId,
        project_id: document.projectId,
        created_by: job.createdBy,
        label: `CAD draft ${job.documentId.slice(0, 8)}`,
        status: 'draft',
        total_cost_cents: 0,
        tcv_cents: 0,
        gp_cents: 0,
        gp_margin_bps: 0,
        notes:
          `document-processing job:${job.jobId}; evidence:${evidenceId}; ` +
          `source_sha256:${evidence.source_sha256}; ` +
          'AI CAD evidence remains unpriced until a DUPA is attached.',
      })
      .returning({ id: boms.id })
    if (!bom) throw new Error('draft_bom_not_created')

    const [revision] = await transaction
      .insert(drawingRevisions)
      .values({
        tenant_id: job.tenantId,
        project_id: document.projectId,
        source: CAD_SOURCE,
        source_key: drawingRevisionKey,
        label: `CAD extraction - ${job.documentId}`,
        created_by: job.createdBy,
      })
      .onConflictDoUpdate({
        target: [
          drawingRevisions.tenant_id,
          drawingRevisions.project_id,
          drawingRevisions.source,
          drawingRevisions.source_key,
        ],
        set: { updated_at: extractedAt, label: `CAD extraction - ${job.documentId}` },
      })
      .returning({ id: drawingRevisions.id })
    if (!revision) throw new Error('draft_bom_drawing_revision_not_created')

    const [mappingProfile] = await transaction
      .insert(takeoffMappingProfiles)
      .values({
        tenant_id: job.tenantId,
        source: CAD_SOURCE,
        name: CAD_MAPPING_NAME,
        mapping: {
          sourceRowKey: 'cad.evidence.code-or-order',
          description: 'cad.evidence.description',
          quantity: 'cad.evidence.quantity',
          unit: 'cad.evidence.unit',
          division: 'manual assignment required',
        },
        created_by: job.createdBy,
        updated_by: job.createdBy,
      })
      .onConflictDoUpdate({
        target: [
          takeoffMappingProfiles.tenant_id,
          takeoffMappingProfiles.source,
          takeoffMappingProfiles.name,
        ],
        set: { updated_by: job.createdBy, updated_at: extractedAt },
      })
      .returning({ id: takeoffMappingProfiles.id })
    if (!mappingProfile) throw new Error('draft_bom_mapping_profile_not_created')

    const [takeoffImport] = await transaction
      .insert(takeoffImports)
      .values({
        tenant_id: job.tenantId,
        bom_id: bom.id,
        project_id: document.projectId,
        drawing_revision_id: revision.id,
        mapping_profile_id: mappingProfile.id,
        source: CAD_SOURCE,
        source_key: sourceKey,
        file_name: job.fileName,
        content_sha256: evidence.source_sha256,
        status: issues.length > 0 ? 'partially_resolved' : 'resolved',
        row_count: takeoffRows.length,
        imported_count: takeoffRows.length,
        unresolved_count: issues.length,
        created_by: job.createdBy,
        updated_by: job.createdBy,
      })
      .onConflictDoUpdate({
        target: [
          takeoffImports.tenant_id,
          takeoffImports.bom_id,
          takeoffImports.source,
          takeoffImports.source_key,
        ],
        set: {
          drawing_revision_id: revision.id,
          mapping_profile_id: mappingProfile.id,
          file_name: job.fileName,
          content_sha256: evidence.source_sha256,
          status: issues.length > 0 ? 'partially_resolved' : 'resolved',
          row_count: takeoffRows.length,
          imported_count: takeoffRows.length,
          unresolved_count: issues.length,
          updated_by: job.createdBy,
          updated_at: extractedAt,
        },
      })
      .returning({ id: takeoffImports.id })
    if (!takeoffImport) throw new Error('draft_bom_takeoff_import_not_created')

    await transaction
      .update(takeoffUnresolvedItems)
      .set({
        status: 'resolved',
        resolved_by: job.createdBy,
        resolved_at: extractedAt,
        updated_at: extractedAt,
      })
      .where(
        and(
          eq(takeoffUnresolvedItems.tenant_id, job.tenantId),
          eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
          eq(takeoffUnresolvedItems.status, 'pending'),
        ),
      )

    const sourceModel = `${evidence.producer.name}@${evidence.producer.version}`
    const rows: Array<{ id: string }> = []
    for (const [index, row] of takeoffRows.entries()) {
      const rowIssues = issuesByRow.get(row.sourceRowKey) ?? []
      const [line] = await transaction
        .insert(bomLineItems)
        .values({
          tenant_id: job.tenantId,
          bom_id: bom.id,
          sort_order: index,
          is_group: 0,
          kind: 'work_item',
          code: row.itemNo,
          description: row.description || `Unresolved CAD row ${row.sourceRowKey}`,
          unit: row.unit || null,
          quantity: row.quantity ?? 0,
          drawing_revision_id: revision.id,
          takeoff_import_id: takeoffImport.id,
          source_row_key: row.sourceRowKey,
          ai_drafted: true,
          source_model: sourceModel,
          extraction_timestamp: extractedAt,
          unit_rate_source: 'manual',
          classification_status: rowIssues.length > 0 ? 'review' : 'classified',
          classification_reason: rowIssues.length > 0
            ? rowIssues.map((issue) => issue.message).join(' ')
            : 'CAD evidence requires estimator review.',
          unit_cost_cents: 0,
          markup_bps: 0,
          line_total_cents: 0,
          notes:
            'AI-drafted CAD evidence; pricing requires DUPA.' +
            (row.notes ? ` ${row.notes}` : ''),
        })
        .onConflictDoUpdate({
          target: [
            bomLineItems.tenant_id,
            bomLineItems.takeoff_import_id,
            bomLineItems.source_row_key,
          ],
          set: {
            code: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.code} else excluded.code end`,
            description: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.description} else excluded.description end`,
            unit: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit} else excluded.unit end`,
            quantity: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.quantity} else excluded.quantity end`,
            drawing_revision_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.drawing_revision_id} else excluded.drawing_revision_id end`,
            ai_drafted: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.ai_drafted} else true end`,
            source_model: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.source_model} else excluded.source_model end`,
            extraction_timestamp: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.extraction_timestamp} else excluded.extraction_timestamp end`,
            classification_status: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_status} else excluded.classification_status end`,
            classification_reason: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_reason} else excluded.classification_reason end`,
            unit_rate_source: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_rate_source} else 'manual' end`,
            unit_cost_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_cost_cents} else 0 end`,
            markup_bps: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.markup_bps} else 0 end`,
            line_total_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.line_total_cents} else 0 end`,
            updated_at: extractedAt,
          },
        })
        .returning({ id: bomLineItems.id })
      if (!line) throw new Error(`draft_bom_line_not_created:${row.sourceRowKey}`)
      rows.push(line)

      for (const issue of rowIssues) {
        await transaction
          .insert(takeoffUnresolvedItems)
          .values({
            tenant_id: job.tenantId,
            takeoff_import_id: takeoffImport.id,
            bom_id: bom.id,
            bom_line_item_id: line.id,
            source_row_key: row.sourceRowKey,
            reason_code: issue.code,
            reason: issue.message,
            raw_payload: row.raw,
            status: 'pending',
            created_by: job.createdBy,
          })
          .onConflictDoUpdate({
            target: [
              takeoffUnresolvedItems.tenant_id,
              takeoffUnresolvedItems.takeoff_import_id,
              takeoffUnresolvedItems.source_row_key,
              takeoffUnresolvedItems.reason_code,
            ],
            set: {
              bom_line_item_id: line.id,
              reason: issue.message,
              raw_payload: row.raw,
              status: 'pending',
              resolved_by: null,
              resolved_at: null,
              updated_at: extractedAt,
            },
          })
      }
    }

    const [pending] = await transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(takeoffUnresolvedItems)
      .where(
        and(
          eq(takeoffUnresolvedItems.tenant_id, job.tenantId),
          eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
          eq(takeoffUnresolvedItems.status, 'pending'),
        ),
      )
    const unresolvedCount = pending?.count ?? 0

    await transaction
      .update(takeoffImports)
      .set({ unresolved_count: unresolvedCount, updated_at: extractedAt })
      .where(
        and(
          eq(takeoffImports.id, takeoffImport.id),
          eq(takeoffImports.tenant_id, job.tenantId),
        ),
      )

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
