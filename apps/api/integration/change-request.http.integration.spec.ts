import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  changeRequestCreateRequests,
  changeRequests,
  db,
  designFiles,
  notifications,
  opportunities,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { ChangeRequestsController } from '../src/crm/change-requests.controller'
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
        ) => transaction.transaction(callback)
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

suite('Change Request protected HTTP canary', () => {
  it('proves auth, capability, tenant, idempotency, notification, audit, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const adminB = randomUUID()
    const designA = randomUUID()
    const accountA = randomUUID()
    const accountB = randomUUID()
    const opportunityA = randomUUID()
    const opportunityB = randomUUID()
    const designFileA = randomUUID()
    const designFileB = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Change Request HTTP Tenant A',
          slug: `change-request-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Change Request HTTP Tenant B',
          slug: `change-request-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `change-request-http-admin-a-${suffix}@integration.test`,
          full_name: 'Change Request Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `change-request-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Change Request Viewer A',
          role: 'viewer',
        },
        {
          id: designA,
          tenant_id: tenantA,
          email: `change-request-http-design-a-${suffix}@integration.test`,
          full_name: 'Change Request Design A',
          role: 'design',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `change-request-http-admin-b-${suffix}@integration.test`,
          full_name: 'Change Request Admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: `Change Request Account A ${suffix}`,
          created_by: adminA,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: `Change Request Account B ${suffix}`,
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
      await transaction.insert(designFiles).values([
        {
          id: designFileA,
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          file_type: 'initial_layout',
          name: 'A initial layout',
        },
        {
          id: designFileB,
          tenant_id: tenantB,
          opportunity_id: opportunityB,
          file_type: 'initial_layout',
          name: 'B initial layout',
        },
      ])

      const identities = new Map([
        ['change-request-http-admin-a-token', adminA],
        ['change-request-http-viewer-a-token', viewerA],
        ['change-request-http-admin-b-token', adminB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const featureState = {
        enabled: true,
        tenantIds: [tenantA, tenantB],
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_CHANGE_REQUEST_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_CHANGE_REQUEST_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [ChangeRequestsController],
        providers: [
          ChangeRequestCreationService,
          AuditService,
          {
            provide: ConfigService,
            useValue: config,
          },
          {
            provide: DatabaseService,
            useValue: transactionBoundDatabase(transaction),
          },
          {
            provide: SupabaseIdentityService,
            useValue: identity,
          },
          {
            provide: APP_GUARD,
            useClass: SupabaseJwtGuard,
          },
          {
            provide: APP_GUARD,
            useClass: CapabilityGuard,
          },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.init()

      try {
        const route = (opportunityId: string) =>
          `/v1/crm/opportunities/${opportunityId}/change-requests`
        const command = {
          requestedByName: 'Client A',
          description: 'Move the kitchen island 300mm east.',
          priority: 'major',
          affectedDesignFileId: designFileA,
        }

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer unknown-token')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-a-token')
          .send(command)
          .expect(400)

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-a-token')
          .set('Idempotency-Key', 'disabled')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-b-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-a-token')
          .set('Idempotency-Key', 'wrong-design-file')
          .send({ ...command, affectedDesignFileId: designFileB })
          .expect(404)

        const first = await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-a-token')
          .set('Idempotency-Key', 'change-request-http-1')
          .send(command)
          .expect(201)
        expect(first.body).toMatchObject({
          tenantId: tenantA,
          status: 'open',
          created: true,
        })
        expect(first.body.changeRequestId).toEqual(expect.any(String))

        const replay = await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-a-token')
          .set('Idempotency-Key', 'change-request-http-1')
          .send(command)
          .expect(201)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(route(opportunityA))
          .set('Authorization', 'Bearer change-request-http-admin-a-token')
          .set('Idempotency-Key', 'change-request-http-1')
          .send({ ...command, priority: 'minor' })
          .expect(409)

        const [requestRow] = await transaction
          .select()
          .from(changeRequestCreateRequests)
          .where(
            and(
              eq(changeRequestCreateRequests.tenant_id, tenantA),
              eq(
                changeRequestCreateRequests.idempotency_key,
                'change-request-http-1'
              )
            )
          )
          .limit(1)
        expect(requestRow).toMatchObject({
          state: 'succeeded',
          change_request_id: first.body.changeRequestId,
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
              eq(auditLog.entity_id, first.body.changeRequestId)
            )
          )
          .limit(1)
        expect(auditEntry).toMatchObject({
          action: 'create',
          entityId: first.body.changeRequestId,
        })

        const [tenantBChangeRequests] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(changeRequests)
          .where(eq(changeRequests.tenant_id, tenantB))
        expect(tenantBChangeRequests?.count).toBe(0)

        const [tenantBRequestRows] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(changeRequestCreateRequests)
          .where(eq(changeRequestCreateRequests.tenant_id, tenantB))
        expect(tenantBRequestRows?.count).toBe(0)

        const [opportunityBChangeRequests] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(changeRequests)
          .where(
            and(
              eq(changeRequests.tenant_id, tenantB),
              eq(changeRequests.opportunity_id, opportunityB)
            )
          )
        expect(opportunityBChangeRequests?.count).toBe(0)
      } finally {
        await app.close()
      }
    })
  })
})
