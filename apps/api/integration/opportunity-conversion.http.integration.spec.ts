import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  db,
  notifications,
  opportunities,
  opportunityProjectConversionRequests,
  preConChecklistItems,
  preConChecklists,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
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
import { OpportunityProjectConversionController } from '../src/crm/opportunity-project-conversion.controller'
import { OpportunityProjectConversionPipe } from '../src/crm/opportunity-project-conversion.pipe'
import { OpportunityProjectConversionService } from '../src/crm/opportunity-project-conversion.service'

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

suite('Opportunity conversion protected HTTP canary', () => {
  it('proves authorization, state, idempotency, atomic handoff, audit, tenant isolation, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const salesA = randomUUID()
    const adminA = randomUUID()
    const viewerA = randomUUID()
    const salesB = randomUUID()
    const accountA = randomUUID()
    const accountB = randomUUID()
    const wonOpportunityA = randomUUID()
    const secondWonOpportunityA = randomUUID()
    const leadOpportunityA = randomUUID()
    const wonOpportunityB = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    const observedAt = new Date('2026-08-10T04:00:00.000Z')

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Conversion HTTP Tenant A',
          slug: `conversion-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Conversion HTTP Tenant B',
          slug: `conversion-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: salesA,
          tenant_id: tenantA,
          email: `conversion-sales-a-${suffix}@integration.test`,
          full_name: 'Conversion Sales A',
          role: 'sales',
        },
        {
          id: adminA,
          tenant_id: tenantA,
          email: `conversion-admin-a-${suffix}@integration.test`,
          full_name: 'Conversion Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `conversion-viewer-a-${suffix}@integration.test`,
          full_name: 'Conversion Viewer A',
          role: 'viewer',
        },
        {
          id: salesB,
          tenant_id: tenantB,
          email: `conversion-sales-b-${suffix}@integration.test`,
          full_name: 'Conversion Sales B',
          role: 'sales',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: 'Conversion Client A',
          industry: 'office',
          kyc_status: 'approved',
          created_by: salesA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: 'Conversion Client B',
          industry: 'industrial',
          kyc_status: 'approved',
          created_by: salesB,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(opportunities).values([
        {
          id: wonOpportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          stage: 'won',
          opportunity_type: 'A warehouse fit-out',
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: secondWonOpportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          stage: 'won',
          opportunity_type: 'A second fit-out',
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: leadOpportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          stage: 'lead',
          opportunity_type: 'A lead',
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: wonOpportunityB,
          tenant_id: tenantB,
          account_id: accountB,
          stage: 'won',
          opportunity_type: 'B warehouse fit-out',
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])

      const identities = new Map([
        ['sales-a-token', salesA],
        ['admin-a-token', adminA],
        ['viewer-a-token', viewerA],
        ['sales-b-token', salesB],
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
          if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      }
      const database = transactionBoundDatabase(transaction)
      const moduleRef = await Test.createTestingModule({
        controllers: [OpportunityProjectConversionController],
        providers: [
          Reflector,
          OpportunityProjectConversionPipe,
          OpportunityProjectConversionService,
          AuditService,
          SupabaseJwtGuard,
          CapabilityGuard,
          {
            provide: ConfigService,
            useValue: config,
          },
          {
            provide: DatabaseService,
            useValue: database,
          },
          {
            provide: SupabaseIdentityService,
            useValue: identity,
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
          `/v1/crm/opportunities/${opportunityId}/convert-to-project`

        await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .send({})
          .expect(401)

        await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .set('Authorization', 'Bearer sales-a-token')
          .send({})
          .expect(400)

        await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .set('Authorization', 'Bearer sales-a-token')
          .set('Idempotency-Key', 'body-rejected')
          .send({ tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .set('Authorization', 'Bearer viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send({})
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .set('Authorization', 'Bearer sales-a-token')
          .set('Idempotency-Key', 'disabled-feature')
          .send({})
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .set('Authorization', 'Bearer sales-b-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send({})
          .expect(404)

        const conversion = await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .set('Authorization', 'Bearer sales-a-token')
          .set('Idempotency-Key', 'conversion-a')
          .send({})
          .expect(200)
        expect(conversion.body).toMatchObject({
          ok: true,
          opportunityId: wonOpportunityA,
          tenantId: tenantA,
          createdProject: true,
        })
        expect(conversion.body.projectId).toEqual(expect.any(String))
        expect(conversion.body.checklistId).toEqual(expect.any(String))

        const replay = await request(app.getHttpServer())
          .post(route(wonOpportunityA))
          .set('Authorization', 'Bearer sales-a-token')
          .set('Idempotency-Key', 'conversion-a')
          .send({})
          .expect(200)
        expect(replay.body).toEqual(conversion.body)

        await request(app.getHttpServer())
          .post(route(secondWonOpportunityA))
          .set('Authorization', 'Bearer sales-a-token')
          .set('Idempotency-Key', 'conversion-a')
          .send({})
          .expect(409)

        await request(app.getHttpServer())
          .post(route(leadOpportunityA))
          .set('Authorization', 'Bearer sales-a-token')
          .set('Idempotency-Key', 'lead-conversion')
          .send({})
          .expect(409)

        const [createdProject] = await transaction
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, conversion.body.projectId),
              eq(projects.tenant_id, tenantA)
            )
          )
          .limit(1)
        expect(createdProject).toMatchObject({
          tenant_id: tenantA,
          account_id: accountA,
          client: 'Conversion Client A',
          status: 'active',
          created_by: salesA,
        })

        const [linkedOpportunity] = await transaction
          .select({ projectId: opportunities.project_id })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.id, wonOpportunityA),
              eq(opportunities.tenant_id, tenantA)
            )
          )
          .limit(1)
        expect(linkedOpportunity?.projectId).toBe(conversion.body.projectId)

        const [checklist] = await transaction
          .select()
          .from(preConChecklists)
          .where(
            and(
              eq(preConChecklists.id, conversion.body.checklistId),
              eq(preConChecklists.tenant_id, tenantA),
              eq(preConChecklists.project_id, conversion.body.projectId)
            )
          )
          .limit(1)
        expect(checklist).toBeTruthy()

        const checklistItems = await transaction
          .select()
          .from(preConChecklistItems)
          .where(
            and(
              eq(preConChecklistItems.tenant_id, tenantA),
              eq(preConChecklistItems.checklist_id, conversion.body.checklistId)
            )
          )
        expect(checklistItems).toHaveLength(12)
        expect(checklistItems.filter((item) => item.sla_clock_started_at)).toHaveLength(6)

        const [idempotency] = await transaction
          .select()
          .from(opportunityProjectConversionRequests)
          .where(
            and(
              eq(opportunityProjectConversionRequests.tenant_id, tenantA),
              eq(opportunityProjectConversionRequests.idempotency_key, 'conversion-a')
            )
          )
          .limit(1)
        expect(idempotency).toMatchObject({
          state: 'succeeded',
          project_id: conversion.body.projectId,
          checklist_id: conversion.body.checklistId,
        })

        const tenantNotifications = await transaction
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.tenant_id, tenantA),
              eq(notifications.recipient_user_id, adminA)
            )
          )
        expect(tenantNotifications).toHaveLength(1)
        expect(tenantNotifications[0]).toMatchObject({
          subject: 'Project created from won opportunity',
          link_url: `/projects/${conversion.body.projectId}`,
        })

        const auditRows = await transaction
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.actor_id, salesA)
            )
          )
        const semanticAuditRows = auditRows.filter((row) => {
          if (
            !row.diff ||
            typeof row.diff !== 'object' ||
            Array.isArray(row.diff)
          ) {
            return false
          }
          return (
            (row.diff as Record<string, unknown>).source ===
            'opportunity_won_core'
          )
        })
        expect(semanticAuditRows).toHaveLength(3)
        expect(
          semanticAuditRows
            .sort((left, right) => left.id - right.id)
            .map((row) => row.entity_type)
        ).toEqual([
          'opportunity',
          'project',
          'pre_con_checklist',
        ])

        const otherTenantRows = await transaction
          .select()
          .from(opportunityProjectConversionRequests)
          .where(eq(opportunityProjectConversionRequests.tenant_id, tenantB))
        expect(otherTenantRows).toHaveLength(0)
      } finally {
        await app.close()
      }
    })
  })
})
