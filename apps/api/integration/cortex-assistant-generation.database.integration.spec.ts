import 'reflect-metadata'

import { createHash, createHmac, randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  cortexAssistantGenerationJobs,
  cortexAssistantProviderAttempts,
  cortexAssistantProviderPolicies,
  cortexAssistantTurnRequests,
  cortexConversationTurnRequests,
  cortexConversations,
  cortexMessages,
  cortexNodes,
  db,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import {
  CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
  cortexConversationAssistantTurnSignaturePayload,
} from '@third-code-erp/shared-types'
import { describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { cortexAssistantGenerationCompletionHash } from '../src/cortex/cortex-assistant-generation-completion'
import { CortexAssistantGenerationStateService } from '../src/cortex/cortex-assistant-generation.state'
import { CortexAssistantGenerationService } from '../src/cortex/cortex-assistant-generation.service'
import { CortexAssistantProviderBudgetService } from '../src/cortex/cortex-assistant-provider-budget.service'
import { CortexAssistantProviderCircuitAlertService } from '../src/cortex/cortex-assistant-provider-circuit-alert.service'
import { cortexAssistantProviderDispatchKey } from '../src/cortex/cortex-assistant-provider-protocol'
import { CortexAssistantTurnsService } from '../src/cortex/cortex-assistant-turns.service'
import type { CortexAssistantTurnSignatureHeaders } from '../src/cortex/cortex-assistant-turns.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const rollback = Symbol('rollback')
const PROVIDER_MODEL = 'third-code-provider-v1'

function providerDispatch(reservationId: string) {
  return {
    reservationId,
    protocolVersion: 1 as const,
    dispatchKey: cortexAssistantProviderDispatchKey(reservationId),
    requestFingerprint: 'd'.repeat(64),
  }
}

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (
            scopedTransaction: DatabaseTransaction
          ) => Promise<unknown>
        ) => transaction.transaction(callback)
      }
      const value = Reflect.get(transaction, property)
      return typeof value === 'function' ? value.bind(transaction) : value
    },
  })
  return { client } as DatabaseService
}

async function alwaysRollback(
  callback: (transaction: DatabaseTransaction) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
}

