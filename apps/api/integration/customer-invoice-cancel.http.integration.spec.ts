import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  customerInvoiceCancelRequests,
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
import { CustomerInvoiceCancelController } from '../src/finance/customer-invoice-cancel.controller'
import { CustomerInvoiceCancelService } from '../src/finance/customer-invoice-cancel.service'

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

suite('Customer invoice cancel protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, state, audit, and rollback', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const financeA = randomUUID()
    const viewerA = randomUUID()
    const financeB = randomUUID()
    const accountA = randomUUID()
    const accountB = randomUUID()
    const projectA = randomUUID()
    const projectB = randomUUID()
    const invoiceA = randomUUID()
    const invoiceB = randomUUID()
    const invoiceC = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      observedTenantId = tenantA
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Customer invoice cancel HTTP tenant A',
          slug: `customer-invoice-cancel-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Customer invoice cancel HTTP tenant B',
          slug: `customer-invoice-cancel-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: financeA,
          tenant_id: tenantA,
          email: `customer-invoice-cancel-http-finance-a-${suffix}@integration.test`,
          full_name: 'Customer invoice cancel finance A',
          role: 'finance',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `customer-invoice-cancel-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Customer invoice cancel viewer A',
          role: 'viewer',
        },
        {
          id: financeB,
          tenant_id: tenantB,
          email: `customer-invoice-cancel-http-finance-b-${suffix}@integration.test`,
          full_name: 'Customer invoice cancel finance B',
          role: 'finance',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: `Customer invoice cancel account A ${suffix}`,
          created_by: financeA,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: `Customer invoice cancel account B ${suffix}`,
          created_by: financeB,
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          account_id: accountA,
          name: 'Customer invoice cancel project A',
          client: 'Tenant A client',
          created_by: financeA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          account_id: accountB,
          name: 'Customer invoice cancel project B',
          client: 'Tenant B client',
          created_by: financeB,
        },
      ])
      await transaction.insert(invoices).values([
        {
          id: invoiceA,
          tenant_id: tenantA,
          project_id: projectA,
          account_id: accountA,
          created_by: financeA,
          invoice_number: `INV-CANCEL-A-${suffix}`,
          status: 'draft',
          billing_percent_bps: 10000,
          retention_bps: 0,
          subtotal_cents: 100000,
          retention_cents: 0,
          vat_cents: 0,
          withholding_tax_cents: 0,
          net_amount_cents: 100000,
        },
        {
          id: invoiceB,
          tenant_id: tenantB,
          project_id: projectB,
          account_id: accountB,
          created_by: financeB,
          invoice_number: `INV-CANCEL-B-${suffix}`,
          status: 'draft',
          billing_percent_bps: 10000,
          retention_bps: 0,
          subtotal_cents: 100000,
          retention_cents: 0,
          vat_cents: 0,
          withholding_tax_cents: 0,
          net_amount_cents: 100000,
        },
        {
          id: invoiceC,
          tenant_id: tenantA,
          project_id: projectA,
          account_id: accountA,
          created_by: financeA,
          invoice_number: `INV-CANCEL-C-${suffix}`,
          status: 'draft',
          billing_percent_bps: 10000,
          retention_bps: 0,
          subtotal_cents: 100000,
          retention_cents: 0,
          vat_cents: 0,
          withholding_tax_cents: 0,
          net_amount_cents: 100000,
        },
      ])

      const identities = new Map([
        ['customer-invoice-cancel-http-finance-a-token', financeA],
        ['customer-invoice-cancel-http-viewer-a-token', viewerA],
        ['customer-invoice-cancel-http-finance-b-token', financeB],
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
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [CustomerInvoiceCancelController],
        providers: [
          CustomerInvoiceCancelService,
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
        const route = `/v1/finance/customer-invoices/${invoiceA}/cancel`

        await request(app.getHttpServer()).post(route).send({}).expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'customer-invoice-cancel-http-1')
          .send({})
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send({})
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send({})
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(`/v1/finance/customer-invoices/${invoiceB}/cancel`)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send({})
          .expect(404)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-finance-a-token')
          .set('Idempotency-Key', ' customer-invoice-cancel-http-1 ')
          .send({})
          .expect(200)
        expect(first.body).toEqual({
          invoiceId: invoiceA,
          tenantId: tenantA,
          status: 'cancelled',
        })

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-finance-a-token')
          .set('Idempotency-Key', 'customer-invoice-cancel-http-1')
          .send({})
          .expect(200)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(`/v1/finance/customer-invoices/${invoiceC}/cancel`)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-finance-a-token')
          .set('Idempotency-Key', 'customer-invoice-cancel-http-1')
          .send({})
          .expect(409)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-cancel-http-finance-a-token')
          .set('Idempotency-Key', 'second-command')
          .send({})
          .expect(409)

        const [invoiceAState] = await transaction
          .select({ status: invoices.status })
          .from(invoices)
          .where(and(eq(invoices.tenant_id, tenantA), eq(invoices.id, invoiceA)))
          .limit(1)
        const [invoiceBState] = await transaction
          .select({ status: invoices.status })
          .from(invoices)
          .where(and(eq(invoices.tenant_id, tenantB), eq(invoices.id, invoiceB)))
          .limit(1)
        expect(invoiceAState).toEqual({ status: 'cancelled' })
        expect(invoiceBState).toEqual({ status: 'draft' })

        const [requestLedger] = await transaction
          .select({ state: customerInvoiceCancelRequests.state })
          .from(customerInvoiceCancelRequests)
          .where(
            and(
              eq(customerInvoiceCancelRequests.tenant_id, tenantA),
              eq(
                customerInvoiceCancelRequests.idempotency_key,
                'customer-invoice-cancel-http-1'
              )
            )
          )
          .limit(1)
        expect(requestLedger).toEqual({ state: 'succeeded' })

        const [auditCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'invoice'),
              eq(auditLog.entity_id, invoiceA),
              eq(auditLog.action, 'status_change')
            )
          )
        expect(auditCount?.count).toBe(1)

        const [tenantBInvoiceAuditCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantB),
              eq(auditLog.entity_type, 'invoice'),
              eq(auditLog.entity_id, invoiceB),
              eq(auditLog.action, 'status_change')
            )
          )
        expect(tenantBInvoiceAuditCount?.count).toBe(0)
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
