import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  db,
  fiscalPeriods,
  invoices,
  ledgerAccounts,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { FinanceReceivablesController } from '../src/finance/finance-receivables.controller'
import { FinanceReceivablesService } from '../src/finance/finance-receivables.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')
const FIXTURE_AS_OF = new Date('2026-08-06T12:00:00.000Z')

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

async function seedReceivables(
  transaction: DatabaseTransaction,
  label: string,
  options: { invoiceCount: 1 | 2 }
) {
  const suffix = randomUUID().slice(0, 12)
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const accountId = randomUUID()
  const projectId = randomUUID()
  const periodId = randomUUID()
  const systemAccountIds = {
    accountsReceivable: randomUUID(),
    retentionReceivable: randomUUID(),
    withholdingTaxReceivable: randomUUID(),
    outputVatPayable: randomUUID(),
    revenue: randomUUID(),
  }
  const invoiceIds = [randomUUID(), randomUUID()]

  await transaction.insert(tenants).values({
    id: tenantId,
    name: `Finance receivables HTTP tenant ${label}`,
    slug: `finance-receivables-http-${label}-${suffix}`,
  })
  await transaction.insert(users).values([
    {
      id: financeId,
      tenant_id: tenantId,
      email: `finance-receivables-${label}-${suffix}@integration.test`,
      full_name: `Finance receivables ${label}`,
      role: 'finance',
    },
    {
      id: viewerId,
      tenant_id: tenantId,
      email: `viewer-receivables-${label}-${suffix}@integration.test`,
      full_name: `Viewer receivables ${label}`,
      role: 'viewer',
    },
  ])
  await transaction.insert(accounts).values({
    id: accountId,
    tenant_id: tenantId,
    name: `Receivables customer ${label} ${suffix}`,
    created_by: financeId,
  })
  await transaction.insert(projects).values({
    id: projectId,
    tenant_id: tenantId,
    account_id: accountId,
    name: `Receivables project ${label}`,
    client: `Receivables client ${label}`,
    created_by: financeId,
  })
  await transaction.insert(fiscalPeriods).values({
    id: periodId,
    tenant_id: tenantId,
    name: `FY 2026 receivables ${label} ${suffix}`,
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    status: 'open',
    created_by: financeId,
  })
  await transaction.insert(ledgerAccounts).values([
    {
      id: systemAccountIds.accountsReceivable,
      tenant_id: tenantId,
      code: `1100-${label}-${suffix}`,
      name: 'Accounts receivable',
      account_type: 'asset',
      normal_balance: 'debit',
      system_key: 'accounts_receivable',
      created_by: financeId,
    },
    {
      id: systemAccountIds.retentionReceivable,
      tenant_id: tenantId,
      code: `1110-${label}-${suffix}`,
      name: 'Retention receivable',
      account_type: 'asset',
      normal_balance: 'debit',
      system_key: 'retention_receivable',
      created_by: financeId,
    },
    {
      id: systemAccountIds.withholdingTaxReceivable,
      tenant_id: tenantId,
      code: `1120-${label}-${suffix}`,
      name: 'Withholding tax receivable',
      account_type: 'asset',
      normal_balance: 'debit',
      system_key: 'withholding_tax_receivable',
      created_by: financeId,
    },
    {
      id: systemAccountIds.outputVatPayable,
      tenant_id: tenantId,
      code: `2100-${label}-${suffix}`,
      name: 'Output VAT payable',
      account_type: 'liability',
      normal_balance: 'credit',
      system_key: 'output_vat_payable',
      created_by: financeId,
    },
    {
      id: systemAccountIds.revenue,
      tenant_id: tenantId,
      code: `4000-${label}-${suffix}`,
      name: 'Project revenue',
      account_type: 'income',
      normal_balance: 'credit',
      system_key: 'revenue',
      created_by: financeId,
    },
  ])

  const invoiceValues = [
    {
      id: invoiceIds[0]!,
      tenant_id: tenantId,
      project_id: projectId,
      account_id: accountId,
      created_by: financeId,
      invoice_number: `INV-${label.toUpperCase()}-OVERDUE-${suffix}`,
      status: 'draft' as const,
      billing_percent_bps: 10000,
      retention_bps: 1000,
      subtotal_cents: 100000,
      retention_cents: 10000,
      vat_cents: 10800,
      withholding_tax_cents: 1800,
      net_amount_cents: 99000,
      due_date: new Date('2026-07-01T00:00:00.000Z'),
    },
  ]
  if (options.invoiceCount === 2) {
    invoiceValues.push({
      id: invoiceIds[1]!,
      tenant_id: tenantId,
      project_id: projectId,
      account_id: accountId,
      created_by: financeId,
      invoice_number: `INV-${label.toUpperCase()}-CURRENT-${suffix}`,
      status: 'draft' as const,
      billing_percent_bps: 10000,
      retention_bps: 1000,
      subtotal_cents: 50000,
      retention_cents: 5000,
      vat_cents: 5400,
      withholding_tax_cents: 900,
      net_amount_cents: 49500,
      due_date: new Date('2026-09-01T00:00:00.000Z'),
    })
  }
  await transaction.insert(invoices).values(invoiceValues)

  for (const [index, invoiceId] of invoiceValues.map((invoice) => invoice.id).entries()) {
    await transaction.execute(sql`
      select * from public.issue_customer_invoice(
        ${invoiceId}::uuid,
        ${financeId}::uuid,
        ${index === 0 ? '2026-07-01' : '2026-08-01'}::date
      )
    `)
  }

  return {
    tenantId,
    financeId,
    viewerId,
    accountId,
    projectId,
    invoiceIds: invoiceValues.map((invoice) => invoice.id),
  }
}

