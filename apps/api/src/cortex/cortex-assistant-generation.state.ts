import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  cortexAssistantGenerationJobs,
  cortexAssistantTurnRequests,
  cortexConversationTurnRequests,
  cortexConversations,
  cortexMessages,
  cortexNodes,
  users,
} from '@third-code-erp/database'
import {
  CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS,
  cortexAssistantGenerationStatusSchema,
  cortexGraphRefTableMatchesType,
  isCortexGraphRefTable,
  redactCortexText,
  type CortexAssistantProviderCircuitAlertEvent,
  type CortexAssistantGenerationStartCommand,
  type CortexAssistantGenerationStatus,
} from '@third-code-erp/shared-types'
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  or,
} from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import {
  CORTEX_ASSISTANT_GENERATION_LEASE_MS,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_BATCH_SIZE,
} from './cortex-assistant-generation.constants'
import { CortexAssistantProviderBudgetService } from './cortex-assistant-provider-budget.service'
import { cortexSearchNodeTypeScope } from './cortex-search-scope'

interface GenerationJobRow {
  id: string
  requestId: string
  status: string
  attemptCount: number
  failureCode: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ClaimedCortexAssistantGenerationJob {
  jobId: string
  requestId: string
  attemptNumber: number
  tenantId: string
  userId: string
  claimTokenHash: string
  question: string
  evidence: Array<{
    nodeId: string
    nodeType: string
    title: string | null
    summary: string | null
  }>
}

const NON_RETRYABLE_FAILURES = new Set([
  'cancelled_by_user',
  'claim_lease_expired',
  'claim_fence_changed',
  'permission_revoked',
  'conversation_scope_revoked',
  'official_user_turn_missing',
  'provider_execution_disabled',
  'provider_adapter_unavailable',
  'provider_plan_invalid',
  'provider_budget_disabled',
  'provider_budget_policy_unavailable',
  'provider_request_budget_exceeded',
  'provider_daily_budget_exceeded',
  'provider_attempt_not_found',
  'provider_attempt_not_claimed',
  'provider_attempt_changed',
  'provider_attempt_state_conflict',
  'provider_settlement_budget_exceeded',
  'provider_dispatch_replay',
  'provider_attempt_terminal',
  'provider_request_timeout',
  'provider_rate_limited',
  'provider_request_rejected',
  'provider_request_failed',
  'provider_response_invalid',
  'provider_outcome_unknown',
  'provider_circuit_open',
  'provider_circuit_probe_in_progress',
])

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function boundedFailureCode(code: string): string {
  const normalized = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '_')
    .slice(0, 100)
  return normalized || 'assistant_generation_failed'
}

