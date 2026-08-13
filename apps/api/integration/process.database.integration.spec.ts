import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  processSteps,
  slaClocks,
  taskInstances,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, desc, eq } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { ProcessController } from '../src/process/process.controller'
import { ProcessService } from '../src/process/process.service'

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
          callback: (
            scopedTransaction: DatabaseTransaction
          ) => unknown
        ) => callback(transaction)
      }

      const value = Reflect.get(
        transaction as unknown as object,
        property
      )
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

type IdResponse = { id: string }
type ClockResponse = { id: string; status: string; observeMode: boolean }

suite('Process API database integration', () => {
  it('runs a tenant-bound process, SLA, status, audit, and rollback journey', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const adminA = randomUUID()
      const viewerA = randomUUID()
      const adminB = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      const subjectA = randomUUID()
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Process Integration A',
          slug: `process-integration-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Process Integration B',
          slug: `process-integration-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `process-admin-a-${suffix}@integration.test`,
          full_name: 'Process Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `process-viewer-a-${suffix}@integration.test`,
          full_name: 'Process Viewer A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `process-admin-b-${suffix}@integration.test`,
          full_name: 'Process Admin B',
          role: 'admin',
        },
      ])

      const identities = new Map([
        ['process-admin-a-token', adminA],
        ['process-viewer-a-token', viewerA],
        ['process-admin-b-token', adminB],
      ])
      const identity = {
        verifyAccessToken: async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        },
      }
      const database = transactionBoundDatabase(transaction)
      const moduleRef = await Test.createTestingModule({
        controllers: [ProcessController],
        providers: [
          Reflector,
          ProcessService,
          AuditService,
          SupabaseJwtGuard,
          CapabilityGuard,
          {
            provide: SupabaseIdentityService,
            useValue: identity,
          },
          {
            provide: DatabaseService,
            useValue: database,
          },
          {
            provide: APP_GUARD,
            useExisting: SupabaseJwtGuard,
          },
          {
            provide: APP_GUARD,
            useExisting: CapabilityGuard,
          },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
      await app.init()

      try {
        const stepCommand = {
          code: 'PR-INTEGRATION',
          stage: 'lead',
          name: 'Integration qualification',
          responsibleBu: 'Sales',
          input: 'Qualified lead',
          inputFrom: 'Coverage',
          output: 'Qualified opportunity',
          outputBy: 'Sales',
          slaDays: 2,
          isBusinessDays: true,
          clockScope: 'internal',
        }

        await request(app.getHttpServer())
          .get('/v1/process/health')
          .expect(401)

        await request(app.getHttpServer())
          .post('/v1/process/steps')
          .set('Authorization', 'Bearer process-viewer-a-token')
          .send(stepCommand)
          .expect(403)

        const stepResponse = await request(app.getHttpServer())
          .post('/v1/process/steps')
          .set('Authorization', 'Bearer process-admin-a-token')
          .send(stepCommand)
          .expect(201)
        const stepId = (stepResponse.body as IdResponse).id

        const tenantBStepResponse = await request(app.getHttpServer())
          .post('/v1/process/steps')
          .set('Authorization', 'Bearer process-admin-b-token')
          .send({ ...stepCommand, code: 'PR-OTHER-TENANT' })
          .expect(201)
        const tenantBStepId = (tenantBStepResponse.body as IdResponse).id

        const tenantASteps = await request(app.getHttpServer())
          .get('/v1/process/steps')
          .set('Authorization', 'Bearer process-admin-a-token')
          .expect(200)
        expect(tenantASteps.body).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: stepId })])
        )
        expect(tenantASteps.body).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: tenantBStepId }),
          ])
        )

        const taskResponse = await request(app.getHttpServer())
          .post('/v1/process/tasks')
          .set('Authorization', 'Bearer process-admin-a-token')
          .send({
            processStepId: stepId,
            subjectType: 'opportunity',
            subjectId: subjectA,
            instanceKey: `opportunity:${subjectA}:PR-INTEGRATION`,
            assignedTo: adminA,
          })
          .expect(201)
        const taskId = (taskResponse.body as IdResponse).id

        const clockResponse = await request(app.getHttpServer())
          .post(`/v1/process/tasks/${taskId}/clock`)
          .set('Authorization', 'Bearer process-admin-a-token')
          .send({
            startedAt: '2026-08-12T00:00:00.000Z',
            observeMode: true,
            timeZone: 'Asia/Manila',
          })
          .expect(201)
        const clockId = (clockResponse.body as ClockResponse).id
        expect((clockResponse.body as ClockResponse).observeMode).toBe(true)

        const observedBreach = await request(app.getHttpServer())
          .post(`/v1/process/sla-clocks/${clockId}/evaluate`)
          .set('Authorization', 'Bearer process-admin-a-token')
          .send({ now: '2026-08-25T00:00:00.000Z' })
          .expect(201)
        expect((observedBreach.body as ClockResponse).status).toBe('breached')

        await request(app.getHttpServer())
          .patch(`/v1/process/sla-clocks/${clockId}/observe-mode`)
          .set('Authorization', 'Bearer process-admin-a-token')
          .send({ observeMode: false })
          .expect(200)

        const escalated = await request(app.getHttpServer())
          .post(`/v1/process/sla-clocks/${clockId}/evaluate`)
          .set('Authorization', 'Bearer process-admin-a-token')
          .send({ now: '2026-08-25T00:00:00.000Z' })
          .expect(201)
        expect((escalated.body as ClockResponse).status).toBe('escalated')

        await request(app.getHttpServer())
          .patch(`/v1/process/tasks/${taskId}/status`)
          .set('Authorization', 'Bearer process-admin-a-token')
          .send({ status: 'completed' })
          .expect(200)

        const [completedClock] = await transaction
          .select({ status: slaClocks.status })
          .from(slaClocks)
          .where(
            and(
              eq(slaClocks.id, clockId),
              eq(slaClocks.tenant_id, tenantA)
            )
          )
          .limit(1)
        expect(completedClock?.status).toBe('completed')

        const [taskAudit] = await transaction
          .select({ actorId: auditLog.actor_id })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'task_instances'),
              eq(auditLog.entity_id, taskId),
              eq(auditLog.action, 'update')
            )
          )
          .orderBy(desc(auditLog.id))
          .limit(1)
        expect(taskAudit?.actorId).toBe(adminA)
      } finally {
        await app.close()
      }
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
