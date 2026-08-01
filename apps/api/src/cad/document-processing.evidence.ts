import { Injectable } from '@nestjs/common'
import {
  documentProcessingEvidence,
  type DocumentProcessingEvidence as DocumentProcessingEvidenceRow,
} from '@third-code-erp/database/schema'
import {
  DOCUMENT_PROCESSING_MAX_ITEMS,
  DOCUMENT_PROCESSING_MAX_WARNINGS,
  documentProcessingWorkerResponseSchema,
  type DocumentProcessingWorkerResponse,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { DatabaseService } from '../database/database.service'
import type { ClaimedDocumentProcessingJob } from './document-processing.state'
import type { DocumentProcessingWorkerResult } from './document-processing.worker'

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function parseEvidence(
  job: ClaimedDocumentProcessingJob,
  result: DocumentProcessingWorkerResult
): DocumentProcessingWorkerResponse {
  const evidence = documentProcessingWorkerResponseSchema.parse(result.evidence)
  if (
    evidence.job_id !== job.jobId ||
    evidence.attempt !== job.attempt ||
    evidence.source_sha256 !== result.sourceSha256 ||
    evidence.producer.name !== result.producer.name ||
    evidence.producer.version !== result.producer.version
  ) {
    throw new Error('document_processing_evidence_context_mismatch')
  }
  if (evidence.items.length > DOCUMENT_PROCESSING_MAX_ITEMS) {
    throw new Error('document_processing_evidence_item_limit')
  }
  if (evidence.warnings.length > DOCUMENT_PROCESSING_MAX_WARNINGS) {
    throw new Error('document_processing_evidence_warning_limit')
  }
  return evidence
}

function sameEvidence(
  row: DocumentProcessingEvidenceRow,
  evidence: DocumentProcessingWorkerResponse
): boolean {
  return (
    row.source_sha256 === evidence.source_sha256 &&
    row.producer_name === evidence.producer.name &&
    row.producer_version === evidence.producer.version &&
    row.source_format === evidence.source_format &&
    row.parsed_format === evidence.parsed_format &&
    row.item_count === evidence.items.length &&
    canonicalJson(row.payload) === canonicalJson(evidence)
  )
}

/** Persists validated worker evidence before any derived ERP commit. */
@Injectable()
export class DocumentProcessingEvidenceService {
  constructor(private readonly database: DatabaseService) {}

  async persist(
    job: ClaimedDocumentProcessingJob,
    result: DocumentProcessingWorkerResult
  ): Promise<string> {
    const evidence = parseEvidence(job, result)
    return this.database.client.transaction(async (transaction) => {
      await transaction
        .insert(documentProcessingEvidence)
        .values({
          tenant_id: job.tenantId,
          job_id: job.jobId,
          document_id: job.documentId,
          project_id: job.projectId,
          attempt: job.attempt,
          source_sha256: evidence.source_sha256,
          producer_name: evidence.producer.name,
          producer_version: evidence.producer.version,
          source_format: evidence.source_format,
          parsed_format: evidence.parsed_format,
          item_count: evidence.items.length,
          warnings: evidence.warnings,
          payload: evidence,
        })
        .onConflictDoNothing({
          target: [
            documentProcessingEvidence.tenant_id,
            documentProcessingEvidence.job_id,
            documentProcessingEvidence.attempt,
          ],
        })

      const [row] = await transaction
        .select()
        .from(documentProcessingEvidence)
        .where(
          and(
            eq(documentProcessingEvidence.tenant_id, job.tenantId),
            eq(documentProcessingEvidence.job_id, job.jobId),
            eq(documentProcessingEvidence.attempt, job.attempt)
          )
        )
        .limit(1)
        .for('update')
      if (!row) {
        throw new Error('document_processing_evidence_not_created')
      }
      if (
        row.document_id !== job.documentId ||
        row.project_id !== job.projectId ||
        !sameEvidence(row, evidence)
      ) {
        throw new Error('document_processing_evidence_replay_mismatch')
      }
      return row.id
    })
  }
}