function toStatus(row: GenerationJobRow): CortexAssistantGenerationStatus {
  const failureCode = row.failureCode
  return cortexAssistantGenerationStatusSchema.parse({
    jobId: row.id,
    requestId: row.requestId,
    status: row.status,
    attemptCount: row.attemptCount,
    failureCode,
    retryable:
      (row.status === 'failed' || row.status === 'cancelled') &&
      row.attemptCount < CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS &&
      !NON_RETRYABLE_FAILURES.has(failureCode ?? ''),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

@Injectable()
export class CortexAssistantGenerationStateService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(AuditService)
    private readonly audit: AuditService,
    @Inject(CortexAssistantProviderBudgetService)
    private readonly providerBudget: CortexAssistantProviderBudgetService
  ) {}

  async start(
    command: CortexAssistantGenerationStartCommand,
    principal: ErpPrincipal,
    idempotencyKey: string
  ): Promise<{ status: CortexAssistantGenerationStatus; enqueue: boolean }> {
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.lockPrincipal(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [request] = await transaction
        .select({
          id: cortexAssistantTurnRequests.id,
          state: cortexAssistantTurnRequests.state,
          claimTokenHash: cortexAssistantTurnRequests.claim_token_hash,
          leaseExpiresAt: cortexAssistantTurnRequests.lease_expires_at,
        })
        .from(cortexAssistantTurnRequests)
        .where(
          and(
            eq(cortexAssistantTurnRequests.id, command.requestId),
            eq(cortexAssistantTurnRequests.tenant_id, authorizedPrincipal.tenantId),
            eq(cortexAssistantTurnRequests.user_id, authorizedPrincipal.userId),
            eq(cortexAssistantTurnRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')
      if (!request) throw new NotFoundException('Assistant generation not found')

      const claimTokenHash = sha256(command.claimToken)
      const now = new Date()
      if (
        request.state !== 'processing' ||
        request.claimTokenHash !== claimTokenHash ||
        !request.leaseExpiresAt ||
        request.leaseExpiresAt.getTime() <= now.getTime()
      ) {
        throw new ConflictException(
          'Assistant generation claim is stale or invalid'
        )
      }

      await transaction
        .update(cortexAssistantTurnRequests)
        .set({
          lease_expires_at: new Date(
            Math.max(
              request.leaseExpiresAt.getTime(),
              now.getTime() + CORTEX_ASSISTANT_GENERATION_LEASE_MS
            )
          ),
        })
        .where(eq(cortexAssistantTurnRequests.id, request.id))

      const [inserted] = await transaction
        .insert(cortexAssistantGenerationJobs)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          user_id: authorizedPrincipal.userId,
          request_id: request.id,
          claim_token_hash: claimTokenHash,
        })
        .onConflictDoNothing()
        .returning({ id: cortexAssistantGenerationJobs.id })

      let [job] = await transaction
        .select(this.jobSelection())
        .from(cortexAssistantGenerationJobs)
        .where(
          and(
            eq(
              cortexAssistantGenerationJobs.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(cortexAssistantGenerationJobs.request_id, request.id)
          )
        )
        .limit(1)
        .for('update')
      if (!job) throw new Error('Assistant generation job was not created')

      let enqueue = Boolean(inserted)
      if (
        !inserted &&
        (job.status === 'failed' || job.status === 'cancelled') &&
        job.attemptCount < CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS
      ) {
        const [requeued] = await transaction
          .update(cortexAssistantGenerationJobs)
          .set({
            claim_token_hash: claimTokenHash,
            status: 'queued',
            failure_code: null,
            completed_at: null,
            updated_at: now,
          })
          .where(eq(cortexAssistantGenerationJobs.id, job.id))
          .returning(this.jobSelection())
        if (!requeued) throw new Error('Assistant generation job was not retried')
        job = requeued
        enqueue = true
      } else if (job.status !== 'succeeded' && job.claimTokenHash !== claimTokenHash) {
        throw new ConflictException('Assistant generation job claim changed')
      }

      if (enqueue) {
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'cortex_assistant_generation_job',
          entityId: job.id,
          action: 'update',
          diff: {
            assistant_generation_job_id: job.id,
            assistant_generation_job_state: 'queued',
            retry_attempts_used: job.attemptCount,
          },
        })
      }
      return { status: toStatus(job), enqueue }
    })
  }

  async status(
    jobId: string,
    principal: ErpPrincipal
  ): Promise<CortexAssistantGenerationStatus> {
    return this.database.client.transaction(async (transaction) => {
      await this.lockPrincipal(transaction, principal)
      const [job] = await transaction
        .select(this.jobSelection())
        .from(cortexAssistantGenerationJobs)
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, jobId),
            eq(cortexAssistantGenerationJobs.tenant_id, principal.tenantId),
            eq(cortexAssistantGenerationJobs.user_id, principal.userId)
          )
        )
        .limit(1)
      if (!job) throw new NotFoundException('Assistant generation job not found')
      return toStatus(job)
    })
  }

  async cancel(
    jobId: string,
    principal: ErpPrincipal
  ): Promise<CortexAssistantGenerationStatus> {
    let alertEvents: CortexAssistantProviderCircuitAlertEvent[] = []
    const status = await this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.lockPrincipal(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      let [job] = await transaction
        .select(this.jobSelection())
        .from(cortexAssistantGenerationJobs)
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, jobId),
            eq(
              cortexAssistantGenerationJobs.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(cortexAssistantGenerationJobs.user_id, authorizedPrincipal.userId)
          )
        )
        .limit(1)
        .for('update')
      if (!job) throw new NotFoundException('Assistant generation job not found')
      if (job.status === 'queued' || job.status === 'processing') {
        const now = new Date()
        const [cancelled] = await transaction
          .update(cortexAssistantGenerationJobs)
          .set({
            status: 'cancelled',
            failure_code: 'cancelled_by_user',
            completed_at: now,
            updated_at: now,
          })
          .where(eq(cortexAssistantGenerationJobs.id, job.id))
          .returning(this.jobSelection())
        if (!cancelled) throw new Error('Assistant generation job was not cancelled')
        job = cancelled
        await transaction
          .update(cortexAssistantTurnRequests)
          .set({ lease_expires_at: now })
          .where(
            and(
              eq(cortexAssistantTurnRequests.id, job.requestId),
              eq(cortexAssistantTurnRequests.state, 'processing'),
              eq(
                cortexAssistantTurnRequests.claim_token_hash,
                job.claimTokenHash
              )
            )
          )
        alertEvents = await this.providerBudget.reconcileGenerationJobWithinWithAlerts(
          transaction,
          job.id,
          'cancelled'
        )
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'cortex_assistant_generation_job',
          entityId: job.id,
          action: 'update',
          diff: {
            assistant_generation_job_id: job.id,
            assistant_generation_job_state: 'cancelled',
          },
        })
      }
      return toStatus(job)
    })
    await this.providerBudget.enqueueCircuitAlertEventsAfterCommit(alertEvents)
    return status
  }

  async claim(
    jobId: string
  ): Promise<ClaimedCortexAssistantGenerationJob | null> {
    let alertEvents: CortexAssistantProviderCircuitAlertEvent[] = []
    const claimed = await this.database.client.transaction(async (transaction) => {
      const [row] = await transaction
        .select({
          jobId: cortexAssistantGenerationJobs.id,
          jobStatus: cortexAssistantGenerationJobs.status,
          attempts: cortexAssistantGenerationJobs.attempt_count,
          jobClaimTokenHash: cortexAssistantGenerationJobs.claim_token_hash,
          requestId: cortexAssistantTurnRequests.id,
          requestState: cortexAssistantTurnRequests.state,
          requestClaimTokenHash: cortexAssistantTurnRequests.claim_token_hash,
          leaseExpiresAt: cortexAssistantTurnRequests.lease_expires_at,
          tenantId: cortexAssistantTurnRequests.tenant_id,
          userId: cortexAssistantTurnRequests.user_id,
          conversationId: cortexAssistantTurnRequests.conversation_id,
          userMessageId: cortexAssistantTurnRequests.user_message_id,
          role: users.role,
          email: users.email,
          question: cortexMessages.content,
          contextRefTable: cortexConversations.context_ref_table,
          contextRefId: cortexConversations.context_ref_id,
        })
        .from(cortexAssistantGenerationJobs)
        .innerJoin(
          cortexAssistantTurnRequests,
          and(
            eq(
              cortexAssistantTurnRequests.id,
              cortexAssistantGenerationJobs.request_id
            ),
            eq(
              cortexAssistantTurnRequests.tenant_id,
              cortexAssistantGenerationJobs.tenant_id
            )
          )
        )
        .innerJoin(
          users,
          and(
            eq(users.id, cortexAssistantGenerationJobs.user_id),
            eq(users.tenant_id, cortexAssistantGenerationJobs.tenant_id)
          )
        )
        .innerJoin(
          cortexMessages,
          and(
            eq(cortexMessages.id, cortexAssistantTurnRequests.user_message_id),
            eq(cortexMessages.tenant_id, cortexAssistantTurnRequests.tenant_id),
            eq(cortexMessages.role, 'user')
          )
        )
        .innerJoin(
          cortexConversations,
          and(
            eq(cortexConversations.id, cortexAssistantTurnRequests.conversation_id),
            eq(cortexConversations.tenant_id, cortexAssistantTurnRequests.tenant_id),
            eq(cortexConversations.user_id, cortexAssistantTurnRequests.user_id)
          )
        )
        .where(eq(cortexAssistantGenerationJobs.id, jobId))
        .limit(1)
        .for('update')
      if (!row || row.jobStatus !== 'queued') return null
      if (row.attempts >= CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS) {
        alertEvents.push(
          ...(await this.failWithin(transaction, row.jobId, 'attempt_limit'))
        )
        return null
      }
      const role = row.role as ErpRole
      if (!roleHasCapability(role, 'cortex.search')) {
        alertEvents.push(
          ...(await this.failWithin(transaction, row.jobId, 'permission_revoked'))
        )
        return null
      }
      if (
        row.requestState !== 'processing' ||
        !row.requestClaimTokenHash ||
        row.requestClaimTokenHash !== row.jobClaimTokenHash
      ) {
        alertEvents.push(
          ...(await this.failWithin(transaction, row.jobId, 'claim_fence_changed'))
        )
        return null
      }
      if (!row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= Date.now()) {
        alertEvents.push(
          ...(await this.failWithin(transaction, row.jobId, 'claim_lease_expired'))
        )
        return null
      }
      const [officialTurn] = await transaction
        .select({ id: cortexConversationTurnRequests.id })
        .from(cortexConversationTurnRequests)
        .where(
          and(
            eq(cortexConversationTurnRequests.tenant_id, row.tenantId),
            eq(cortexConversationTurnRequests.user_id, row.userId),
            eq(
              cortexConversationTurnRequests.conversation_id,
              row.conversationId
            ),
            eq(cortexConversationTurnRequests.message_id, row.userMessageId),
            eq(cortexConversationTurnRequests.state, 'succeeded')
          )
        )
        .limit(1)
        .for('share')
      if (!officialTurn) {
        alertEvents.push(
          ...(await this.failWithin(
            transaction,
            row.jobId,
            'official_user_turn_missing'
          ))
        )
        return null
      }

      const scope = cortexSearchNodeTypeScope(role)
      if (row.contextRefTable || row.contextRefId) {
        if (
          !row.contextRefTable ||
          !row.contextRefId ||
          !isCortexGraphRefTable(row.contextRefTable)
        ) {
          alertEvents.push(
            ...(await this.failWithin(
              transaction,
              row.jobId,
              'conversation_scope_revoked'
            ))
          )
          return null
        }
        const [contextNode] = await transaction
          .select({ nodeType: cortexNodes.node_type })
          .from(cortexNodes)
          .where(
            and(
              eq(cortexNodes.tenant_id, row.tenantId),
              eq(cortexNodes.ref_table, row.contextRefTable),
              eq(cortexNodes.ref_id, row.contextRefId),
              isNull(cortexNodes.valid_to)
            )
          )
          .orderBy(desc(cortexNodes.recorded_at))
          .limit(1)
          .for('share')
        if (
          !contextNode ||
          !cortexGraphRefTableMatchesType(
            row.contextRefTable,
            contextNode.nodeType
          ) ||
          (scope !== null && !scope.includes(contextNode.nodeType))
        ) {
          alertEvents.push(
            ...(await this.failWithin(
              transaction,
              row.jobId,
              'conversation_scope_revoked'
            ))
          )
          return null
        }
      }

      const question = redactCortexText(row.question).slice(0, 20_000)
      const terms = question
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter((term) => term.length >= 3)
        .slice(0, 8)
      const typeFilter =
        scope === null
          ? undefined
          : inArray(
              cortexNodes.node_type,
              scope as Array<(typeof cortexNodes.node_type.enumValues)[number]>
            )
      const termConditions = terms.map((term) =>
        or(
          ilike(cortexNodes.title, `%${term.replace(/[\\%_]/g, '\\$&')}%`),
          ilike(cortexNodes.summary, `%${term.replace(/[\\%_]/g, '\\$&')}%`)
        )
      )
      const selectEvidence = () =>
        transaction
          .select({
            nodeId: cortexNodes.id,
            nodeType: cortexNodes.node_type,
            title: cortexNodes.title,
            summary: cortexNodes.summary,
          })
          .from(cortexNodes)
      let evidence = termConditions.length
        ? await selectEvidence()
            .where(
              and(
                eq(cortexNodes.tenant_id, row.tenantId),
                isNull(cortexNodes.valid_to),
                typeFilter,
                or(...termConditions)
              )
            )
            .orderBy(desc(cortexNodes.recorded_at))
            .limit(12)
        : []
      if (evidence.length === 0) {
        evidence = await selectEvidence()
          .where(
            and(
              eq(cortexNodes.tenant_id, row.tenantId),
              isNull(cortexNodes.valid_to),
              typeFilter
            )
          )
          .orderBy(desc(cortexNodes.recorded_at))
          .limit(12)
      }

      const now = new Date()
      const [claimed] = await transaction
        .update(cortexAssistantGenerationJobs)
        .set({
          status: 'processing',
          attempt_count: row.attempts + 1,
          failure_code: null,
          completed_at: null,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, row.jobId),
            eq(cortexAssistantGenerationJobs.status, 'queued')
          )
        )
        .returning({ id: cortexAssistantGenerationJobs.id })
      if (!claimed) return null
      return {
        jobId: row.jobId,
        requestId: row.requestId,
        attemptNumber: row.attempts + 1,
        tenantId: row.tenantId,
        userId: row.userId,
        claimTokenHash: row.jobClaimTokenHash,
        question,
        evidence: evidence.map((item) => ({
          nodeId: item.nodeId,
          nodeType: item.nodeType,
          title: item.title ? redactCortexText(item.title).slice(0, 500) : null,
          summary: item.summary
            ? redactCortexText(item.summary).slice(0, 4_000)
            : null,
        })),
      }
    })
    await this.providerBudget.enqueueCircuitAlertEventsAfterCommit(alertEvents)
    return claimed
  }

  async retryOrFail(
    jobId: string,
    claimTokenHash: string,
    failureCode: string
  ): Promise<void> {
    let alertEvents: CortexAssistantProviderCircuitAlertEvent[] = []
    await this.database.client.transaction(async (transaction) => {
      const [job] = await transaction
        .select({
          attemptCount: cortexAssistantGenerationJobs.attempt_count,
          requestId: cortexAssistantGenerationJobs.request_id,
        })
        .from(cortexAssistantGenerationJobs)
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, jobId),
            eq(cortexAssistantGenerationJobs.status, 'processing'),
            eq(
              cortexAssistantGenerationJobs.claim_token_hash,
              claimTokenHash
            )
          )
        )
        .limit(1)
        .for('update')
      if (!job) return
      const terminal =
        job.attemptCount >= CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS
      alertEvents = await this.providerBudget.reconcileGenerationJobWithinWithAlerts(
        transaction,
        jobId,
        terminal ? 'failed' : 'retry'
      )
      const now = new Date()
      await transaction
        .update(cortexAssistantGenerationJobs)
        .set({
          status: terminal ? 'failed' : 'queued',
          failure_code: terminal ? boundedFailureCode(failureCode) : null,
          completed_at: terminal ? now : null,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, jobId),
            eq(
              cortexAssistantGenerationJobs.claim_token_hash,
              claimTokenHash
            ),
            eq(cortexAssistantGenerationJobs.status, 'processing')
          )
        )
      if (terminal) {
        await this.expireRequestLeaseWithin(
          transaction,
          job.requestId,
          claimTokenHash,
          now
        )
      }
    })
    await this.providerBudget.enqueueCircuitAlertEventsAfterCommit(alertEvents)
  }

  async failTerminal(
    jobId: string,
    claimTokenHash: string,
    failureCode: string
  ): Promise<void> {
    let alertEvents: CortexAssistantProviderCircuitAlertEvent[] = []
    await this.database.client.transaction(async (transaction) => {
      const now = new Date()
      const [failed] = await transaction
        .update(cortexAssistantGenerationJobs)
        .set({
          status: 'failed',
          failure_code: boundedFailureCode(failureCode),
          completed_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(cortexAssistantGenerationJobs.id, jobId),
            eq(cortexAssistantGenerationJobs.status, 'processing'),
            eq(cortexAssistantGenerationJobs.claim_token_hash, claimTokenHash)
          )
        )
        .returning({
          requestId: cortexAssistantGenerationJobs.request_id,
          claimTokenHash: cortexAssistantGenerationJobs.claim_token_hash,
        })
      if (!failed) return
      alertEvents = await this.providerBudget.reconcileGenerationJobWithinWithAlerts(
        transaction,
        jobId,
        'failed'
      )
      await this.expireRequestLeaseWithin(
        transaction,
        failed.requestId,
        failed.claimTokenHash,
        now
      )
    })
    await this.providerBudget.enqueueCircuitAlertEventsAfterCommit(alertEvents)
  }

  async recoverableJobIds(
    before: Date,
    tenantIds: readonly string[]
  ): Promise<string[]> {
    if (tenantIds.length === 0) {
      throw new Error('Assistant generation recovery tenant scope is required')
    }
    let alertEvents: CortexAssistantProviderCircuitAlertEvent[] = []
    const recoverable = await this.database.client.transaction(async (transaction) => {
      const rows = await transaction
        .select({
          id: cortexAssistantGenerationJobs.id,
          status: cortexAssistantGenerationJobs.status,
          attempts: cortexAssistantGenerationJobs.attempt_count,
        })
        .from(cortexAssistantGenerationJobs)
        .where(
          and(
            inArray(cortexAssistantGenerationJobs.tenant_id, [...tenantIds]),
            or(
              eq(cortexAssistantGenerationJobs.status, 'queued'),
              and(
                eq(cortexAssistantGenerationJobs.status, 'processing'),
                lt(cortexAssistantGenerationJobs.updated_at, before)
              )
            )
          )
        )
        .orderBy(cortexAssistantGenerationJobs.updated_at)
        .limit(CORTEX_ASSISTANT_GENERATION_RECOVERY_BATCH_SIZE)
        .for('update', { skipLocked: true })
      const recoverable: string[] = []
      for (const row of rows) {
        alertEvents.push(
          ...(await this.providerBudget.reconcileGenerationJobWithinWithAlerts(
            transaction,
            row.id,
            'recovered'
          ))
        )
        if (row.attempts >= CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS) {
          alertEvents.push(
            ...(await this.failWithin(transaction, row.id, 'attempt_limit'))
          )
          continue
        }
        if (row.status === 'processing') {
          await transaction
            .update(cortexAssistantGenerationJobs)
            .set({ status: 'queued', updated_at: new Date() })
            .where(eq(cortexAssistantGenerationJobs.id, row.id))
        }
        recoverable.push(row.id)
      }
      return recoverable
    })
    await this.providerBudget.enqueueCircuitAlertEventsAfterCommit(alertEvents)
    return recoverable
  }

  private jobSelection() {
    return {
      id: cortexAssistantGenerationJobs.id,
      requestId: cortexAssistantGenerationJobs.request_id,
      claimTokenHash: cortexAssistantGenerationJobs.claim_token_hash,
      status: cortexAssistantGenerationJobs.status,
      attemptCount: cortexAssistantGenerationJobs.attempt_count,
      failureCode: cortexAssistantGenerationJobs.failure_code,
      createdAt: cortexAssistantGenerationJobs.created_at,
      updatedAt: cortexAssistantGenerationJobs.updated_at,
    }
  }

  private async lockPrincipal(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<ErpPrincipal> {
    const [membership] = await transaction
      .select({ tenantId: users.tenant_id, role: users.role, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (!membership || !role || !roleHasCapability(role, 'cortex.search')) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }
  }

  private async failWithin(
    transaction: DatabaseTransaction,
    jobId: string,
    failureCode: string
  ): Promise<CortexAssistantProviderCircuitAlertEvent[]> {
    const now = new Date()
    const [failed] = await transaction
      .update(cortexAssistantGenerationJobs)
      .set({
        status: 'failed',
        failure_code: boundedFailureCode(failureCode),
        completed_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(cortexAssistantGenerationJobs.id, jobId),
          inArray(cortexAssistantGenerationJobs.status, ['queued', 'processing'])
        )
      )
      .returning({
        requestId: cortexAssistantGenerationJobs.request_id,
        claimTokenHash: cortexAssistantGenerationJobs.claim_token_hash,
      })
    if (!failed) return []
    const alertEvents = await this.providerBudget.reconcileGenerationJobWithinWithAlerts(
      transaction,
      jobId,
      'failed'
    )
    await this.expireRequestLeaseWithin(
      transaction,
      failed.requestId,
      failed.claimTokenHash,
      now
    )
    return alertEvents
  }

  private async expireRequestLeaseWithin(
    transaction: DatabaseTransaction,
    requestId: string,
    claimTokenHash: string,
    now: Date
  ): Promise<void> {
    await transaction
      .update(cortexAssistantTurnRequests)
      .set({ lease_expires_at: now })
      .where(
        and(
          eq(cortexAssistantTurnRequests.id, requestId),
          eq(cortexAssistantTurnRequests.state, 'processing'),
          eq(cortexAssistantTurnRequests.claim_token_hash, claimTokenHash)
        )
      )
  }
}
