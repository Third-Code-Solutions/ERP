import { createHash, randomUUID } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documentUploadReservations,
  projects,
} from '@third-code-erp/database'
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm'

import { AuditService } from '../audit/audit.service'
import type { Environment } from '../config/environment'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import {
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_CLAIM_STALE_MINUTES,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_RETRY_BASE_MINUTES,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_RETRY_MAX_MINUTES,
} from './document-upload-reservation-cleanup.constants'
import { DocumentUploadReservationStorage } from './document-upload-reservation.storage'

const STORAGE_REMOVE_FAILED = 'STORAGE_REMOVE_FAILED'

type CleanupClaim = Readonly<{
  id: string
  tenantId: string
  projectId: string
  storagePath: string
  attempt: number
}>

export type DocumentUploadReservationCleanupResult = Readonly<{
  status: 'ignored' | 'succeeded'
  expired: number
  claimed: number
  removed: number
  failed: number
  cleanupRetries: number
  exhausted: number
  oldestExpiredAgeSeconds: number
}>

function sha256Ids(ids: readonly string[]): string {
  return createHash('sha256').update([...ids].sort().join(':')).digest('hex')
}

@Injectable()
export class DocumentUploadReservationCleanupService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocumentUploadReservationStorage)
    private readonly storage: DocumentUploadReservationStorage
  ) {}

  scopedTenantIds(): string[] {
    if (
      this.config.get('ERP_DOCUMENT_UPLOAD_RESERVATION_CLEANUP_ENABLED', {
        infer: true,
      }) !== true
    ) {
      return []
    }
    return [
      ...new Set(
        this.config.get(
          'ERP_DOCUMENT_UPLOAD_RESERVATION_CLEANUP_TENANT_IDS',
          { infer: true }
        )
      ),
    ]
  }

  async runBatch(
    traceId: string = randomUUID()
  ): Promise<DocumentUploadReservationCleanupResult> {
    const tenantIds = this.scopedTenantIds()
    if (tenantIds.length === 0) {
      return {
        status: 'ignored',
        expired: 0,
        claimed: 0,
        removed: 0,
        failed: 0,
        cleanupRetries: 0,
        exhausted: 0,
        oldestExpiredAgeSeconds: 0,
      }
    }

    const expiry = await this.expireDue(tenantIds, traceId)

    let claimed = 0
    let removed = 0
    let failed = 0
    let cleanupRetries = 0
    let exhausted = 0
    while (claimed < DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE) {
      const claim = await this.claimNext(tenantIds)
      if (!claim) break
      claimed += 1
      if (claim.attempt > 1) cleanupRetries += 1
      try {
        await this.storage.remove(claim.storagePath)
      } catch {
        await this.recordFailure(claim, traceId)
        failed += 1
        if (
          claim.attempt >= DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS
        ) {
          exhausted += 1
        }
        continue
      }
      await this.recordSuccess(claim, traceId)
      removed += 1
    }

    return {
      status: 'succeeded',
      expired: expiry.ids.length,
      claimed,
      removed,
      failed,
      cleanupRetries,
      exhausted,
      oldestExpiredAgeSeconds: expiry.oldestAgeSeconds,
    }
  }

  private async expireDue(
    tenantIds: readonly string[],
    traceId: string
  ): Promise<{
    ids: readonly string[]
    oldestAgeSeconds: number
  }> {
    return this.database.client.transaction(async (transaction) => {
      const candidates = await transaction
        .select({
          id: documentUploadReservations.id,
          tenantId: documentUploadReservations.tenant_id,
          projectId: documentUploadReservations.project_id,
          expiresAt: documentUploadReservations.expires_at,
        })
        .from(documentUploadReservations)
        .where(
          and(
            inArray(documentUploadReservations.tenant_id, tenantIds),
            eq(documentUploadReservations.state, 'active'),
            lte(documentUploadReservations.expires_at, sql`now()`)
          )
        )
        .orderBy(
          asc(documentUploadReservations.expires_at),
          asc(documentUploadReservations.tenant_id),
          asc(documentUploadReservations.id)
        )
        .limit(DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE)
      if (candidates.length === 0) {
        return { ids: [], oldestAgeSeconds: 0 }
      }

      const projectIdsByTenant = new Map<string, Set<string>>()
      for (const { tenantId, projectId } of candidates) {
        const projectIds = projectIdsByTenant.get(tenantId) ?? new Set<string>()
        projectIds.add(projectId)
        projectIdsByTenant.set(tenantId, projectIds)
      }
      for (const tenantId of [...projectIdsByTenant.keys()].sort()) {
        await transaction
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.tenant_id, tenantId),
              inArray(projects.id, [
                ...(projectIdsByTenant.get(tenantId) ?? []),
              ].sort())
            )
          )
          .orderBy(asc(projects.id))
          .for('update')
      }

      const expired = await transaction
        .update(documentUploadReservations)
        .set({
          state: 'expired',
          terminal_at: sql`now()`,
          updated_at: sql`now()`,
        })
        .where(
          and(
            inArray(documentUploadReservations.tenant_id, tenantIds),
            inArray(
              documentUploadReservations.id,
              candidates.map(({ id }) => id)
            ),
            eq(documentUploadReservations.state, 'active'),
            lte(documentUploadReservations.expires_at, sql`now()`)
          )
        )
        .returning({
          id: documentUploadReservations.id,
          tenantId: documentUploadReservations.tenant_id,
        })
      if (expired.length === 0) {
        return { ids: [], oldestAgeSeconds: 0 }
      }

      const ids = expired.map(({ id }) => id)
      for (const tenantId of [
        ...new Set(expired.map(({ tenantId }) => tenantId)),
      ].sort()) {
        const tenantReservationIds = expired
          .filter((row) => row.tenantId === tenantId)
          .map(({ id }) => id)
        await this.audit.writeSemantic(transaction, {
          tenantId,
          actorId: null,
          entityType: 'document_upload_reservation_batch',
          entityId: tenantId,
          action: 'update',
          diff: {
            trace_id: traceId,
            operation: 'cleanup_expire_due',
            outcome: 'expired',
            reservation_count: tenantReservationIds.length,
            reservation_ids_hash: sha256Ids(tenantReservationIds),
          },
        })
      }
      const oldestExpiryMs = Math.min(
        ...candidates
          .filter(({ id }) => ids.includes(id))
          .map(({ expiresAt }) => expiresAt.getTime())
      )
      return {
        ids,
        oldestAgeSeconds: Math.max(
          0,
          Math.floor((Date.now() - oldestExpiryMs) / 1_000)
        ),
      }
    })
  }

  private async claimNext(
    tenantIds: readonly string[]
  ): Promise<CleanupClaim | null> {
    return this.database.client.transaction(async (transaction) => {
      const candidates = await transaction
        .select({ id: documentUploadReservations.id })
        .from(documentUploadReservations)
        .where(
          and(
            inArray(documentUploadReservations.tenant_id, tenantIds),
            inArray(documentUploadReservations.state, ['released', 'expired']),
            isNull(documentUploadReservations.cleanup_completed_at),
            or(
              isNull(documentUploadReservations.cleanup_last_error_code),
              lt(
                documentUploadReservations.cleanup_attempt_count,
                DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS
              )
            ),
            or(
              isNull(documentUploadReservations.cleanup_claimed_at),
              and(
                lt(
                  documentUploadReservations.cleanup_claimed_at,
                  sql`now() - ${DOCUMENT_UPLOAD_RESERVATION_CLEANUP_CLAIM_STALE_MINUTES} * interval '1 minute'`
                ),
                or(
                  isNull(documentUploadReservations.cleanup_last_error_code),
                  lte(
                    documentUploadReservations.cleanup_claimed_at,
                    sql`now() - least(
                      ${DOCUMENT_UPLOAD_RESERVATION_CLEANUP_RETRY_MAX_MINUTES},
                      ${DOCUMENT_UPLOAD_RESERVATION_CLEANUP_RETRY_BASE_MINUTES}
                        * power(
                          2,
                          greatest(${documentUploadReservations.cleanup_attempt_count} - 1, 0)
                        )
                    ) * interval '1 minute'`
                  )
                )
              )
            )
          )
        )
        .orderBy(
          asc(documentUploadReservations.cleanup_attempt_count),
          asc(documentUploadReservations.terminal_at),
          asc(documentUploadReservations.tenant_id),
          asc(documentUploadReservations.id)
        )
        .limit(1)
        .for('update', { skipLocked: true })
      const candidate = candidates[0]
      if (!candidate) return null

      const [claimed] = await transaction
        .update(documentUploadReservations)
        .set({
          cleanup_attempt_count: sql`${documentUploadReservations.cleanup_attempt_count} + 1`,
          cleanup_claimed_at: sql`now()`,
          cleanup_last_error_code: null,
          updated_at: sql`now()`,
        })
        .where(
          and(
            eq(documentUploadReservations.id, candidate.id),
            inArray(documentUploadReservations.tenant_id, tenantIds),
            inArray(documentUploadReservations.state, ['released', 'expired']),
            isNull(documentUploadReservations.cleanup_completed_at),
            or(
              isNull(documentUploadReservations.cleanup_last_error_code),
              lt(
                documentUploadReservations.cleanup_attempt_count,
                DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS
              )
            )
          )
        )
        .returning({
          id: documentUploadReservations.id,
          tenantId: documentUploadReservations.tenant_id,
          projectId: documentUploadReservations.project_id,
          storagePath: documentUploadReservations.storage_path,
          attempt: documentUploadReservations.cleanup_attempt_count,
        })
      return claimed ?? null
    })
  }

  private async recordSuccess(
    claim: CleanupClaim,
    traceId: string
  ): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      const updated = await this.updateClaim(transaction, claim, true)
      if (!updated) throw new Error('document_upload_cleanup_claim_lost')
      await this.audit.writeSemantic(transaction, {
        tenantId: claim.tenantId,
        actorId: null,
        entityType: 'document_upload_reservation',
        entityId: claim.id,
        action: 'update',
        diff: {
          trace_id: traceId,
          operation: 'cleanup',
          outcome: 'succeeded',
          attempt: claim.attempt,
        },
      })
    })
  }

  private async recordFailure(
    claim: CleanupClaim,
    traceId: string
  ): Promise<void> {
    await this.database.client.transaction(async (transaction) => {
      const updated = await this.updateClaim(transaction, claim, false)
      if (!updated) throw new Error('document_upload_cleanup_claim_lost')
      await this.audit.writeSemantic(transaction, {
        tenantId: claim.tenantId,
        actorId: null,
        entityType: 'document_upload_reservation',
        entityId: claim.id,
        action: 'update',
        diff: {
          trace_id: traceId,
          operation: 'cleanup',
          outcome: 'failed',
          error_code: STORAGE_REMOVE_FAILED,
          attempt: claim.attempt,
          retry_state:
            claim.attempt >= DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS
              ? 'exhausted'
              : 'scheduled',
        },
      })
    })
  }

  private async updateClaim(
    transaction: DatabaseTransaction,
    claim: CleanupClaim,
    succeeded: boolean
  ): Promise<boolean> {
    const [updated] = await transaction
      .update(documentUploadReservations)
      .set(
        succeeded
          ? {
              cleanup_completed_at: sql`now()`,
              cleanup_last_error_code: null,
              updated_at: sql`now()`,
            }
          : {
              cleanup_last_error_code: STORAGE_REMOVE_FAILED,
              updated_at: sql`now()`,
            }
      )
      .where(
        and(
          eq(documentUploadReservations.id, claim.id),
          eq(documentUploadReservations.tenant_id, claim.tenantId),
          eq(documentUploadReservations.project_id, claim.projectId),
          inArray(documentUploadReservations.state, ['released', 'expired']),
          eq(
            documentUploadReservations.cleanup_attempt_count,
            claim.attempt
          ),
          isNull(documentUploadReservations.cleanup_completed_at)
        )
      )
      .returning({ id: documentUploadReservations.id })
    return Boolean(updated)
  }
}
