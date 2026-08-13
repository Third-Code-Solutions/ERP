import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  changeRequests,
  db,
  designFiles,
  opportunities,
  pprfSubmissions,
  projects,
  siteInspections,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { OpportunitiesController } from '../src/crm/opportunities.controller'
import { OpportunitiesService } from '../src/crm/opportunities.service'

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

suite('Opportunities protected HTTP canary', () => {
  it('proves auth, tenant concealment, related names, progress projection, and rollback boundaries', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const salesA = randomUUID()
    const salesB = randomUUID()
    const accountA = randomUUID()
    const accountB = randomUUID()
    const projectA = randomUUID()
    const projectB = randomUUID()
    const opportunityA = randomUUID()
    const opportunityB = randomUUID()
    const inspectionA = randomUUID()
    const inspectionB = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    const observedAt = new Date('2026-08-10T03:00:00.000Z')

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Opportunities HTTP Tenant A',
          slug: `opportunities-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Opportunities HTTP Tenant B',
          slug: `opportunities-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: salesA,
          tenant_id: tenantA,
          email: `opportunities-sales-a-${suffix}@integration.test`,
          full_name: 'Opportunities Sales A',
          role: 'sales',
        },
        {
          id: salesB,
          tenant_id: tenantB,
          email: `opportunities-sales-b-${suffix}@integration.test`,
          full_name: 'Opportunities Sales B',
          role: 'sales',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: 'Opportunity Client A',
          industry: 'office',
          kyc_status: 'approved',
          created_by: salesA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: 'Opportunity Client B',
          industry: 'industrial',
          kyc_status: 'approved',
          created_by: salesB,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          account_id: accountA,
          name: 'Opportunity Project A',
          client: 'Opportunity Client A',
          project_type: 'fit_out',
          status: 'lead',
          created_by: salesA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          account_id: accountB,
          name: 'Opportunity Project B',
          client: 'Opportunity Client B',
          project_type: 'mep',
          status: 'active',
          created_by: salesB,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(opportunities).values([
        {
          id: opportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          project_id: projectA,
          rep_id: salesA,
          stage: 'negotiation',
          tcv_cents: 1_000_000,
          gp_cents: 200_000,
          probability: 60,
          weighted_tcv_cents: 600_000,
          area_sqm: 850,
          opportunity_type: 'office fit-out',
          closing_date: new Date('2026-09-15T00:00:00.000Z'),
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: opportunityB,
          tenant_id: tenantB,
          account_id: accountB,
          project_id: projectB,
          rep_id: salesB,
          stage: 'lead',
          tcv_cents: 2_000_000,
          gp_cents: 300_000,
          probability: 20,
          weighted_tcv_cents: 400_000,
          area_sqm: 500,
          opportunity_type: 'industrial works',
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(pprfSubmissions).values([
        {
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          version: 1,
          payload: { site_address: 'A draft' },
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          version: 2,
          payload: { site_address: 'A final' },
          submitted_at: observedAt,
          submitted_by: salesA,
          created_at: new Date(observedAt.getTime() + 1_000),
          updated_at: new Date(observedAt.getTime() + 1_000),
        },
        {
          tenant_id: tenantB,
          opportunity_id: opportunityB,
          version: 1,
          payload: { site_address: 'B final' },
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(siteInspections).values([
        {
          id: inspectionA,
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          status: 'submitted',
          payload: { safety: 'passed' },
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: inspectionB,
          tenant_id: tenantB,
          opportunity_id: opportunityB,
          status: 'draft',
          payload: { safety: 'pending' },
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(designFiles).values([
        {
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          file_type: 'initial_layout',
          name: 'A layout',
          is_client_approved: true,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          file_type: 'final_rendering',
          name: 'A rendering',
          is_client_approved: true,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          file_type: 'revised',
          name: 'A revision',
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          tenant_id: tenantB,
          opportunity_id: opportunityB,
          file_type: 'initial_layout',
          name: 'B layout',
          is_client_approved: true,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(changeRequests).values([
        {
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          requested_by_name: 'Client A',
          description: 'Open A change',
          priority: 'major',
          created_at: observedAt,
        },
        {
          tenant_id: tenantA,
          opportunity_id: opportunityA,
          requested_by_name: 'Client A',
          description: 'Resolved A change',
          priority: 'minor',
          resolved_at: observedAt,
          resolved_by: salesA,
          created_at: observedAt,
        },
        {
          tenant_id: tenantB,
          opportunity_id: opportunityB,
          requested_by_name: 'Client B',
          description: 'B change',
          priority: 'minor',
          created_at: observedAt,
        },
      ])

      const identities = new Map([
        ['sales-a-token', salesA],
        ['sales-b-token', salesB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const moduleRef = await Test.createTestingModule({
        controllers: [OpportunitiesController],
        providers: [
          Reflector,
          OpportunitiesService,
          SupabaseJwtGuard,
          CapabilityGuard,
          {
            provide: SupabaseIdentityService,
            useValue: identity,
          },
          {
            provide: DatabaseService,
            useValue: transactionBoundDatabase(transaction),
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
        await request(app.getHttpServer())
          .get(`/v1/crm/opportunities/${opportunityA}`)
          .expect(401)

        const detailA = await request(app.getHttpServer())
          .get(`/v1/crm/opportunities/${opportunityA}`)
          .set('Authorization', 'Bearer sales-a-token')
          .expect(200)
        expect(detailA.body).toMatchObject({
          opportunity: {
            id: opportunityA,
            tenantId: tenantA,
            stage: 'negotiation',
            accountId: accountA,
            projectId: projectA,
            accountName: 'Opportunity Client A',
            projectName: 'Opportunity Project A',
          },
          progress: {
            latestPprfVersion: 2,
            latestInspection: { id: inspectionA, status: 'submitted' },
            designCount: 3,
            approvedDesignCount: 2,
            openChangeRequestCount: 1,
          },
        })

        await request(app.getHttpServer())
          .get(`/v1/crm/opportunities/${opportunityB}`)
          .set('Authorization', 'Bearer sales-a-token')
          .expect(404)

        const detailB = await request(app.getHttpServer())
          .get(`/v1/crm/opportunities/${opportunityB}`)
          .set('Authorization', 'Bearer sales-b-token')
          .expect(200)
        expect(detailB.body).toMatchObject({
          opportunity: {
            id: opportunityB,
            tenantId: tenantB,
            accountName: 'Opportunity Client B',
            projectName: 'Opportunity Project B',
          },
          progress: {
            latestPprfVersion: 1,
            latestInspection: { id: inspectionB, status: 'draft' },
            designCount: 1,
            approvedDesignCount: 1,
            openChangeRequestCount: 1,
          },
        })

        await request(app.getHttpServer())
          .get('/v1/crm/opportunities/not-a-uuid')
          .set('Authorization', 'Bearer sales-a-token')
          .expect(400)
      } finally {
        await app.close()
      }
    })
  })
})
