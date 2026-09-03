import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  db,
  tenants,
  type Database,
} from '@third-code-erp/database'
import { eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { FinancePayablesController } from '../src/finance/finance-payables.controller'
import { FinancePayablesService } from '../src/finance/finance-payables.service'

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

type BillSpec = {
  key: string
  status: 'draft' | 'posted'
  billDate: string
  dueDate: string
  subtotalCents: number
  vatCents: number
  withholdingCents: number
}

async function seedPayables(
  transaction: DatabaseTransaction,
  label: string,
  billSpecs: BillSpec[]
) {
  const suffix = randomUUID().slice(0, 12)
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const projectId = randomUUID()
  const vendorId = randomUUID()
  const costCodeId = randomUUID()
  const periodId = randomUUID()
  const payableAccountId = randomUUID()
  const vatAccountId = randomUUID()
  const withholdingAccountId = randomUUID()
  const expenseAccountId = randomUUID()

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (
      ${tenantId}::uuid,
      ${`Finance payables HTTP tenant ${label}`},
      ${`finance-payables-http-${label}-${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (
        ${financeId}::uuid,
        ${tenantId}::uuid,
        ${`finance-payables-${label}-${suffix}@integration.test`},
        ${`Finance payables ${label}`},
        'finance'
      ),
      (
        ${viewerId}::uuid,
        ${tenantId}::uuid,
        ${`viewer-payables-${label}-${suffix}@integration.test`},
        ${`Viewer payables ${label}`},
        'viewer'
      )
  `)
  await transaction.execute(sql`
    insert into public.projects (id, tenant_id, name, client, created_by)
    values (
      ${projectId}::uuid,
      ${tenantId}::uuid,
      ${`Finance payables project ${label}`},
      ${`Finance payables client ${label}`},
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.vendors (id, tenant_id, name)
    values (
      ${vendorId}::uuid,
      ${tenantId}::uuid,
      ${`Finance payables vendor ${label} ${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.cost_codes(
      id, tenant_id, code, name, category, created_by
    )
    values (
      ${costCodeId}::uuid,
      ${tenantId}::uuid,
      ${`MAT-${label}-${suffix}`},
      ${`Finance payables materials ${label}`},
      'material',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.fiscal_periods (
      id, tenant_id, name, starts_on, ends_on, status, created_by
    )
    values (
      ${periodId}::uuid,
      ${tenantId}::uuid,
      ${`FY 2026 payables ${label} ${suffix}`},
      '2026-01-01',
      '2026-12-31',
      'open',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.ledger_accounts (
      id, tenant_id, code, name, account_type, normal_balance, system_key,
      created_by
    )
    values
      (
        ${payableAccountId}::uuid, ${tenantId}::uuid, ${`2000-${label}-${suffix}`},
        'Accounts payable', 'liability', 'credit', 'accounts_payable',
        ${financeId}::uuid
      ),
      (
        ${vatAccountId}::uuid, ${tenantId}::uuid, ${`1130-${label}-${suffix}`},
        'Input VAT receivable', 'asset', 'debit', 'input_vat_receivable',
        ${financeId}::uuid
      ),
      (
        ${withholdingAccountId}::uuid,
        ${tenantId}::uuid,
        ${`2110-${label}-${suffix}`},
        'Withholding tax payable',
        'liability',
        'credit',
        'withholding_tax_payable',
        ${financeId}::uuid
      ),
      (
        ${expenseAccountId}::uuid, ${tenantId}::uuid, ${`6100-${label}-${suffix}`},
        'Project materials', 'expense', 'debit', null,
        ${financeId}::uuid
      )
  `)

  const bills: Record<string, {
    billId: string
    purchaseOrderId: string
    vendorId: string
    projectId: string
  }> = {}

  for (const bill of billSpecs) {
    const billId = randomUUID()
    const purchaseOrderId = randomUUID()
    const purchaseOrderLineId = randomUUID()
    const totalCents =
      bill.subtotalCents + bill.vatCents - bill.withholdingCents

    await transaction.execute(sql`
      insert into public.purchase_orders (
        id, tenant_id, project_id, vendor_id, created_by, po_number, status,
        subtotal_cents, vat_cents, withholding_tax_cents, total_cents
      )
      values (
        ${purchaseOrderId}::uuid,
        ${tenantId}::uuid,
        ${projectId}::uuid,
        ${vendorId}::uuid,
        ${financeId}::uuid,
        ${`PO-${label}-${bill.key}-${suffix}`},
        'issued',
        ${bill.subtotalCents},
        ${bill.vatCents},
        ${bill.withholdingCents},
        ${totalCents}
      )
    `)
    await transaction.execute(sql`
      insert into public.po_line_items (
        id, tenant_id, po_id, sort_order, description, cost_code_id,
        quantity, quantity_micros, unit_cost_cents, line_total_cents
      )
      values (
        ${purchaseOrderLineId}::uuid,
        ${tenantId}::uuid,
        ${purchaseOrderId}::uuid,
        1,
        ${`Finance payables materials ${bill.key}`},
        ${costCodeId}::uuid,
        1,
        1000000,
        ${bill.subtotalCents},
        ${bill.subtotalCents}
      )
    `)
    await transaction.execute(sql`
      insert into public.supplier_bills (
        id, tenant_id, purchase_order_id, project_id, vendor_id,
        vendor_bill_number, bill_date, due_date, subtotal_cents,
        input_vat_cents, withholding_tax_cents, total_payable_cents, created_by
      )
      values (
        ${billId}::uuid,
        ${tenantId}::uuid,
        ${purchaseOrderId}::uuid,
        ${projectId}::uuid,
        ${vendorId}::uuid,
        ${`SI-${label}-${bill.key}-${suffix}`},
        ${bill.billDate}::date,
        ${bill.dueDate}::date,
        ${bill.subtotalCents},
        ${bill.vatCents},
        ${bill.withholdingCents},
        ${totalCents},
        ${financeId}::uuid
      )
    `)
    await transaction.execute(sql`
      insert into public.supplier_bill_lines (
        tenant_id, supplier_bill_id, ledger_account_id, project_id,
        po_line_item_id, cost_code_id, line_number, description, amount_cents
      )
      values (
        ${tenantId}::uuid,
        ${billId}::uuid,
        ${expenseAccountId}::uuid,
        ${projectId}::uuid,
        ${purchaseOrderLineId}::uuid,
        ${costCodeId}::uuid,
        1,
        ${`Finance payables materials ${bill.key}`},
        ${bill.subtotalCents}
      )
    `)
    if (bill.status === 'posted') {
      await transaction.execute(sql`
        select * from public.post_supplier_bill(
          ${billId}::uuid,
          ${financeId}::uuid,
          ${bill.billDate}::date
        )
      `)
    }
    bills[bill.key] = {
      billId,
      purchaseOrderId,
      vendorId,
      projectId,
    }
  }

  return {
    tenantId,
    financeId,
    viewerId,
    vendorId,
    projectId,
    bills,
  }
}

suite('Finance payables protected HTTP canary', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FIXTURE_AS_OF)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('proves authorization, tenant isolation, exact aging, filters, pagination, and rollback', async () => {
    let observedTenantId = ''
    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedPayables(transaction, 'a', [
        {
          key: 'overdue',
          status: 'posted',
          billDate: '2026-07-01',
          dueDate: '2026-07-01',
          subtotalCents: 100000,
          vatCents: 12000,
          withholdingCents: 2000,
        },
        {
          key: 'current',
          status: 'posted',
          billDate: '2026-08-01',
          dueDate: '2026-09-01',
          subtotalCents: 50000,
          vatCents: 6000,
          withholdingCents: 1000,
        },
        {
          key: 'draft',
          status: 'draft',
          billDate: '2026-08-05',
          dueDate: '2026-08-15',
          subtotalCents: 30000,
          vatCents: 3600,
          withholdingCents: 600,
        },
      ])
      const fixtureB = await seedPayables(transaction, 'b', [
        {
          key: 'foreign',
          status: 'posted',
          billDate: '2026-08-02',
          dueDate: '2026-09-15',
          subtotalCents: 40000,
          vatCents: 4800,
          withholdingCents: 800,
        },
      ])
      observedTenantId = fixtureA.tenantId

      const identities = new Map([
        ['payables-finance-a-token', fixtureA.financeId],
        ['payables-viewer-a-token', fixtureA.viewerId],
        ['payables-finance-b-token', fixtureB.financeId],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const config = new ConfigService({
        ERP_FINANCE_PAYABLES_READS_ENABLED: true,
        ERP_FINANCE_PAYABLES_READS_TENANT_IDS: [
          fixtureA.tenantId,
          fixtureB.tenantId,
        ],
      })

      const moduleRef = await Test.createTestingModule({
        controllers: [FinancePayablesController],
        providers: [
          FinancePayablesService,
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
        const route = '/v1/finance/payables'

        await request(app.getHttpServer()).get(route).expect(401)
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer unknown-token')
          .expect(401)
        const viewerRead = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer payables-viewer-a-token')
          .expect(200)
        await request(app.getHttpServer())
          .get(`${route}?dueFrom=2026-09-01&dueTo=2026-08-01`)
          .set('Authorization', 'Bearer payables-finance-a-token')
          .expect(400)

        const first = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer payables-finance-a-token')
          .expect(200)
        expect(viewerRead.body).toEqual(first.body)
        expect(first.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          asOfDate: '2026-08-06',
          total: 3,
          totalPayableCents: 198000,
          totalPaidCents: 0,
          totalOpenCents: 165000,
          overdueOpenCents: 110000,
          overdueCount: 1,
          draftCount: 1,
          postedOpenCount: 2,
          agingCurrentCents: 55000,
          aging1To30Cents: 0,
          aging31To60Cents: 110000,
          aging61To90Cents: 0,
          aging90PlusCents: 0,
          page: 1,
          limit: 1,
          totalPages: 3,
        })
        expect(first.body.rows).toHaveLength(1)
        expect(first.body.rows[0]).toMatchObject({
          status: 'draft',
          vendorBillNumber: expect.stringContaining('draft'),
          totalPayableCents: 33000,
          openCents: 0,
          dueDate: '2026-08-15',
          postedAt: null,
          postingJournalEntryId: null,
          vendorId: fixtureA.vendorId,
          projectId: fixtureA.projectId,
        })

        const pageTwo = await request(app.getHttpServer())
          .get(`${route}?page=2&limit=1`)
          .set('Authorization', 'Bearer payables-finance-a-token')
          .expect(200)
        expect(pageTwo.body.rows).toHaveLength(1)
        expect(pageTwo.body.rows[0]).toMatchObject({
          status: 'posted',
          vendorBillNumber: expect.stringContaining('current'),
          totalPayableCents: 55000,
          openCents: 55000,
          dueDate: '2026-09-01',
          postingJournalEntryId: expect.any(String),
        })

        const posted = await request(app.getHttpServer())
          .get(`${route}?status=posted`)
          .set('Authorization', 'Bearer payables-finance-a-token')
          .expect(200)
        expect(posted.body).toMatchObject({
          total: 2,
          totalPayableCents: 165000,
          totalOpenCents: 165000,
          draftCount: 0,
          postedOpenCount: 2,
        })
        expect(posted.body.rows).toHaveLength(2)

        const dateFiltered = await request(app.getHttpServer())
          .get(`${route}?dueFrom=2026-08-01&dueTo=2026-12-31`)
          .set('Authorization', 'Bearer payables-finance-a-token')
          .expect(200)
        expect(dateFiltered.body).toMatchObject({
          total: 2,
          totalPayableCents: 88000,
          totalOpenCents: 55000,
          overdueOpenCents: 0,
          overdueCount: 0,
          draftCount: 1,
          postedOpenCount: 1,
        })

        const dimensions = await request(app.getHttpServer())
          .get(`${route}?vendorId=${fixtureA.vendorId}&projectId=${fixtureA.projectId}`)
          .set('Authorization', 'Bearer payables-finance-a-token')
          .expect(200)
        expect(dimensions.body.total).toBe(3)

        const foreign = await request(app.getHttpServer())
          .get(`${route}?vendorId=${fixtureB.vendorId}`)
          .set('Authorization', 'Bearer payables-finance-a-token')
          .expect(200)
        expect(foreign.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          total: 0,
          rows: [],
          totalPayableCents: 0,
          totalOpenCents: 0,
          overdueOpenCents: 0,
          overdueCount: 0,
          draftCount: 0,
          postedOpenCount: 0,
          totalPages: 1,
        })

        const tenantB = await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer payables-finance-b-token')
          .expect(200)
        expect(tenantB.body).toMatchObject({
          tenantId: fixtureB.tenantId,
          total: 1,
          totalPayableCents: 44000,
          totalOpenCents: 44000,
          overdueOpenCents: 0,
          postedOpenCount: 1,
        })

        const disabledConfig = new ConfigService({
          ERP_FINANCE_PAYABLES_READS_ENABLED: false,
          ERP_FINANCE_PAYABLES_READS_TENANT_IDS: [fixtureA.tenantId],
        })
        const disabledModule = await Test.createTestingModule({
          controllers: [FinancePayablesController],
          providers: [
            FinancePayablesService,
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
            .set('Authorization', 'Bearer payables-finance-a-token')
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
