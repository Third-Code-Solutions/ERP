import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  accounts,
  auditLog,
  changeRequestCreateRequests,
  changeRequests,
  db,
  notifications,
  opportunities,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { ChangeRequestCreationService } from '../src/crm/change-request-creation.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => callback(transaction)
      }

      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
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
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

suite('Change Request database integration', () => {
  it('proves tenant, role, idempotency, notification, audit, and rollback boundaries', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const adminA = randomUUID()
      const viewerA = randomUUID()
      const designA = randomUUID()
      const adminB = randomUUID()
      const accountA = randomUUID()
      const accountB = randomUUID()
      const opportunityA = randomUUID()
      const opportunityB = randomUUID()
      const suffix = randomUUID().slice(0, 12)

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Change Request Integration A',
          slug: `change-request-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Change Request Integration B',
          slug: `change-request-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `admin-a-${suffix}@integration.test`,
          full_name: 'Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `viewer-a-${suffix}@integration.test`,
          full_name: 'Viewer A',
          role: 'viewer',
        },
        {
          id: designA,
          tenant_id: tenantA,
          email: `design-a-${suffix}@integration.test`,
          full_name: 'Design A',
          role: 'design',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `admin-b-${suffix}@integration.test`,
          full_name: 'Admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: `Integration Account A ${suffix}`,
          created_by: adminA,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: `Integration Account B ${suffix}`,
          created_by: adminB,
        },
      ])
      await transaction.insert(opportunities).values([
        {
          id: opportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          rep_id: adminA,
        },
        {
          id: opportunityB,
          tenant_id: tenantB,
          account_id: accountB,
          rep_id: adminB,
        },
      ])

      const database = transactionBoundDatabase(transaction)
      const service = new ChangeRequestCreationService(
        new ConfigService({
          ERP_CHANGE_REQUEST_WRITES_ENABLED: true,
          ERP_CHANGE_REQUEST_WRITES_TENANT_IDS: [tenantA],
        }),
        database,
        new AuditService()
      )
      const principalA: ErpPrincipal = {
        userId: adminA,
        tenantId: tenantA,
        role: 'admin',
        email: `admin-a-${suffix}@integration.test`,
      }
      const command = {
        requestedByName: 'Client A',
        description: 'Move the kitchen island 300mm to the east wall.',
        priority: 'major' as const,
      }

      const first = await service.create(
        opportunityA,
        command,
        principalA,
        'change-request-integration-1'
      )
      expect(first).toMatchObject({
        tenantId: tenantA,
        status: 'open',
        created: true,
      })

      const replay = await service.create(
        opportunityA,
        command,
        principalA,
        'change-request-integration-1'
      )
      expect(replay).toEqual(first)

      const [idempotency] = await transaction
        .select({
          state: changeRequestCreateRequests.state,
          changeRequestId: changeRequestCreateRequests.change_request_id,
        })
        .from(changeRequestCreateRequests)
        .where(
          and(
            eq(changeRequestCreateRequests.tenant_id, tenantA),
            eq(
              changeRequestCreateRequests.idempotency_key,
              'change-request-integration-1'
            )
          )
        )
        .limit(1)
      expect(idempotency).toMatchObject({
        state: 'succeeded',
        changeRequestId: first.changeRequestId,
      })

      const [changeRequestCount] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.tenant_id, tenantA),
            eq(changeRequests.opportunity_id, opportunityA)
          )
        )
      expect(changeRequestCount?.count).toBe(1)

      const [notificationCount] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.tenant_id, tenantA),
            eq(notifications.recipient_user_id, designA)
          )
        )
      expect(notificationCount?.count).toBe(1)

      const [auditEntry] = await transaction
        .select({ action: auditLog.action, entityId: auditLog.entity_id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'change_request'),
            eq(auditLog.entity_id, first.changeRequestId)
          )
        )
        .limit(1)
      expect(auditEntry).toMatchObject({
        action: 'create',
        entityId: first.changeRequestId,
      })

      await expect(
        service.create(
          opportunityA,
          { ...command, priority: 'minor' },
          principalA,
          'change-request-integration-1'
        )
      ).rejects.toThrow('Idempotency key was already used')

      await expect(
        service.create(
          opportunityA,
          command,
          {
            ...principalA,
            userId: viewerA,
            role: 'viewer',
            email: `viewer-a-${suffix}@integration.test`,
          },
          'change-request-integration-viewer'
        )
      ).rejects.toThrow()

      await expect(
        service.create(
          opportunityB,
          command,
          principalA,
          'change-request-integration-cross-tenant'
        )
      ).rejects.toThrow('Opportunity not found')

      const [tenantBChangeRequests] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(changeRequests)
        .where(eq(changeRequests.tenant_id, tenantB))
      expect(tenantBChangeRequests?.count).toBe(0)
    })
  })
})
