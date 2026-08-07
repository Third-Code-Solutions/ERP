import 'reflect-metadata'

import { createHash, createHmac, randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  cortexAssistantGenerationJobs,
  cortexConversationTurnRequests,
  cortexConversations,
  cortexMessages,
  cortexNodes,
  db,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { eq } from 'drizzle-orm'
import {
  CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
  cortexConversationAssistantTurnSignaturePayload,
} from '@third-code-erp/shared-types'
import { describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { CortexAssistantGenerationStateService } from '../src/cortex/cortex-assistant-generation.state'
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
      const assistantTurns = new CortexAssistantTurnsService(
        new ConfigService({
          ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED: true,
          ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS: [tenantId],
          ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: 's'.repeat(32),
        }),
        database,
        audit
      )
      const state = new CortexAssistantGenerationStateService(database, audit)
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
          content: 'The copper package is linked to the Tower project.',
          citationNodeIds: [node.id],
          model: 'deterministic-grounded-v1',
        })
      ).resolves.toBe(true)
      await expect(state.status(workerClaim.jobId, principal)).resolves.toMatchObject({
        status: 'succeeded',
        attemptCount: 1,
        failureCode: null,
        retryable: false,
      })
      await expect(
        assistantTurns.completeFromWorker({
          jobId: workerClaim.jobId,
          requestId: workerClaim.requestId,
          claimTokenHash: workerClaim.claimTokenHash,
          content: 'Duplicate',
          citationNodeIds: [node.id],
          model: 'deterministic-grounded-v1',
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
      await expect(
        state.cancel(cancelStarted.status.jobId, principal)
      ).resolves.toMatchObject({
        status: 'cancelled',
        failureCode: 'cancelled_by_user',
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
      const failedWorkerClaim = await state.claim(restarted.status.jobId)
      if (!failedWorkerClaim) throw new Error('Failure worker claim missing')
      await state.failTerminal(
        failedWorkerClaim.jobId,
        failedWorkerClaim.claimTokenHash,
        'worker_disabled'
      )
      await expect(state.status(failedWorkerClaim.jobId, principal)).resolves.toMatchObject({
        status: 'failed',
        failureCode: 'worker_disabled',
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
