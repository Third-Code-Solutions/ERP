import { Injectable } from '@nestjs/common'
import {
  documentProcessingJobs,
  documents,
  users,
} from '@third-code-erp/database/schema'
import { and, eq, inArray, lt, or } from 'drizzle-orm'
import {
  DOCUMENT_PROCESSING_MAX_ATTEMPTS,
  DOCUMENT_PROCESSING_MAX_ITEMS,
  DOCUMENT_PROCESSING_MAX_WARNINGS,
} from '@third-code-erp/shared-types'
import { DOCUMENT_PROCESSING_RECOVERY_BATCH_SIZE } from './document-processing.constants'
import { DatabaseService } from '../database/database.service'
import type { ErpRole } from '../auth/current-principal.decorator'

export interface ClaimedDocumentProcessingJob {
  jobId: string
  tenantId: string
  documentId: string
  projectId: string
  createdBy: string
  role: ErpRole
  email: string
  requestedFormat: string
  createDraftBom: boolean
  storagePath: string
  fileName: string
  attempt: number
}

function boundedWarnings(warnings: readonly string[]): string[] {
  return warnings
    .filter((warning) => typeof warning === 'string')
    .map((warning) => warning.slice(0, 500))
    .filter(Boolean)
    .slice(0, DOCUMENT_PROCESSING_MAX_WARNINGS)
}

function boundedFailureCode(code: string): string {
  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '_')
    .slice(0, 100)
  return normalized || 'processing_failed'
}

/** PostgreSQL-backed state machine. Redis delivery never becomes authority. */
@Injectable()
export class DocumentProcessingStateService {
  constructor(private readonly database: DatabaseService) {}

  async claim(jobId: string): Promise<ClaimedDocumentProcessingJob | null> {
    return this.database.client.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          jobId: documentProcessingJobs.id,
          tenantId: documentProcessingJobs.tenant_id,
          documentId: documentProcessingJobs.document_id,
          projectId: documentProcessingJobs.project_id,
          createdBy: documentProcessingJobs.created_by,
          requestedFormat: documentProcessingJobs.requested_format,
          createDraftBom: documentProcessingJobs.create_draft_bom,
          status: documentProcessingJobs.status,
          attemptCount: documentProcessingJobs.attempt_count,
          storagePath: documents.storage_path,
          fileName: documents.file_name,
          role: users.role,
          email: users.email,
        })
        .from(documentProcessingJobs)
        .innerJoin(
          documents,
          and(
            eq(documents.id, documentProcessingJobs.document_id),
            eq(documents.tenant_id, documentProcessingJobs.tenant_id)
          )
        )
        .innerJoin(
          users,
          and(
            eq(users.id, documentProcessingJobs.created_by),
            eq(users.tenant_id, documentProcessingJobs.tenant_id)
          )
        )
        .where(eq(documentProcessingJobs.id, jobId))
        .limit(1)
        .for('update')

      if (!row) return null
      if (row.status === 'succeeded' || row.status === 'failed') return null

      if (row.attemptCount >= DOCUMENT_PROCESSING_MAX_ATTEMPTS) {
        await transaction
          .update(documentProcessingJobs)
          .set({
            status: 'failed',
            failure_code: 'attempt_limit',
            completed_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(documentProcessingJobs.id, row.jobId))
        return null
      }

      const attempt = row.attemptCount + 1
      const [claimed] = await transaction
        .update(documentProcessingJobs)
        .set({
          status: 'processing',
          attempt_count: attempt,
          failure_code: null,
          completed_at: null,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(documentProcessingJobs.id, row.jobId),
            or(
              eq(documentProcessingJobs.status, 'queued'),
              eq(documentProcessingJobs.status, 'processing')
            )
          )
        )
        .returning({ id: documentProcessingJobs.id })
      if (!claimed) return null

      return {
        jobId: row.jobId,
        tenantId: row.tenantId,
        documentId: row.documentId,
        projectId: row.projectId,
        createdBy: row.createdBy,
        role: row.role as ErpRole,
        email: row.email,
        requestedFormat: row.requestedFormat,
        createDraftBom: row.createDraftBom,
        storagePath: row.storagePath,
        fileName: row.fileName,
        attempt,
      }
    })
  }

  async succeed(
    jobId: string,
    scopeItemsCreated: number,
    warnings: readonly string[] = [],
    draftBomId?: string | null
  ): Promise<boolean> {
    if (
      !Number.isInteger(scopeItemsCreated) ||
      scopeItemsCreated < 0 ||
      scopeItemsCreated > DOCUMENT_PROCESSING_MAX_ITEMS
    ) {
      throw new Error('scope_item_count_out_of_bounds')
    }
    const update = {
      status: 'succeeded' as const,
      scope_item_count: scopeItemsCreated,
      warnings: boundedWarnings(warnings),
      failure_code: null,
      completed_at: new Date(),
      updated_at: new Date(),
      ...(draftBomId === undefined ? {} : { draft_bom_id: draftBomId }),
    }
    const [completed] = await this.database.client
      .update(documentProcessingJobs)
      .set(update)
      .where(
        and(
          eq(documentProcessingJobs.id, jobId),
          eq(documentProcessingJobs.status, 'processing')
        )
      )
      .returning({ id: documentProcessingJobs.id })
    return Boolean(completed)
  }

  async fail(
    jobId: string,
    failureCode: string,
    warnings: readonly string[] = []
  ): Promise<boolean> {
    const [failed] = await this.database.client
      .update(documentProcessingJobs)
      .set({
        status: 'failed',
        failure_code: boundedFailureCode(failureCode),
        warnings: boundedWarnings(warnings),
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(documentProcessingJobs.id, jobId),
          eq(documentProcessingJobs.status, 'processing')
        )
      )
      .returning({ id: documentProcessingJobs.id })
    return Boolean(failed)
  }

  /**
   * Returns queued work that must be present in Redis, while moving stale
   * processing claims back to queued. PostgreSQL remains authoritative when
   * Redis has lost transport jobs.
   */
  async recoverableJobIds(
    before: Date,
    tenantIds: readonly string[]
  ): Promise<string[]> {
    const scopedTenantIds = [...new Set(tenantIds)]
    if (scopedTenantIds.length === 0) return []

    return this.database.client.transaction(async (transaction) => {
      await transaction
        .update(documentProcessingJobs)
        .set({
          status: 'queued',
          completed_at: null,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(documentProcessingJobs.status, 'processing'),
            lt(documentProcessingJobs.updated_at, before),
            inArray(documentProcessingJobs.tenant_id, scopedTenantIds)
          )
        )

      const rows = await transaction
        .select({ id: documentProcessingJobs.id })
        .from(documentProcessingJobs)
        .where(
          and(
            eq(documentProcessingJobs.status, 'queued'),
            inArray(documentProcessingJobs.tenant_id, scopedTenantIds)
          )
        )
        .orderBy(documentProcessingJobs.updated_at)
        .limit(DOCUMENT_PROCESSING_RECOVERY_BATCH_SIZE)

      return rows.map((row) => row.id)
    })
  }

  async requeueStale(before: Date): Promise<number> {
    const rows = await this.database.client
      .update(documentProcessingJobs)
      .set({
        status: 'queued',
        completed_at: null,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(documentProcessingJobs.status, 'processing'),
          lt(documentProcessingJobs.updated_at, before)
        )
      )
      .returning({ id: documentProcessingJobs.id })
    return rows.length
  }
}
