import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  dailyTasks,
  db,
  projects,
  slaLogs,
  tenants,
  users,
} from '@third-code-erp/database'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
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
import { DailyTaskCompletionController } from '../src/daily-tasks/daily-task-completion.controller'
import { DailyTaskCompletionPipe } from '../src/daily-tasks/daily-task-completion.pipe'
import { DailyTaskCompletionService } from '../src/daily-tasks/daily-task-completion.service'
import { RequestObservabilityMiddleware } from '../src/observability/request-observability.middleware'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')
const REQUEST_ID = '99999999-9999-4999-8999-999999999999'

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy(db, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => callback(transaction)
      }
      const value = Reflect.get(transaction, property)
      return typeof value === 'function' ? value.bind(transaction) : value
    },
  })
  return {
    client,
    ping: async () => undefined,
  }
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

suite('Daily task completion protected HTTP canary', () => {
  it('proves protected atomic completion, replay, role/tenant/assignee policy, SLA, audit, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const safetyA = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const safetyB = randomUUID()
    const projectA = randomUUID()
    const projectB = randomUUID()
    const taskA = randomUUID()
    const toolboxA = randomUUID()
    const overrideA = randomUUID()
    const taskB = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Daily completion tenant A',
          slug: `daily-completion-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Daily completion tenant B',
          slug: `daily-completion-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: safetyA,
          tenant_id: tenantA,
          email: `daily-safety-a-${suffix}@integration.test`,
          full_name: 'Daily Safety A',
          role: 'safety',
        },
        {
          id: adminA,
          tenant_id: tenantA,
          email: `daily-admin-a-${suffix}@integration.test`,
          full_name: 'Daily Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `daily-viewer-a-${suffix}@integration.test`,
          full_name: 'Daily Viewer A',
          role: 'viewer',
        },
        {
          id: safetyB,
          tenant_id: tenantB,
          email: `daily-safety-b-${suffix}@integration.test`,
          full_name: 'Daily Safety B',
          role: 'safety',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Daily Project A',
          client: 'Daily Client A',
          status: 'active',
          created_by: adminA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Daily Project B',
          client: 'Daily Client B',
          status: 'active',
          created_by: safetyB,
        },
      ])
      await transaction.insert(dailyTasks).values([
        {
          id: taskA,
          tenant_id: tenantA,
          project_id: projectA,
          assignee_id: safetyA,
          title: 'Daily site walk',
          due_date: new Date('2026-09-03T00:00:00.000Z'),
        },
        {
          id: toolboxA,
          tenant_id: tenantA,
          project_id: projectA,
          assignee_id: safetyA,
          title: 'Toolbox Meeting Log',
          due_date: new Date('2026-09-03T00:00:00.000Z'),
        },
        {
          id: overrideA,
          tenant_id: tenantA,
          project_id: projectA,
          assignee_id: safetyA,
          title: 'Admin closeout',
          due_date: new Date('2026-09-03T00:00:00.000Z'),
        },
        {
          id: taskB,
          tenant_id: tenantB,
          project_id: projectB,
          assignee_id: safetyB,
          title: 'Other tenant task',
          due_date: new Date('2026-09-03T00:00:00.000Z'),
        },
      ])
      await transaction.insert(slaLogs).values([
        {
          tenant_id: tenantA,
          entity_type: 'daily_task',
          entity_id: taskA,
          sla_label: 'daily_task.complete',
          sla_seconds: { breach_at_seconds: 86_400, warning_at_pct: 0.8 },
        },
        {
          tenant_id: tenantB,
          entity_type: 'daily_task',
          entity_id: taskB,
          sla_label: 'daily_task.complete',
          sla_seconds: { breach_at_seconds: 86_400, warning_at_pct: 0.8 },
        },
      ])

      const identities = new Map([
        ['daily-safety-a-token', safetyA],
        ['daily-admin-a-token', adminA],
        ['daily-viewer-a-token', viewerA],
        ['daily-safety-b-token', safetyB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const database = transactionBoundDatabase(transaction)
      const moduleRef = await Test.createTestingModule({
        controllers: [DailyTaskCompletionController],
        providers: [
          Reflector,
          DailyTaskCompletionPipe,
          DailyTaskCompletionService,
          AuditService,
          SupabaseJwtGuard,
          CapabilityGuard,
          { provide: DatabaseService, useValue: database },
          { provide: SupabaseIdentityService, useValue: identity },
          { provide: APP_GUARD, useExisting: SupabaseJwtGuard },
          { provide: APP_GUARD, useExisting: CapabilityGuard },
        ],
      }).compile()
      const app = moduleRef.createNestApplication()
      const observability = new RequestObservabilityMiddleware()
      app.use(observability.use.bind(observability))
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.init()

      const route = (taskId: string) =>
        `/v1/daily-tasks/${taskId}/completion`
      try {
        await request(app.getHttpServer())
          .post(route(taskA))
          .set('Idempotency-Key', 'unauthenticated')
          .send({})
          .expect(401)
        await request(app.getHttpServer())
          .post(route(taskA))
          .set('Authorization', 'Bearer daily-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send({})
          .expect(403)
        await request(app.getHttpServer())
          .post(route(taskB))
          .set('Authorization', 'Bearer daily-safety-a-token')
          .set('Idempotency-Key', 'foreign-task')
          .send({})
          .expect(404)
        await request(app.getHttpServer())
          .post(route(toolboxA))
          .set('Authorization', 'Bearer daily-safety-a-token')
          .set('Idempotency-Key', 'toolbox-missing-notes')
          .send({})
          .expect(409)

        const completed = await request(app.getHttpServer())
          .post(route(taskA))
          .set('Authorization', 'Bearer daily-safety-a-token')
          .set('Idempotency-Key', 'daily-complete-a')
          .set('x-request-id', REQUEST_ID)
          .send({ notes: '  Walk complete  ' })
          .expect(200)
        expect(completed.headers['x-request-id']).toBe(REQUEST_ID)
        expect(completed.body).toMatchObject({
          ok: true,
          taskId: taskA,
          tenantId: tenantA,
          projectId: projectA,
          assigneeId: safetyA,
          status: 'done',
          completionNotes: 'Walk complete',
          completedBy: safetyA,
        })
        const replay = await request(app.getHttpServer())
          .post(route(taskA))
          .set('Authorization', 'Bearer daily-safety-a-token')
          .set('Idempotency-Key', 'daily-complete-a')
          .send({ notes: 'Walk complete' })
          .expect(200)
        expect(replay.body).toEqual(completed.body)
        await request(app.getHttpServer())
          .post(route(taskA))
          .set('Authorization', 'Bearer daily-safety-a-token')
          .set('Idempotency-Key', 'daily-complete-a')
          .send({ notes: 'Different payload' })
          .expect(409)

        await request(app.getHttpServer())
          .post(route(toolboxA))
          .set('Authorization', 'Bearer daily-safety-a-token')
          .set('Idempotency-Key', 'toolbox-complete')
          .send({ notes: '  PPE and access reviewed  ' })
          .expect(200)
        await request(app.getHttpServer())
          .post(route(overrideA))
          .set('Authorization', 'Bearer daily-admin-a-token')
          .set('Idempotency-Key', 'admin-override')
          .send({})
          .expect(200)

        const [persisted] = await transaction
          .select()
          .from(dailyTasks)
          .where(
            and(
              eq(dailyTasks.tenant_id, tenantA),
              eq(dailyTasks.id, taskA)
            )
          )
          .limit(1)
        expect(persisted).toMatchObject({
          status: 'done',
          completion_notes: 'Walk complete',
          completed_by: safetyA,
        })
        expect(persisted?.completed_at).toBeInstanceOf(Date)

        const completedSlas = await transaction
          .select({ id: slaLogs.id })
          .from(slaLogs)
          .where(
            and(
              eq(slaLogs.tenant_id, tenantA),
              eq(slaLogs.entity_type, 'daily_task'),
              eq(slaLogs.entity_id, taskA),
              isNotNull(slaLogs.completed_at)
            )
          )
        expect(completedSlas).toHaveLength(1)
        const semanticAudits = await transaction
          .select({ diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'daily_task'),
              eq(auditLog.entity_id, taskA),
              eq(auditLog.action, 'status_change')
            )
          )
        expect(semanticAudits).toHaveLength(1)
        expect(semanticAudits[0]?.diff).toMatchObject({
          source: 'daily_task_completion_core',
          idempotency_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          command_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        })
        expect(JSON.stringify(semanticAudits)).not.toContain(
          'daily-complete-a'
        )
      } finally {
        await app.close()
      }
    })

    const rolledBackTasks = await db
      .select({ id: dailyTasks.id })
      .from(dailyTasks)
      .where(inArray(dailyTasks.id, [taskA, toolboxA, overrideA, taskB]))
    expect(rolledBackTasks).toEqual([])
  })
})