suite('Cortex assistant generation database integration', () => {
  it('claims scoped evidence, fences the worker, commits once, and cancels safely', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantId = randomUUID()
      const userId = randomUUID()
      const conversationId = randomUUID()
      const userMessageId = randomUUID()
      const projectRef = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      await transaction.insert(tenants).values({
        id: tenantId,
        name: 'Assistant Generation Tenant',
        slug: `assistant-generation-${suffix}`,
      })
      await transaction.insert(users).values({
        id: userId,
        tenant_id: tenantId,
        email: `assistant-generation-${suffix}@integration.test`,
        full_name: 'Assistant Generation User',
        role: 'admin',
      })
      const [node] = await transaction
        .insert(cortexNodes)
        .values({
          tenant_id: tenantId,
          node_type: 'project',
          ref_table: 'projects',
          ref_id: projectRef,
          title: 'Tower jane@example.test',
          summary: 'Call +639171234567 about the copper package',
          created_by: userId,
        })
        .returning({ id: cortexNodes.id })
      if (!node) throw new Error('Cortex node fixture missing')
      await transaction.insert(cortexConversations).values({
        id: conversationId,
        tenant_id: tenantId,
        user_id: userId,
        title: 'Worker fixture',
        context_ref_table: 'projects',
        context_ref_id: projectRef,
      })
      await transaction.insert(cortexMessages).values({
        id: userMessageId,
        tenant_id: tenantId,
        conversation_id: conversationId,
        role: 'user',
        content: 'Email jane@example.test about the copper package',
      })
      const completedAt = new Date()
      await transaction.insert(cortexConversationTurnRequests).values({
        tenant_id: tenantId,
        user_id: userId,
        idempotency_key: 'generation-user-turn',
        request_hash: 'a'.repeat(64),
        state: 'succeeded',
        conversation_id: conversationId,
        message_id: userMessageId,
        result: {
          status: 'created',
          conversationId,
          messageId: userMessageId,
        },
        completed_at: completedAt,
      })

      const principal: ErpPrincipal = {
        tenantId,
        userId,
        role: 'admin',
        email: `assistant-generation-${suffix}@integration.test`,
      }
      const database = transactionBoundDatabase(transaction)
      const audit = new AuditService()
      const config = new ConfigService({
        ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED: true,
        ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS: [tenantId],
        ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: 's'.repeat(32),
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: true,
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS: [tenantId],
        ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED: true,
        ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS: [tenantId],
      })
      const assistantTurns = new CortexAssistantTurnsService(
        config,
        database,
        audit
      )
      const providerBudget = new CortexAssistantProviderBudgetService(
        config,
        database,
        audit,
        new CortexAssistantProviderCircuitAlertService(database, audit)
      )
      const state = new CortexAssistantGenerationStateService(
        database,
        audit,
        providerBudget
      )
      const generation = new CortexAssistantGenerationService(
        config,
        assistantTurns,
        state
      )
      const claim = await assistantTurns.claim(
        { conversationId, userMessageId },
        principal,
        'generation-assistant-turn',
        signedHeaders(
          'claim',
          { conversationId, userMessageId },
          principal,
          'generation-assistant-turn'
        )
      )
      expect(claim.status).toBe('claimed')
      if (claim.status !== 'claimed') throw new Error('Claim fixture missing')

      const started = await state.start(
        { requestId: claim.requestId, claimToken: claim.claimToken },
        principal,
        'generation-assistant-turn'
      )
      expect(started.enqueue).toBe(true)
      expect(started.status.status).toBe('queued')
      const [storedJob] = await transaction
        .select({ claimTokenHash: cortexAssistantGenerationJobs.claim_token_hash })
        .from(cortexAssistantGenerationJobs)
        .where(eq(cortexAssistantGenerationJobs.id, started.status.jobId))
      expect(storedJob?.claimTokenHash).toMatch(/^[0-9a-f]{64}$/)
      expect(storedJob?.claimTokenHash).not.toContain(claim.claimToken)

      const workerClaim = await state.claim(started.status.jobId)
      expect(workerClaim).toMatchObject({
        requestId: claim.requestId,
        tenantId,
        userId,
      })
      expect(workerClaim?.question).toContain('[email redacted]')
      expect(JSON.stringify(workerClaim?.evidence)).not.toContain(
        'jane@example.test'
      )
      expect(JSON.stringify(workerClaim?.evidence)).not.toContain(
        '+639171234567'
      )
      if (!workerClaim) throw new Error('Worker claim missing')

      await expect(
        assistantTurns.completeFromWorker({
          jobId: workerClaim.jobId,
          requestId: workerClaim.requestId,
          claimTokenHash: workerClaim.claimTokenHash,
          completion: {
            outcome: 'deterministic_grounded',
            content: 'The copper package is linked to the Tower project.',
            citationNodeIds: [node.id],
            model: 'deterministic-grounded-v1',
          },
        })
      ).resolves.toBe(true)
      await expect(state.status(workerClaim.jobId, principal)).resolves.toMatchObject({
        status: 'succeeded',
        attemptCount: 1,
        failureCode: null,
        retryable: false,
      })
      await expect(
        generation.result(workerClaim.jobId, principal)
      ).resolves.toMatchObject({
        job: { status: 'succeeded' },
        result: {
          status: 'succeeded',
          conversationId,
          userMessageId,
          content: 'The copper package is linked to the Tower project.',
          citations: [{ nodeId: node.id, refId: projectRef }],
          outcome: 'deterministic_grounded',
          model: 'deterministic-grounded-v1',
        },
      })
      await expect(
        assistantTurns.completeFromWorker({
          jobId: workerClaim.jobId,
          requestId: workerClaim.requestId,
          claimTokenHash: workerClaim.claimTokenHash,
          completion: {
            outcome: 'deterministic_grounded',
            content: 'Duplicate',
            citationNodeIds: [node.id],
            model: 'deterministic-grounded-v1',
          },
        })
      ).resolves.toBe(false)

      const secondConversationId = randomUUID()
      const secondMessageId = randomUUID()
      await transaction.insert(cortexConversations).values({
        id: secondConversationId,
        tenant_id: tenantId,
        user_id: userId,
        title: 'Cancellation fixture',
      })
      await transaction.insert(cortexMessages).values({
        id: secondMessageId,
        tenant_id: tenantId,
        conversation_id: secondConversationId,
        role: 'user',
        content: 'Cancel this response',
      })
      await transaction.insert(cortexConversationTurnRequests).values({
        tenant_id: tenantId,
        user_id: userId,
        idempotency_key: 'generation-user-turn-cancel',
        request_hash: 'b'.repeat(64),
        state: 'succeeded',
        conversation_id: secondConversationId,
        message_id: secondMessageId,
        result: {
          status: 'created',
          conversationId: secondConversationId,
          messageId: secondMessageId,
        },
        completed_at: completedAt,
      })
      const cancelClaim = await assistantTurns.claim(
        { conversationId: secondConversationId, userMessageId: secondMessageId },
        principal,
        'generation-assistant-turn-cancel',
        signedHeaders(
          'claim',
          { conversationId: secondConversationId, userMessageId: secondMessageId },
          principal,
          'generation-assistant-turn-cancel'
        )
      )
      if (cancelClaim.status !== 'claimed') throw new Error('Cancel claim missing')
      const cancelStarted = await state.start(
        {
          requestId: cancelClaim.requestId,
          claimToken: cancelClaim.claimToken,
        },
        principal,
        'generation-assistant-turn-cancel'
      )
      await transaction.insert(cortexAssistantProviderPolicies).values({
        tenant_id: tenantId,
        provider: 'fake',
        model: PROVIDER_MODEL,
        enabled: true,
        request_limit_micros: 400,
        daily_limit_micros: 1_000,
      })
      const cancelWorkerClaim = await state.claim(cancelStarted.status.jobId)
      if (!cancelWorkerClaim) throw new Error('Cancel worker claim missing')
      const cancelReservation = await providerBudget.reserve({
        jobId: cancelWorkerClaim.jobId,
        attemptNumber: cancelWorkerClaim.attemptNumber,
        provider: 'fake',
        model: PROVIDER_MODEL,
        maxCostMicros: '400',
      })
      await expect(
        state.cancel(cancelStarted.status.jobId, principal)
      ).resolves.toMatchObject({
        status: 'cancelled',
        failureCode: 'cancelled_by_user',
      })
      const [releasedOnCancel] = await transaction
        .select({
          status: cortexAssistantProviderAttempts.status,
          consumed: cortexAssistantProviderAttempts.consumed_cost_micros,
          outcome: cortexAssistantProviderAttempts.outcome_code,
        })
        .from(cortexAssistantProviderAttempts)
        .where(eq(cortexAssistantProviderAttempts.id, cancelReservation.reservationId))
      expect(releasedOnCancel).toEqual({
        status: 'released',
        consumed: 0,
        outcome: 'cancelled_before_dispatch',
      })
      await expect(state.claim(cancelStarted.status.jobId)).resolves.toBeNull()

      const reclaimedAfterCancel = await assistantTurns.claim(
        { conversationId: secondConversationId, userMessageId: secondMessageId },
        principal,
        'generation-assistant-turn-cancel',
        signedHeaders(
          'claim',
          { conversationId: secondConversationId, userMessageId: secondMessageId },
          principal,
          'generation-assistant-turn-cancel'
        )
      )
      expect(reclaimedAfterCancel.status).toBe('claimed')
      if (reclaimedAfterCancel.status !== 'claimed') {
        throw new Error('Cancelled request was not immediately reclaimable')
      }
      const restarted = await state.start(
        {
          requestId: reclaimedAfterCancel.requestId,
          claimToken: reclaimedAfterCancel.claimToken,
        },
        principal,
        'generation-assistant-turn-cancel'
      )
      const recoveredWorkerClaim = await state.claim(restarted.status.jobId)
      if (!recoveredWorkerClaim) throw new Error('Recovery worker claim missing')
      const recoveryReservation = await providerBudget.reserve({
        jobId: recoveredWorkerClaim.jobId,
        attemptNumber: recoveredWorkerClaim.attemptNumber,
        provider: 'fake',
        model: PROVIDER_MODEL,
        maxCostMicros: '400',
      })
      await providerBudget.markDispatched(
        providerDispatch(recoveryReservation.reservationId)
      )
      await expect(
        state.recoverableJobIds(new Date(Date.now() + 1_000), [tenantId])
      ).resolves.toContain(recoveredWorkerClaim.jobId)
      const [settledOnRecovery] = await transaction
        .select({
          status: cortexAssistantProviderAttempts.status,
          consumed: cortexAssistantProviderAttempts.consumed_cost_micros,
          outcome: cortexAssistantProviderAttempts.outcome_code,
        })
        .from(cortexAssistantProviderAttempts)
        .where(
          and(
            eq(cortexAssistantProviderAttempts.job_id, recoveredWorkerClaim.jobId),
            eq(
              cortexAssistantProviderAttempts.attempt_number,
              recoveredWorkerClaim.attemptNumber
            )
          )
        )
      expect(settledOnRecovery).toEqual({
        status: 'settled',
        consumed: 400,
        outcome: 'recovered_outcome_unknown',
      })

      const failedWorkerClaim = await state.claim(restarted.status.jobId)
      if (!failedWorkerClaim) throw new Error('Failure worker claim missing')
      const failureReservation = await providerBudget.reserve({
        jobId: failedWorkerClaim.jobId,
        attemptNumber: failedWorkerClaim.attemptNumber,
        provider: 'fake',
        model: PROVIDER_MODEL,
        maxCostMicros: '400',
      })
      await state.failTerminal(
        failedWorkerClaim.jobId,
        failedWorkerClaim.claimTokenHash,
        'provider_request_timeout'
      )
      await expect(
        state.status(failedWorkerClaim.jobId, principal)
      ).resolves.toMatchObject({
        status: 'failed',
        failureCode: 'provider_request_timeout',
        retryable: false,
      })
      const [releasedOnFailure] = await transaction
        .select({
          status: cortexAssistantProviderAttempts.status,
          consumed: cortexAssistantProviderAttempts.consumed_cost_micros,
          outcome: cortexAssistantProviderAttempts.outcome_code,
        })
        .from(cortexAssistantProviderAttempts)
        .where(eq(cortexAssistantProviderAttempts.id, failureReservation.reservationId))
      expect(releasedOnFailure).toEqual({
        status: 'released',
        consumed: 0,
        outcome: 'failed_before_dispatch',
      })
      await expect(
        assistantTurns.claim(
          { conversationId: secondConversationId, userMessageId: secondMessageId },
          principal,
          'generation-assistant-turn-cancel',
          signedHeaders(
            'claim',
            { conversationId: secondConversationId, userMessageId: secondMessageId },
            principal,
            'generation-assistant-turn-cancel'
          )
        )
      ).resolves.toMatchObject({ status: 'claimed' })

      const providerConversationId = randomUUID()
      const providerMessageId = randomUUID()
      await transaction.insert(cortexConversations).values({
        id: providerConversationId,
        tenant_id: tenantId,
        user_id: userId,
        title: 'Provider completion fixture',
      })
      await transaction.insert(cortexMessages).values({
        id: providerMessageId,
        tenant_id: tenantId,
        conversation_id: providerConversationId,
        role: 'user',
        content: 'Summarize provider-grounded evidence',
      })
      await transaction.insert(cortexConversationTurnRequests).values({
        tenant_id: tenantId,
        user_id: userId,
        idempotency_key: 'generation-provider-user-turn',
        request_hash: 'c'.repeat(64),
        state: 'succeeded',
        conversation_id: providerConversationId,
        message_id: providerMessageId,
        result: {
          status: 'created',
          conversationId: providerConversationId,
          messageId: providerMessageId,
        },
        completed_at: completedAt,
      })
      const providerClaim = await assistantTurns.claim(
        {
          conversationId: providerConversationId,
          userMessageId: providerMessageId,
        },
        principal,
        'generation-provider-assistant-turn',
        signedHeaders(
          'claim',
          {
            conversationId: providerConversationId,
            userMessageId: providerMessageId,
          },
          principal,
          'generation-provider-assistant-turn'
        )
      )
      if (providerClaim.status !== 'claimed') {
        throw new Error('Provider completion claim missing')
      }
      const providerStarted = await state.start(
        {
          requestId: providerClaim.requestId,
          claimToken: providerClaim.claimToken,
        },
        principal,
        'generation-provider-assistant-turn'
      )
      const providerWorkerClaim = await state.claim(
        providerStarted.status.jobId
      )
      if (!providerWorkerClaim) {
        throw new Error('Provider completion worker claim missing')
      }
      const providerReservation = await providerBudget.reserve({
        jobId: providerWorkerClaim.jobId,
        attemptNumber: providerWorkerClaim.attemptNumber,
        provider: 'fake',
        model: PROVIDER_MODEL,
        maxCostMicros: '400',
      })
      await providerBudget.markDispatched(
        providerDispatch(providerReservation.reservationId)
      )
      const providerCompletion = {
        outcome: 'provider_grounded' as const,
        providerAttemptId: providerReservation.reservationId,
        content: 'Provider-grounded project summary.',
        citationNodeIds: [node.id],
        model: PROVIDER_MODEL,
      }
      const providerResponseFingerprint =
        cortexAssistantGenerationCompletionHash({
          jobId: providerWorkerClaim.jobId,
          requestId: providerWorkerClaim.requestId,
          completion: providerCompletion,
        })
      await expect(
        assistantTurns.completeFromWorker({
          jobId: providerWorkerClaim.jobId,
          requestId: providerWorkerClaim.requestId,
          claimTokenHash: providerWorkerClaim.claimTokenHash,
          completion: {
            outcome: 'provider_grounded',
            providerAttemptId: providerReservation.reservationId,
            content: 'Unsettled provider result.',
            citationNodeIds: [node.id],
            model: PROVIDER_MODEL,
          },
        })
      ).rejects.toThrow('Cortex provider completion authority is invalid')
      await providerBudget.settle({
        reservationId: providerReservation.reservationId,
        protocolVersion: 1,
        consumedCostMicros: '125',
        outcomeCode: 'provider_succeeded',
        providerRequestIdHash: 'e'.repeat(64),
        responseFingerprint: providerResponseFingerprint,
      })
      const [providerProtocol] = await transaction
        .select({
          protocolVersion: cortexAssistantProviderAttempts.protocol_version,
          dispatchKey: cortexAssistantProviderAttempts.dispatch_key,
          requestFingerprint:
            cortexAssistantProviderAttempts.request_fingerprint,
          providerRequestIdHash:
            cortexAssistantProviderAttempts.provider_request_id_hash,
          responseFingerprint:
            cortexAssistantProviderAttempts.response_fingerprint,
        })
        .from(cortexAssistantProviderAttempts)
        .where(
          eq(cortexAssistantProviderAttempts.id, providerReservation.reservationId)
        )
      expect(providerProtocol).toEqual({
        protocolVersion: 1,
        dispatchKey: cortexAssistantProviderDispatchKey(
          providerReservation.reservationId
        ),
        requestFingerprint: 'd'.repeat(64),
        providerRequestIdHash: 'e'.repeat(64),
        responseFingerprint: providerResponseFingerprint,
      })
      await expect(
        transaction.transaction(async (nested) => {
          const [forgedMessage] = await nested
            .insert(cortexMessages)
            .values({
              tenant_id: tenantId,
              conversation_id: providerConversationId,
              role: 'assistant',
              content: 'Forged provider completion.',
            })
            .returning({ id: cortexMessages.id })
          if (!forgedMessage) throw new Error('Forged message fixture missing')
          await nested
            .update(cortexAssistantTurnRequests)
            .set({
              state: 'succeeded',
              completion_hash:
                providerResponseFingerprint === '0'.repeat(64)
                  ? '1'.repeat(64)
                  : '0'.repeat(64),
              claim_token_hash: null,
              lease_expires_at: null,
              assistant_message_id: forgedMessage.id,
              provider_attempt_id: providerReservation.reservationId,
              outcome: 'provider_grounded',
              model: PROVIDER_MODEL,
              result: { status: 'forged' },
              completed_at: new Date(),
            })
            .where(eq(cortexAssistantTurnRequests.id, providerClaim.requestId))
        })
      ).rejects.toThrow(
        'provider completion attempt is not settled current authority'
      )
      await expect(
        assistantTurns.completeFromWorker({
          jobId: providerWorkerClaim.jobId,
          requestId: providerWorkerClaim.requestId,
          claimTokenHash: providerWorkerClaim.claimTokenHash,
          completion: {
            outcome: 'provider_grounded',
            providerAttemptId: providerReservation.reservationId,
            content: 'Mismatched provider model.',
            citationNodeIds: [node.id],
            model: 'different-provider-model',
          },
        })
      ).rejects.toThrow('Cortex provider completion authority is invalid')
      await expect(
        assistantTurns.completeFromWorker({
          jobId: providerWorkerClaim.jobId,
          requestId: providerWorkerClaim.requestId,
          claimTokenHash: providerWorkerClaim.claimTokenHash,
          completion: {
            ...providerCompletion,
            content: 'Different provider response.',
          },
        })
      ).rejects.toThrow('Cortex provider completion authority is invalid')
      await expect(
        assistantTurns.completeFromWorker({
          jobId: providerWorkerClaim.jobId,
          requestId: providerWorkerClaim.requestId,
          claimTokenHash: providerWorkerClaim.claimTokenHash,
          completion: providerCompletion,
        })
      ).resolves.toBe(true)
      const [storedProviderCompletion] = await transaction
        .select({
          outcome: cortexAssistantTurnRequests.outcome,
          providerAttemptId:
            cortexAssistantTurnRequests.provider_attempt_id,
          assistantMessageId:
            cortexAssistantTurnRequests.assistant_message_id,
        })
        .from(cortexAssistantTurnRequests)
        .where(eq(cortexAssistantTurnRequests.id, providerClaim.requestId))
      expect(storedProviderCompletion).toMatchObject({
        outcome: 'provider_grounded',
        providerAttemptId: providerReservation.reservationId,
        assistantMessageId: expect.any(String),
      })
      await expect(
        generation.result(providerWorkerClaim.jobId, principal)
      ).resolves.toMatchObject({
        job: { status: 'succeeded', attemptCount: 1 },
        result: {
          status: 'succeeded',
          outcome: 'provider_grounded',
          model: PROVIDER_MODEL,
          content: 'Provider-grounded project summary.',
        },
      })

      await transaction
        .update(users)
        .set({ role: 'viewer' })
        .where(eq(users.id, userId))
      await expect(
        generation.result(workerClaim.jobId, principal)
      ).rejects.toThrow('Conversation not found')
      await expect(
        transaction
          .update(cortexAssistantTurnRequests)
          .set({ provider_attempt_id: null })
          .where(eq(cortexAssistantTurnRequests.id, providerClaim.requestId))
      ).rejects.toThrow('provider completion authority is immutable')
    })
  })
})

function signedHeaders(
  operation: 'claim',
  command: object,
  principal: ErpPrincipal,
  idempotencyKey: string
): CortexAssistantTurnSignatureHeaders {
  const timestamp = String(Math.floor(Date.now() / 1_000))
  const commandDigest = createHash('sha256')
    .update(JSON.stringify(command), 'utf8')
    .digest('hex')
  const signature = createHmac('sha256', 's'.repeat(32))
    .update(
      cortexConversationAssistantTurnSignaturePayload({
        operation,
        timestamp,
        tenantId: principal.tenantId,
        userId: principal.userId,
        idempotencyKey,
        commandDigest,
      })
    )
    .digest('hex')
  return {
    timestamp,
    signature: `${CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION}=${signature}`,
  }
}
