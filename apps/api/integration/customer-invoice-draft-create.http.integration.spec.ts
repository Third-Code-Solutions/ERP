import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  boms,
  customerInvoiceDraftCreateRequests,
  db,
  invoices,
  projects,
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
import { CustomerInvoiceDraftCreateController } from '../src/finance/customer-invoice-draft-create.controller'
import { CustomerInvoiceDraftCreateService } from '../src/finance/customer-invoice-draft-create.service'

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

suite('Customer invoice draft create protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, money calculation, audit, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const financeA = randomUUID()
    const viewerA = randomUUID()
    const financeB = randomUUID()
    const accountA = randomUUID()
    const accountB = randomUUID()
    const projectA = randomUUID()
    const projectB = randomUUID()
    const bomA = randomUUID()
    const draftBomA = randomUUID()
    const invoiceB = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      observedTenantId = tenantA
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Customer invoice draft HTTP tenant A',
          slug: `customer-invoice-draft-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Customer invoice draft HTTP tenant B',
          slug: `customer-invoice-draft-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: financeA,
          tenant_id: tenantA,
          email: `customer-invoice-draft-http-finance-a-${suffix}@integration.test`,
          full_name: 'Customer invoice draft finance A',
          role: 'finance',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `customer-invoice-draft-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Customer invoice draft viewer A',
          role: 'viewer',
        },
        {
          id: financeB,
          tenant_id: tenantB,
          email: `customer-invoice-draft-http-finance-b-${suffix}@integration.test`,
          full_name: 'Customer invoice draft finance B',
          role: 'finance',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: `Customer invoice draft account A ${suffix}`,
          created_by: financeA,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: `Customer invoice draft account B ${suffix}`,
          created_by: financeB,
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          account_id: accountA,
          name: 'Customer invoice draft project A',
          client: 'Tenant A client',
          created_by: financeA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          account_id: accountB,
          name: 'Customer invoice draft project B',
          client: 'Tenant B client',
          created_by: financeB,
        },
      ])
      await transaction.insert(boms).values([
        {
          id: bomA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: financeA,
          approved_by: financeA,
          version: 1,
          label: 'Approved billing BOM',
          status: 'approved',
          total_cost_cents: 800_000,
          tcv_cents: 1_000_000,
          gp_cents: 200_000,
          gp_margin_bps: 2_000,
          approved_at: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: draftBomA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: financeA,
          version: 2,
          label: 'Draft billing BOM',
          status: 'draft',
          total_cost_cents: 900_000,
          tcv_cents: 1_100_000,
          gp_cents: 200_000,
          gp_margin_bps: 1_818,
        },
      ])
      await transaction.insert(invoices).values({
        id: invoiceB,
        tenant_id: tenantB,
        project_id: projectB,
        account_id: accountB,
        created_by: financeB,
        invoice_number: `INV-DRAFT-B-${suffix}`,
        status: 'draft',
        billing_percent_bps: 10000,
        retention_bps: 0,
        subtotal_cents: 100000,
        retention_cents: 0,
        vat_cents: 0,
        withholding_tax_cents: 0,
        net_amount_cents: 100000,
      })

      const identities = new Map([
        ['customer-invoice-draft-http-finance-a-token', financeA],
        ['customer-invoice-draft-http-viewer-a-token', viewerA],
        ['customer-invoice-draft-http-finance-b-token', financeB],
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
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [CustomerInvoiceDraftCreateController],
        providers: [
          CustomerInvoiceDraftCreateService,
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
        const route = `/v1/projects/${projectA}/customer-invoices`
        const command = {
          billingPercentBps: 2500,
          bomId: bomA,
          dueDate: '2026-09-15',
          notes: ' Progress billing ',
        }

        await request(app.getHttpServer()).post(route).send(command).expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'customer-invoice-draft-http-1')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-draft-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-draft-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-draft-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(`/v1/projects/${projectB}/customer-invoices`)
          .set('Authorization', 'Bearer customer-invoice-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-draft-http-finance-a-token')
          .set('Idempotency-Key', 'draft-bom')
          .send({ ...command, bomId: draftBomA })
          .expect(409)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-draft-http-finance-a-token')
          .set('Idempotency-Key', ' customer-invoice-draft-http-1 ')
          .send(command)
          .expect(201)
        expect(first.body).toMatchObject({
          tenantId: tenantA,
          projectId: projectA,
          status: 'draft',
          invoiceNumber: expect.stringMatching(/^INV-\d{6}-\d{3}$/),
          billingPercentBps: 2500,
          retentionBps: 1000,
          subtotalCents: 250000,
          retentionCents: 25000,
          vatCents: 27000,
          withholdingTaxCents: 4500,
          netAmountCents: 247500,
          dueDate: '2026-09-15T00:00:00.000Z',
          notes: 'Progress billing',
        })

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-draft-http-finance-a-token')
          .set('Idempotency-Key', 'customer-invoice-draft-http-1')
          .send(command)
          .expect(201)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-draft-http-finance-a-token')
          .set('Idempotency-Key', 'customer-invoice-draft-http-1')
          .send({ ...command, billingPercentBps: 5000 })
          .expect(409)

        const [createdInvoice] = await transaction
          .select({
            id: invoices.id,
            status: invoices.status,
            subtotalCents: invoices.subtotal_cents,
            netAmountCents: invoices.net_amount_cents,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.tenant_id, tenantA),
              eq(invoices.id, first.body.invoiceId)
            )
          )
          .limit(1)
        expect(createdInvoice).toEqual({
          id: first.body.invoiceId,
          status: 'draft',
          subtotalCents: 250000,
          netAmountCents: 247500,
        })

        const [requestLedger] = await transaction
          .select({
            state: customerInvoiceDraftCreateRequests.state,
            invoiceId: customerInvoiceDraftCreateRequests.invoice_id,
          })
          .from(customerInvoiceDraftCreateRequests)
          .where(
            and(
              eq(customerInvoiceDraftCreateRequests.tenant_id, tenantA),
              eq(
                customerInvoiceDraftCreateRequests.idempotency_key,
                'customer-invoice-draft-http-1'
              )
            )
          )
          .limit(1)
        expect(requestLedger).toEqual({
          state: 'succeeded',
          invoiceId: first.body.invoiceId,
        })

        const [auditCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'invoice'),
              eq(auditLog.entity_id, first.body.invoiceId),
              eq(auditLog.action, 'create')
            )
          )
        expect(auditCount?.count).toBe(1)

        const [tenantBInvoiceCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(invoices)
          .where(eq(invoices.tenant_id, tenantB))
        expect(tenantBInvoiceCount?.count).toBe(1)
      } finally {
        await app.close()
      }
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, observedTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 45_000)
})
