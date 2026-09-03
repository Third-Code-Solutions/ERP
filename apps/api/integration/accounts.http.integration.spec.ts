import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accountKycArtifacts,
  accounts,
  contacts,
  db,
  opportunities,
  projects,
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
import { AccountsController } from '../src/crm/accounts.controller'
import { AccountsService } from '../src/crm/accounts.service'

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

suite('Accounts protected HTTP canary', () => {
  it('proves auth, capability, filter, detail, KYC, tenant isolation, and rollback boundaries', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const viewerA = randomUUID()
    const financeA = randomUUID()
    const viewerB = randomUUID()
    const accountA1 = randomUUID()
    const accountA2 = randomUUID()
    const accountB1 = randomUUID()
    const contactA1 = randomUUID()
    const opportunityA1 = randomUUID()
    const opportunityB1 = randomUUID()
    const projectA1 = randomUUID()
    const projectB1 = randomUUID()
    const artifactA2 = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    const observedAt = new Date('2026-08-10T02:00:00.000Z')

    await alwaysRollback(async (transaction) => {
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Accounts HTTP Tenant A',
          slug: `accounts-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Accounts HTTP Tenant B',
          slug: `accounts-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `accounts-viewer-a-${suffix}@integration.test`,
          full_name: 'Accounts Viewer A',
          role: 'viewer',
        },
        {
          id: financeA,
          tenant_id: tenantA,
          email: `accounts-finance-a-${suffix}@integration.test`,
          full_name: 'Accounts Finance A',
          role: 'finance',
        },
        {
          id: viewerB,
          tenant_id: tenantB,
          email: `accounts-viewer-b-${suffix}@integration.test`,
          full_name: 'Accounts Viewer B',
          role: 'viewer',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA1,
          tenant_id: tenantA,
          name: 'Acme Office A',
          industry: 'office',
          primary_email: `acme-a-${suffix}@integration.test`,
          primary_phone: '+63 900 000 0001',
          kyc_status: 'approved',
          created_by: viewerA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: accountA2,
          tenant_id: tenantA,
          name: 'Residential Lead A',
          industry: 'residential',
          kyc_status: 'pending',
          created_by: viewerA,
          created_at: new Date(observedAt.getTime() + 1_000),
          updated_at: new Date(observedAt.getTime() + 1_000),
        },
        {
          id: accountB1,
          tenant_id: tenantB,
          name: 'Acme Office B',
          industry: 'office',
          kyc_status: 'approved',
          created_by: viewerB,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(contacts).values({
        id: contactA1,
        tenant_id: tenantA,
        account_id: accountA1,
        full_name: 'Ada Account A',
        email: `ada-${suffix}@integration.test`,
        role_title: 'Owner',
        is_primary: true,
        created_at: observedAt,
        updated_at: observedAt,
      })
      await transaction.insert(opportunities).values([
        {
          id: opportunityA1,
          tenant_id: tenantA,
          account_id: accountA1,
          stage: 'lead',
          tcv_cents: 125_00,
          gp_cents: 25_00,
          probability: 20,
          weighted_tcv_cents: 25_00,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: opportunityB1,
          tenant_id: tenantB,
          account_id: accountB1,
          stage: 'negotiation',
          tcv_cents: 200_00,
          gp_cents: 40_00,
          probability: 50,
          weighted_tcv_cents: 100_00,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA1,
          tenant_id: tenantA,
          account_id: accountA1,
          name: 'Acme Fit-out A',
          client: 'Acme Office A',
          project_type: 'fit_out',
          status: 'active',
          created_by: viewerA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: projectB1,
          tenant_id: tenantB,
          account_id: accountB1,
          name: 'Acme Fit-out B',
          client: 'Acme Office B',
          project_type: 'fit_out',
          status: 'lead',
          created_by: viewerB,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(accountKycArtifacts).values({
        id: artifactA2,
        tenant_id: tenantA,
        account_id: accountA2,
        artifact_type: 'vat_certificate',
        notes: 'Pending review artifact',
        uploaded_by: financeA,
        uploaded_at: observedAt,
      })

      const identities = new Map([
        ['viewer-a-token', viewerA],
        ['finance-a-token', financeA],
        ['viewer-b-token', viewerB],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const database = transactionBoundDatabase(transaction)
      const moduleRef = await Test.createTestingModule({
        controllers: [AccountsController],
        providers: [
          Reflector,
          AccountsService,
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
          .get('/v1/crm/accounts')
          .expect(401)

        const filteredA = await request(app.getHttpServer())
          .get(
            '/v1/crm/accounts?q=acme&industry=office&kycStatus=approved&sort=name&order=asc&limit=1'
          )
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(filteredA.body).toMatchObject({
          total: 1,
          page: 1,
          limit: 1,
          totalPages: 1,
        })
        expect(filteredA.body.rows).toHaveLength(1)
        expect(filteredA.body.rows[0]).toMatchObject({
          id: accountA1,
          tenantId: tenantA,
          name: 'Acme Office A',
          opportunityCount: 1,
        })

        const tenantAList = await request(app.getHttpServer())
          .get('/v1/crm/accounts?sort=name&order=asc&limit=20')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(tenantAList.body.rows.map((row: { id: string }) => row.id)).toEqual([
          accountA1,
          accountA2,
        ])
        expect(tenantAList.body.rows).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: accountB1 })])
        )

        await request(app.getHttpServer())
          .get('/v1/crm/accounts?limit=101')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(400)

        const detailA = await request(app.getHttpServer())
          .get(`/v1/crm/accounts/${accountA1}`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)
        expect(detailA.body).toMatchObject({
          account: {
            id: accountA1,
            tenantId: tenantA,
            opportunityCount: 1,
          },
          contacts: [
            expect.objectContaining({
              id: contactA1,
              tenantId: tenantA,
              accountId: accountA1,
            }),
          ],
          kycArtifacts: [],
          opportunities: [
            expect.objectContaining({
              id: opportunityA1,
              tenantId: tenantA,
              accountId: accountA1,
            }),
          ],
          projects: [
            expect.objectContaining({
              id: projectA1,
              tenantId: tenantA,
              accountId: accountA1,
            }),
          ],
        })

        await request(app.getHttpServer())
          .get(`/v1/crm/accounts/${accountB1}`)
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(404)

        const tenantBDetail = await request(app.getHttpServer())
          .get(`/v1/crm/accounts/${accountB1}`)
          .set('Authorization', 'Bearer viewer-b-token')
          .expect(200)
        expect(tenantBDetail.body.account).toMatchObject({
          id: accountB1,
          tenantId: tenantB,
          opportunityCount: 1,
        })
        expect(tenantBDetail.body.opportunities).toEqual([
          expect.objectContaining({ id: opportunityB1, tenantId: tenantB }),
        ])

        const viewerKycQueueA = await request(app.getHttpServer())
          .get('/v1/crm/accounts/kyc-queue')
          .set('Authorization', 'Bearer viewer-a-token')
          .expect(200)

        const kycQueueA = await request(app.getHttpServer())
          .get('/v1/crm/accounts/kyc-queue')
          .set('Authorization', 'Bearer finance-a-token')
          .expect(200)
        expect(kycQueueA.body).toMatchObject({
          total: 1,
          limit: 200,
          truncated: false,
          rows: [
            expect.objectContaining({
              id: accountA2,
              tenantId: tenantA,
              artifactCount: 1,
            }),
          ],
        })
        expect(viewerKycQueueA.body).toEqual(kycQueueA.body)
        expect(kycQueueA.body.rows).not.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: accountB1 })])
        )
      } finally {
        await app.close()
      }
    })
  })
})
