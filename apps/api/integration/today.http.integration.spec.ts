import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  dailyTasks,
  db,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import type {
  AuthenticatedRequest,
  ErpRole,
  ErpPrincipal,
} from '../src/auth/current-principal.decorator'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { RequestObservabilityMiddleware } from '../src/observability/request-observability.middleware'
import { TodayController } from '../src/today/today.controller'
import { TodayService } from '../src/today/today.service'
import type { NextFunction, Request, Response } from 'express'
import type { TodayQuery } from '@third-code-erp/shared-types'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')
const OBSERVED_AT = new Date('2026-08-10T03:00:00.000Z')
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

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

suite('Today protected HTTP canary', () => {
  it('proves identity, tenant/assignee scope, role rejection, request identity, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const userA = randomUUID()
    const otherAssigneeA = randomUUID()
    const userB = randomUUID()
    const projectA = randomUUID()
    const projectAOnHold = randomUUID()
    const projectB = randomUUID()
    const taskAOverdue = randomUUID()
    const taskAToday = randomUUID()
    const taskAUpcoming = randomUUID()
    const taskAOtherAssignee = randomUUID()
    const taskBOtherTenant = randomUUID()
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Today HTTP Tenant A',
          slug: `today-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Today HTTP Tenant B',
          slug: `today-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `today-http-a-${suffix}@integration.test`,
          full_name: 'Today HTTP A',
          role: 'viewer',
        },
        {
          id: otherAssigneeA,
          tenant_id: tenantA,
          email: `today-http-other-${suffix}@integration.test`,
          full_name: 'Today HTTP Other A',
          role: 'viewer',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `today-http-b-${suffix}@integration.test`,
          full_name: 'Today HTTP B',
          role: 'viewer',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Today Project A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          created_by: userA,
        },
        {
          id: projectAOnHold,
          tenant_id: tenantA,
          name: 'Today Project A On Hold',
          client: 'Client A On Hold',
          status: 'on_hold',
          project_type: 'mep',
          created_by: userA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Today Project B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          created_by: userB,
        },
      ])
      await transaction.insert(dailyTasks).values([
        {
          id: taskAOverdue,
          tenant_id: tenantA,
          project_id: projectA,
          assignee_id: userA,
          title: 'A overdue',
          due_date: new Date('2026-08-09T15:00:00.000Z'),
          status: 'pending',
        },
        {
          id: taskAToday,
          tenant_id: tenantA,
          project_id: projectA,
          assignee_id: userA,
          title: 'A today',
          due_date: new Date('2026-08-10T02:00:00.000Z'),
          status: 'pending',
        },
        {
          id: taskAUpcoming,
          tenant_id: tenantA,
          project_id: projectAOnHold,
          assignee_id: userA,
          title: 'A upcoming',
          due_date: new Date('2026-08-11T02:00:00.000Z'),
          status: 'pending',
        },
        {
          id: taskAOtherAssignee,
          tenant_id: tenantA,
          project_id: projectA,
          assignee_id: otherAssigneeA,
          title: 'A other assignee',
          due_date: new Date('2026-08-10T02:00:00.000Z'),
          status: 'pending',
        },
        {
          id: taskBOtherTenant,
          tenant_id: tenantB,
          project_id: projectB,
          assignee_id: userB,
          title: 'B today',
          due_date: new Date('2026-08-10T02:00:00.000Z'),
          status: 'pending',
        },
      ])

      const database = transactionBoundDatabase(transaction)
      const today = new TodayService(database)
      const identities = new Map([
        ['viewer-a-token', userA],
        ['other-assignee-a-token', otherAssigneeA],
        ['viewer-b-token', userB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const moduleRef = await Test.createTestingModule({
        controllers: [TodayController],
        providers: [
          Reflector,
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
            provide: TodayService,
            useValue: {
              read: (query: TodayQuery, principal: ErpPrincipal) =>
                today.read(query, principal, OBSERVED_AT),
            },
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

      try {
        await request(app.getHttpServer())
          .get('/v1/today')
          .set('x-request-id', REQUEST_ID)
          .expect(401)

        const tenantAResponse = await request(app.getHttpServer())
          .get('/v1/today?includeProjects=true')
          .set('Authorization', 'Bearer viewer-a-token')
          .set('x-request-id', REQUEST_ID)
          .expect(200)

        expect(tenantAResponse.headers['x-request-id']).toBe(REQUEST_ID)
        expect(tenantAResponse.body.summary).toEqual({
          dueToday: 1,
          overdue: 2,
          upcoming: 1,
        })
        expect(tenantAResponse.body.tasks.map((task: { title: string }) => task.title)).toEqual([
          'A overdue',
          'A today',
          'A upcoming',
        ])
        expect(tenantAResponse.body.projects).toHaveLength(2)
        expect(tenantAResponse.body.projects).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'Today Project A On Hold' }),
            expect.objectContaining({ name: 'Today Project A' }),
          ])
        )
        expect(tenantAResponse.body.tasks).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: 'A other assignee' }),
            expect.objectContaining({ title: 'B today' }),
          ])
        )

        const otherAssigneeResponse = await request(app.getHttpServer())
          .get('/v1/today?includeProjects=false')
          .set('Authorization', 'Bearer other-assignee-a-token')
          .expect(200)
        expect(otherAssigneeResponse.body.summary).toEqual({
          dueToday: 1,
          overdue: 1,
          upcoming: 0,
        })
        expect(otherAssigneeResponse.body.tasks.map((task: { title: string }) => task.title)).toEqual([
          'A other assignee',
        ])
        expect(otherAssigneeResponse.body.projects).toEqual([])

        const tenantBResponse = await request(app.getHttpServer())
          .get('/v1/today?includeProjects=true')
          .set('Authorization', 'Bearer viewer-b-token')
          .expect(200)
        expect(tenantBResponse.body.tasks.map((task: { title: string }) => task.title)).toEqual([
          'B today',
        ])
        expect(tenantBResponse.body.projects.map((project: { name: string }) => project.name)).toEqual([
          'Today Project B',
        ])

        await request(app.getHttpServer())
          .get('/v1/today?asOf=2026-08-10')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(400)

        expect(identity.verifyAccessToken).toHaveBeenCalledTimes(4)
      } finally {
        await app.close()
      }
    })

    const rolledBackTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(inArray(tenants.id, [tenantA, tenantB]))
    const rolledBackTasks = await db
      .select({ id: dailyTasks.id })
      .from(dailyTasks)
      .where(
        and(
          eq(dailyTasks.tenant_id, tenantA),
          inArray(dailyTasks.id, [
            taskAOverdue,
            taskAToday,
            taskAUpcoming,
            taskAOtherAssignee,
          ])
        )
      )
    expect(rolledBackTenants).toEqual([])
    expect(rolledBackTasks).toEqual([])
  })

  it('fails closed for an unsupported role at the HTTP capability boundary', async () => {
    const read = vi.fn()
    const moduleRef = await Test.createTestingModule({
      controllers: [TodayController],
      providers: [
        Reflector,
        {
          provide: TodayService,
          useValue: { read },
        },
        CapabilityGuard,
        {
          provide: APP_GUARD,
          useExisting: CapabilityGuard,
        },
      ],
    }).compile()
    const app = moduleRef.createNestApplication()
    app.use((req: Request, _res: Response, next: NextFunction) => {
      ;(req as AuthenticatedRequest).principal = {
        userId: randomUUID(),
        tenantId: randomUUID(),
        role: 'unsupported' as ErpRole,
        email: 'unsupported@example.test',
      }
      next()
    })
    await app.init()
    try {
      await request(app.getHttpServer())
        .get('/v1/today')
        .expect(403)
      expect(read).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})
