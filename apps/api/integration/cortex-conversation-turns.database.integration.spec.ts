import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  auditLog,
  cortexConversationTurnRequests,
  cortexConversations,
  cortexMessages,
  cortexNodes,
  db,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { CortexConversationTurnsService } from '../src/cortex/cortex-conversation-turns.service'
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

suite('Cortex conversation user-turn database integration', () => {
  it('commits tenant-safe user turns, replay, role scope, audit, and composite FKs', async () => {
    const tenantIds: string[] = []
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const userA = randomUUID()
      const userB = randomUUID()
      const projectRef = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      tenantIds.push(tenantA, tenantB)

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Cortex Turn A',
          slug: `cortex-turn-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Cortex Turn B',
          slug: `cortex-turn-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `cortex-a-${suffix}@integration.test`,
          full_name: 'Cortex User A',
          role: 'finance',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `cortex-b-${suffix}@integration.test`,
          full_name: 'Cortex User B',
          role: 'finance',
        },
      ])
      await transaction.insert(cortexNodes).values({
        tenant_id: tenantA,
        node_type: 'project',
        ref_table: 'projects',
        ref_id: projectRef,
        title: 'Authorized Project',
        summary: 'Scoped integration record',
        created_by: userA,
      })

      const config = new ConfigService({
        ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED: true,
        ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS: [
          tenantA,
          tenantB,
        ],
      })
      const service = new CortexConversationTurnsService(
        config,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const principalA: ErpPrincipal = {
        tenantId: tenantA,
        userId: userA,
        role: 'finance',
        email: `cortex-a-${suffix}@integration.test`,
      }
      const sensitiveContent =
        'Call 09171234567 or foreman@example.test about the project'

      const created = await service.appendUserTurn(
        { content: sensitiveContent },
        principalA,
        'cortex-turn-create'
      )
      expect(created.status).toBe('created')
      await expect(
        service.appendUserTurn(
          { content: sensitiveContent },
          principalA,
          'cortex-turn-create'
        )
      ).resolves.toEqual(created)
      await expect(
        service.appendUserTurn(
          { content: 'Changed command' },
          principalA,
          'cortex-turn-create'
        )
      ).rejects.toThrow('different Cortex user turn')

      const scoped = await service.appendUserTurn(
        {
          content: 'What changed?',
          context: { refTable: 'projects', refId: projectRef },
        },
        principalA,
        'cortex-turn-scoped'
      )
      expect(scoped.status).toBe('created')

      await transaction
        .update(users)
        .set({ role: 'viewer' })
        .where(and(eq(users.tenant_id, tenantA), eq(users.id, userA)))
      await expect(
        service.appendUserTurn(
          {
            conversationId: scoped.conversationId,
            content: 'This must be hidden now',
          },
          principalA,
          'cortex-turn-revoked'
        )
      ).rejects.toThrow('Conversation not found')

      const [foreignConversation] = await transaction
        .insert(cortexConversations)
        .values({
          tenant_id: tenantB,
          user_id: userB,
          title: 'Foreign conversation',
        })
        .returning({ id: cortexConversations.id })
      if (!foreignConversation) throw new Error('Foreign fixture missing')
      await expect(
        service.appendUserTurn(
          {
            conversationId: foreignConversation.id,
            content: 'Cross tenant',
          },
          principalA,
          'cortex-turn-cross-tenant'
        )
      ).rejects.toThrow('Conversation not found')

      const messages = await transaction
        .select()
        .from(cortexMessages)
        .where(eq(cortexMessages.tenant_id, tenantA))
      const requests = await transaction
        .select()
        .from(cortexConversationTurnRequests)
        .where(eq(cortexConversationTurnRequests.tenant_id, tenantA))
      const conversations = await transaction
        .select()
        .from(cortexConversations)
        .where(eq(cortexConversations.tenant_id, tenantA))
      const audits = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'cortex_conversation')
          )
        )

      expect(messages).toHaveLength(2)
      expect(messages.every((message) => message.role === 'user')).toBe(true)
      expect(requests).toHaveLength(2)
      expect(requests.every((request) => request.state === 'succeeded')).toBe(
        true
      )
      expect(conversations).toHaveLength(2)
      const redactedConversation = conversations.find(
        (conversation) => conversation.id === created.conversationId
      )
      expect(redactedConversation?.title).toContain('[phone redacted]')
      expect(redactedConversation?.title).toContain('[email redacted]')
      expect(audits).toHaveLength(2)
      expect(JSON.stringify(audits)).not.toContain(sensitiveContent)
      expect(audits[0]?.diff).toMatchObject({
        turn_role: 'user',
        content_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        idempotency_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })

      await expect(
        transaction.transaction(async (savepoint) => {
          await savepoint.insert(cortexConversationTurnRequests).values({
            tenant_id: tenantA,
            user_id: userB,
            idempotency_key: 'cross-tenant-ledger',
            request_hash: '0'.repeat(64),
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