suite('Finance receivables protected HTTP canary', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXTURE_AS_OF)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('proves authorization, tenant isolation, exact totals, filters, pagination, and rollback', async () => {
    let observedTenantId = ''
    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedReceivables(transaction, 'a', {
        invoiceCount: 2,
      })
      const fixtureB = await seedReceivables(transaction, 'b', {
        invoiceCount: 1,
      })
      observedTenantId = fixtureA.tenantId
      const identities = new Map([
        ['receivables-finance-a-token', fixtureA.financeId],
        ['receivables-viewer-a-token', fixtureA.viewerId],
        ['receivables-finance-b-token', fixtureB.financeId],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const config = new ConfigService({
        ERP_FINANCE_RECEIVABLES_READS_ENABLED: true,
        ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS: [
          fixtureA.tenantId,
          fixtureB.tenantId,
        ],
      })

      const moduleRef = await Test.createTestingModule({
        controllers: [FinanceReceivablesController],
        providers: [
          FinanceReceivablesService,
          { provide: ConfigService, useValue: config },
          {
            provide: DatabaseService,
            useValue: transactionBoundDatabase(transaction),
          },
          { provide: SupabaseIdentityService, useValue: identity },
          { provide: APP_GUARD, useClass: SupabaseJwtGuard },
          { provide: APP_GUARD, useClass: CapabilityGuard },
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
        const route = '/v1/finance/receivables'

        await request(app.getHttpServer()).get(route).expect(401)
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer unknown-token')
          .expect(401)
        const viewerRead = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer receivables-viewer-a-token')
          .expect(200)
        await request(app.getHttpServer())
          .get(`${route}?dueFrom=2026-09-01&dueTo=2026-08-01`)
          .set('Authorization', 'Bearer receivables-finance-a-token')
          .expect(400)

        const first = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer receivables-finance-a-token')
          .expect(200)
        expect(viewerRead.body).toEqual(first.body)
        expect(first.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          asOfDate: '2026-08-06',
          total: 2,
          totalDueCents: 148500,
          totalRetentionCents: 15000,
          totalWithheldCents: 2700,
          overdueTotalCents: 99000,
          overdueCount: 1,
          page: 1,
          limit: 1,
          totalPages: 2,
        })
        expect(first.body.rows).toHaveLength(1)
        expect(first.body.rows[0]).toMatchObject({
          id: fixtureA.invoiceIds[1],
          invoiceNumber: expect.stringContaining('CURRENT'),
          status: 'issued',
          netAmountCents: 49500,
          retentionCents: 5000,
          withholdingTaxCents: 900,
          currentAllocatedCents: 0,
          retentionAllocatedCents: 0,
          currentOpenCents: 49500,
          retentionOpenCents: 5000,
          projectId: fixtureA.projectId,
          accountId: fixtureA.accountId,
        })
        expect(first.body.rows[0].dueDate).toBe('2026-09-01T00:00:00.000Z')

        const pageTwo = await request(app.getHttpServer())
          .get(`${route}?page=2&limit=1`)
          .set('Authorization', 'Bearer receivables-finance-a-token')
          .expect(200)
        expect(pageTwo.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          total: 2,
          totalDueCents: 148500,
          page: 2,
          limit: 1,
          totalPages: 2,
        })
        expect(pageTwo.body.rows).toHaveLength(1)
        expect(pageTwo.body.rows[0]).toMatchObject({
          id: fixtureA.invoiceIds[0],
          invoiceNumber: expect.stringContaining('OVERDUE'),
          currentOpenCents: 99000,
          retentionOpenCents: 10000,
        })

        const dateFiltered = await request(app.getHttpServer())
          .get(`${route}?dueFrom=2026-08-01&dueTo=2026-12-31`)
          .set('Authorization', 'Bearer receivables-finance-a-token')
          .expect(200)
        expect(dateFiltered.body).toMatchObject({
          total: 1,
          totalDueCents: 49500,
          totalRetentionCents: 5000,
          overdueTotalCents: 0,
          overdueCount: 0,
        })
        expect(dateFiltered.body.rows[0].id).toBe(fixtureA.invoiceIds[1])

        const accountFiltered = await request(app.getHttpServer())
          .get(`${route}?accountId=${fixtureA.accountId}&projectId=${fixtureA.projectId}`)
          .set('Authorization', 'Bearer receivables-finance-a-token')
          .expect(200)
        expect(accountFiltered.body.total).toBe(2)

        const foreignFiltered = await request(app.getHttpServer())
          .get(`${route}?accountId=${fixtureB.accountId}`)
          .set('Authorization', 'Bearer receivables-finance-a-token')
          .expect(200)
        expect(foreignFiltered.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          total: 0,
          rows: [],
          totalDueCents: 0,
          totalRetentionCents: 0,
          overdueTotalCents: 0,
          overdueCount: 0,
          totalPages: 1,
        })

        const disabledConfig = new ConfigService({
          ERP_FINANCE_RECEIVABLES_READS_ENABLED: false,
          ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS: [fixtureA.tenantId],
        })
        const disabledModule = await Test.createTestingModule({
          controllers: [FinanceReceivablesController],
          providers: [
            FinanceReceivablesService,
            { provide: ConfigService, useValue: disabledConfig },
            {
              provide: DatabaseService,
              useValue: transactionBoundDatabase(transaction),
            },
            { provide: SupabaseIdentityService, useValue: identity },
            { provide: APP_GUARD, useClass: SupabaseJwtGuard },
            { provide: APP_GUARD, useClass: CapabilityGuard },
          ],
        }).compile()
        const disabledApp = disabledModule.createNestApplication()
        disabledApp.useGlobalPipes(
          new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        )
        await disabledApp.init()
        try {
          await request(disabledApp.getHttpServer())
            .get(route)
            .set('Authorization', 'Bearer receivables-finance-a-token')
            .expect(503)
        } finally {
          await disabledApp.close()
        }
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
  }, 60_000)
})
