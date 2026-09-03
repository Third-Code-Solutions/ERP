import 'reflect-metadata'

import { createHash, createHmac, randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  auditLog,
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
import {
  CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
  cortexConversationAssistantTurnSignaturePayload,
} from '@third-code-erp/shared-types'
import { and, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import {
  CortexAssistantTurnsService,
  type CortexAssistantTurnSignatureHeaders,
} from '../src/cortex/cortex-assistant-turns.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const rollback = Symbol('rollback')
const HMAC_SECRET = 'cortex-assistant-integration-secret-32-bytes-minimum'

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

function signatureHeaders(
  operation: 'claim' | 'complete',
  command: object,
  principal: ErpPrincipal,
  idempotencyKey: string
): CortexAssistantTurnSignatureHeaders {
  const timestamp = String(Math.floor(Date.now() / 1_000))
  const commandDigest = createHash('sha256')
    .update(JSON.stringify(command), 'utf8')
    .digest('hex')
  const payload = cortexConversationAssistantTurnSignaturePayload({
    operation,
    timestamp,
    tenantId: principal.tenantId,
    userId: principal.userId,
    idempotencyKey,
    commandDigest,
  })
  const signature = createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('hex')
  return {
    timestamp,
    signature: `${CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION}=${signature}`,
  }
}

suite('Cortex assistant-turn database integration', () => {
  it('fences generation, commits one tenant-safe assistant turn, and replays exactly', async () => {
    const tenantIds: string[] = []
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const userA = randomUUID()
      const userB = randomUUID()
      const conversationId = randomUUID()
      const userMessageId = randomUUID()
      const projectRef = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      const fixtureAt = new Date(Date.now() - 120_000)
      tenantIds.push(tenantA, tenantB)

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Cortex Assistant A',
          slug: `cortex-assistant-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Cortex Assistant B',
          slug: `cortex-assistant-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `cortex-assistant-a-${suffix}@integration.test`,
          full_name: 'Cortex Assistant User A',
          role: 'admin',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `cortex-assistant-b-${suffix}@integration.test`,
          full_name: 'Cortex Assistant User B',
          role: 'admin',
        },
      ])
      const [citation] = await transaction
        .insert(cortexNodes)
        .values({
          tenant_id: tenantA,
          node_type: 'project',
          ref_table: 'projects',
          ref_id: projectRef,
          title: 'Authorized Project',
          summary: 'Scoped integration record',
          created_by: userA,
        })
        .returning({ id: cortexNodes.id })
      if (!citation) throw new Error('Cortex citation fixture missing')

      await transaction.insert(cortexConversations).values({
        id: conversationId,
        tenant_id: tenantA,
        user_id: userA,
        title: 'Assistant authority fixture',
        context_ref_table: 'projects',
        context_ref_id: projectRef,
      })
      await transaction.insert(cortexMessages).values({
        id: userMessageId,
        tenant_id: tenantA,
        conversation_id: conversationId,
        role: 'user',
        content: 'What changed?',
      })
      await transaction.insert(cortexConversationTurnRequests).values({
        tenant_id: tenantA,
        user_id: userA,
        idempotency_key: 'official-user-turn',
        request_hash: 'a'.repeat(64),
        state: 'succeeded',
        conversation_id: conversationId,
        message_id: userMessageId,
        result: {
          status: 'created',
          conversationId,
          messageId: userMessageId,
        },
        created_at: fixtureAt,
        completed_at: fixtureAt,
      })

      const config = new ConfigService({
        ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED: true,
        ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS: [
          tenantA,
          tenantB,
        ],
        ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: HMAC_SECRET,
      })
      const service = new CortexAssistantTurnsService(
        config,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const principalA: ErpPrincipal = {
        tenantId: tenantA,
        userId: userA,
        role: 'admin',
        email: `cortex-assistant-a-${suffix}@integration.test`,
      }
      const principalB: ErpPrincipal = {
        tenantId: tenantB,
        userId: userB,
        role: 'admin',
        email: `cortex-assistant-b-${suffix}@integration.test`,
      }
      const claimCommand = { conversationId, userMessageId }
      const idempotencyKey = 'assistant-generation-one'

      const firstClaim = await service.claim(
        claimCommand,
        principalA,
        idempotencyKey,
        signatureHeaders('claim', claimCommand, principalA, idempotencyKey)
      )
      expect(firstClaim.status).toBe('claimed')
      if (firstClaim.status !== 'claimed') {
        throw new Error('Initial assistant claim was not acquired')
      }
      await expect(
        service.claim(
          claimCommand,
          principalA,
          idempotencyKey,
          signatureHeaders('claim', claimCommand, principalA, idempotencyKey)
        )
      ).resolves.toMatchObject({
        status: 'in_progress',
        conversationId,
        userMessageId,
      })

      const completionCommand = {
        requestId: firstClaim.requestId,
        claimToken: firstClaim.claimToken,
        content: 'The authorized project changed.',
        citationNodeIds: [citation.id],
        outcome: 'deterministic_grounded' as const,
        model: 'deterministic-grounded',
      }
      await transaction
        .update(users)
        .set({ role: 'viewer' })
        .where(and(eq(users.tenant_id, tenantA), eq(users.id, userA)))
      await expect(
        service.complete(
          completionCommand,
          principalA,
          idempotencyKey,
          signatureHeaders(
            'complete',
            completionCommand,
            principalA,
            idempotencyKey
          )
        )
      ).rejects.toThrow('Forbidden')
      await transaction
        .update(users)
        .set({ role: 'admin' })
        .where(and(eq(users.tenant_id, tenantA), eq(users.id, userA)))

      await transaction
        .update(cortexAssistantTurnRequests)
        .set({
          created_at: fixtureAt,
          lease_expires_at: new Date(Date.now() - 1_000),
        })
        .where(eq(cortexAssistantTurnRequests.id, firstClaim.requestId))
      const reclaimed = await service.claim(
        claimCommand,
        principalA,
        idempotencyKey,
        signatureHeaders('claim', claimCommand, principalA, idempotencyKey)
      )
      expect(reclaimed.status).toBe('claimed')
      if (reclaimed.status !== 'claimed') {
        throw new Error('Expired assistant claim was not reacquired')
      }
      expect(reclaimed.claimToken).not.toBe(firstClaim.claimToken)

      await expect(
        service.complete(
          completionCommand,
          principalA,
          idempotencyKey,
          signatureHeaders(
            'complete',
            completionCommand,
            principalA,
            idempotencyKey
          )
        )
      ).rejects.toThrow('claim is stale or invalid')

      const reclaimedCompletion = {
        ...completionCommand,
        claimToken: reclaimed.claimToken,
      }
      const completed = await service.complete(
        reclaimedCompletion,
        principalA,
        idempotencyKey,
        signatureHeaders(
          'complete',
          reclaimedCompletion,
          principalA,
          idempotencyKey
        )
      )
      expect(completed).toMatchObject({
        status: 'created',
        conversationId,
        userMessageId,
      })
      await expect(
        service.complete(
          reclaimedCompletion,
          principalA,
          idempotencyKey,
          signatureHeaders(
            'complete',
            reclaimedCompletion,
            principalA,
            idempotencyKey
          )
        )
      ).resolves.toEqual(completed)

      const changedCompletion = {
        ...reclaimedCompletion,
        content: 'Changed after success',
      }
      await expect(
        service.complete(
          changedCompletion,
          principalA,
          idempotencyKey,
          signatureHeaders(
            'complete',
            changedCompletion,
            principalA,
            idempotencyKey
          )
        )
      ).rejects.toThrow('completion changed after it succeeded')

      await expect(
        service.claim(
          claimCommand,
          principalA,
          idempotencyKey,
          signatureHeaders('claim', claimCommand, principalA, idempotencyKey)
        )
      ).resolves.toMatchObject({
        status: 'succeeded',
        conversationId,
        userMessageId,
        messageId: completed.messageId,
        content: reclaimedCompletion.content,
        outcome: reclaimedCompletion.outcome,
        model: reclaimedCompletion.model,
      })
      await expect(
        service.claim(
          claimCommand,
          principalA,
          'assistant-generation-two',
          signatureHeaders(
            'claim',
            claimCommand,
            principalA,
            'assistant-generation-two'
          )
        )
      ).rejects.toThrow('already has an assistant generation')

      await expect(
        service.claim(
          claimCommand,
          principalB,
          'assistant-cross-tenant',
          signatureHeaders(
            'claim',
            claimCommand,
            principalB,
            'assistant-cross-tenant'
          )
        )
      ).rejects.toThrow('Conversation not found')

      const orphanConversationId = randomUUID()
      const orphanMessageId = randomUUID()
      await transaction.insert(cortexConversations).values({
        id: orphanConversationId,
        tenant_id: tenantA,
        user_id: userA,
        title: 'Unofficial user turn fixture',
      })
      await transaction.insert(cortexMessages).values({
        id: orphanMessageId,
        tenant_id: tenantA,
        conversation_id: orphanConversationId,
        role: 'user',
        content: 'Unofficial direct write',
      })
      const orphanClaim = {
        conversationId: orphanConversationId,
        userMessageId: orphanMessageId,
      }
      await expect(
        service.claim(
          orphanClaim,
          principalA,
          'assistant-unofficial-user-turn',
          signatureHeaders(
            'claim',
            orphanClaim,
            principalA,
            'assistant-unofficial-user-turn'
          )
        )
      ).rejects.toThrow('Official Cortex user turn not found')

      const assistantMessages = await transaction
        .select()
        .from(cortexMessages)
        .where(
          and(
            eq(cortexMessages.tenant_id, tenantA),
            eq(cortexMessages.role, 'assistant')
          )
        )
      const [request] = await transaction
        .select()
        .from(cortexAssistantTurnRequests)
        .where(eq(cortexAssistantTurnRequests.id, firstClaim.requestId))
      const audits = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'cortex_conversation')
          )
        )

      expect(assistantMessages).toHaveLength(1)
      expect(assistantMessages[0]).toMatchObject({
        id: completed.messageId,
        role: 'assistant',
        content: reclaimedCompletion.content,
        citations: [{ nodeId: citation.id }],
      })
      expect(request).toMatchObject({
        state: 'succeeded',
        assistant_message_id: completed.messageId,
        claim_token_hash: null,
        lease_expires_at: null,
        outcome: reclaimedCompletion.outcome,
        model: reclaimedCompletion.model,
        result: completed,
      })
      expect(request?.completion_hash).toMatch(/^[0-9a-f]{64}$/)
      const auditDiffs = audits.map(
        (audit) => audit.diff as Record<string, unknown>
      )
      const claimAudits = auditDiffs.filter(
        (diff) => diff.assistant_generation_state === 'claimed'
      )
      const completionAudit = auditDiffs.find(
        (diff) => diff.turn_role === 'assistant'
      )
      expect(audits).toHaveLength(3)
      expect(claimAudits).toHaveLength(2)
      expect(claimAudits).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user_message_id: userMessageId,
            request_id: firstClaim.requestId,
            lease_expires_at: expect.any(String),
            idempotency_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        ])
      )
      expect(completionAudit).toMatchObject({
        turn_role: 'assistant',
        user_message_id: userMessageId,
        message_id: completed.messageId,
        response_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        citation_node_ids: [citation.id],
        outcome: reclaimedCompletion.outcome,
        model: reclaimedCompletion.model,
        idempotency_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
      expect(JSON.stringify(audits)).not.toContain(reclaimedCompletion.content)
      expect(JSON.stringify(audits)).not.toContain(idempotencyKey)
      expect(JSON.stringify(audits)).not.toContain(reclaimed.claimToken)
      expect(JSON.stringify(request)).not.toContain(reclaimed.claimToken)

      await expect(
        transaction.transaction(async (savepoint) => {
          await savepoint.insert(cortexAssistantTurnRequests).values({
            tenant_id: tenantA,
            user_id: userB,
            idempotency_key: 'cross-tenant-assistant-ledger',
            request_hash: 'b'.repeat(64),
            conversation_id: orphanConversationId,
            user_message_id: orphanMessageId,
            claim_token_hash: 'c'.repeat(64),
            lease_expires_at: new Date(Date.now() + 60_000),
          })
        })
      ).rejects.toThrow()
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(inArray(tenants.id, tenantIds))
    expect(leaked).toHaveLength(0)
  })
})
