import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  cashTransactions,
  db,
  tenants,
  type Database,
} from '@third-code-erp/database'
import { eq, sql } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { FinanceCashController } from '../src/finance/finance-cash.controller'
import { FinanceCashService } from '../src/finance/finance-cash.service'

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

type CashSpec = {
  key: string
  direction: 'receipt' | 'disbursement'
  status: 'draft' | 'posted' | 'reversed'
  transactionDate: string
  amountCents: number
  referenceNumber: string
  internalNumber: string | null
  postingJournalId: string | null
  reversalJournalId?: string | null
}

async function seedCash(
  transaction: DatabaseTransaction,
  label: string,
  specs: CashSpec[]
) {
  const suffix = randomUUID().slice(0, 12)
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const cashLedgerId = randomUUID()
  const payableLedgerId = randomUUID()
  const cashAccountId = randomUUID()
  const businessAccountId = randomUUID()
  const vendorId = randomUUID()
  const periodId = randomUUID()

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (
      ${tenantId}::uuid,
      ${`Finance cash HTTP tenant ${label}`},
      ${`finance-cash-http-${label}-${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (
        ${financeId}::uuid,
        ${tenantId}::uuid,
        ${`finance-cash-${label}-${suffix}@integration.test`},
        ${`Finance cash ${label}`},
        'finance'
      ),
      (
        ${viewerId}::uuid,
        ${tenantId}::uuid,
        ${`viewer-cash-${label}-${suffix}@integration.test`},
        ${`Viewer cash ${label}`},
        'viewer'
      )
  `)
  await transaction.execute(sql`
    insert into public.ledger_accounts (
      id, tenant_id, code, name, account_type, normal_balance, system_key,
      created_by
    )
    values
      (
        ${cashLedgerId}::uuid, ${tenantId}::uuid,
        ${`1000-${label}-${suffix}`}, 'Cash on hand', 'asset', 'debit',
        'cash', ${financeId}::uuid
      ),
      (
        ${payableLedgerId}::uuid, ${tenantId}::uuid,
        ${`2000-${label}-${suffix}`}, 'Accounts payable', 'liability',
        'credit', 'accounts_payable', ${financeId}::uuid
      )
  `)
  await transaction.execute(sql`
    insert into public.cash_accounts (
      id, tenant_id, ledger_account_id, name, account_kind, currency, created_by
    )
    values (
      ${cashAccountId}::uuid,
      ${tenantId}::uuid,
      ${cashLedgerId}::uuid,
      ${`Operating cash ${label}`},
      'bank',
      'PHP',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.accounts (id, tenant_id, name, created_by)
    values (
      ${businessAccountId}::uuid,
      ${tenantId}::uuid,
      ${`Cash business account ${label}`},
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.vendors (id, tenant_id, name)
    values (
      ${vendorId}::uuid,
      ${tenantId}::uuid,
      ${`Cash vendor ${label} ${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.fiscal_periods (
      id, tenant_id, name, starts_on, ends_on, status, created_by
    )
    values (
      ${periodId}::uuid,
      ${tenantId}::uuid,
      ${`FY 2026 cash ${label} ${suffix}`},
      '2026-01-01',
      '2026-12-31',
      'open',
      ${financeId}::uuid
    )
  `)

  for (const spec of specs) {
    if (spec.postingJournalId) {
      await transaction.execute(sql`
        insert into public.journal_entries (
          id, tenant_id, fiscal_period_id, entry_number, status, source_type,
          posting_date, description, currency, reverses_entry_id, created_by,
          posted_by, posted_at
        )
        values (
          ${spec.postingJournalId}::uuid,
          ${tenantId}::uuid,
          ${periodId}::uuid,
          ${`JE-CASH-${label}-${spec.key}-${suffix}`},
          'posted',
          'system',
          ${spec.transactionDate}::date,
          ${`Cash ${spec.key} journal`},
          'PHP',
          null,
          ${financeId}::uuid,
          ${financeId}::uuid,
          ${`${spec.transactionDate}T03:00:00Z`}::timestamptz
        )
      `)
    }
    if (spec.reversalJournalId) {
      await transaction.execute(sql`
        insert into public.journal_entries (
          id, tenant_id, fiscal_period_id, entry_number, status, source_type,
          posting_date, description, currency, reverses_entry_id, created_by,
          posted_by, posted_at
        )
        values (
          ${spec.reversalJournalId}::uuid,
          ${tenantId}::uuid,
          ${periodId}::uuid,
          ${`JE-CASH-${label}-${spec.key}-reversal-${suffix}`},
          'posted',
          'reversal',
          ${spec.transactionDate}::date,
          ${`Cash ${spec.key} reversal journal`},
          'PHP',
          ${spec.postingJournalId}::uuid,
          ${financeId}::uuid,
          ${financeId}::uuid,
          ${`${spec.transactionDate}T04:00:00Z`}::timestamptz
        )
      `)
    }
    await transaction.execute(sql`
      insert into public.cash_transactions (
        id, tenant_id, cash_account_id, direction, business_account_id,
        vendor_id, reference_number, internal_number, status, transaction_date,
        currency, amount_cents, posting_journal_entry_id, posted_by, posted_at,
        reversal_journal_entry_id, reversed_by, reversed_at, reversal_reason,
        created_by
      )
      values (
        ${randomUUID()}::uuid,
        ${tenantId}::uuid,
        ${cashAccountId}::uuid,
        ${spec.direction},
        ${spec.direction === 'receipt' ? businessAccountId : null}::uuid,
        ${spec.direction === 'disbursement' ? vendorId : null}::uuid,
        ${spec.referenceNumber},
        ${spec.internalNumber},
        ${spec.status},
        ${spec.transactionDate}::date,
        'PHP',
        ${spec.amountCents},
        ${spec.postingJournalId}::uuid,
        ${spec.status === 'posted' || spec.status === 'reversed' ? financeId : null}::uuid,
        ${spec.status === 'posted' || spec.status === 'reversed' ? `${spec.transactionDate}T03:00:00Z` : null}::timestamptz,
        ${spec.reversalJournalId ?? null}::uuid,
        ${spec.status === 'reversed' ? financeId : null}::uuid,
        ${spec.status === 'reversed' ? `${spec.transactionDate}T04:00:00Z` : null}::timestamptz,
        ${spec.status === 'reversed' ? 'Duplicate cash evidence' : null},
        ${financeId}::uuid
      )
    `)
  }

  return {
    tenantId,
    financeId,
    viewerId,
    cashAccountId,
    businessAccountId,
    vendorId,
  }
}

suite('Finance cash protected HTTP canary', () => {
  it('proves authorization, tenant isolation, exact aggregates, filters, pagination, and rollback', async () => {
    let observedTenantId = ''
    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedCash(transaction, 'a', [
        {
          key: 'receipt',
          direction: 'receipt',
          status: 'posted',
          transactionDate: '2026-08-01',
          amountCents: 12500,
          referenceNumber: 'RCT-CASH-A-001',
          internalNumber: 'CT-CASH-A-001',
          postingJournalId: randomUUID(),
        },
        {
          key: 'disbursement',
          direction: 'disbursement',
          status: 'posted',
          transactionDate: '2026-08-02',
          amountCents: 85000,
          referenceNumber: 'DSP-CASH-A-001',
          internalNumber: 'CT-CASH-A-002',
          postingJournalId: randomUUID(),
        },
        {
          key: 'draft',
          direction: 'receipt',
          status: 'draft',
          transactionDate: '2026-08-03',
          amountCents: 3000,
          referenceNumber: 'RCT-CASH-A-002',
          internalNumber: null,
          postingJournalId: null,
        },
        {
          key: 'reversed',
          direction: 'disbursement',
          status: 'reversed',
          transactionDate: '2026-08-04',
          amountCents: 4200,
          referenceNumber: 'DSP-CASH-A-002',
          internalNumber: 'CT-CASH-A-003',
          postingJournalId: randomUUID(),
          reversalJournalId: randomUUID(),
        },
      ])
      const fixtureB = await seedCash(transaction, 'b', [
        {
          key: 'foreign',
          direction: 'receipt',
          status: 'draft',
          transactionDate: '2026-08-05',
          amountCents: 999999,
          referenceNumber: 'RCT-CASH-B-001',
          internalNumber: null,
          postingJournalId: null,
        },
      ])
      observedTenantId = fixtureA.tenantId

      const identities = new Map([
        ['cash-read-finance-a-token', fixtureA.financeId],
        ['cash-read-viewer-a-token', fixtureA.viewerId],
        ['cash-read-finance-b-token', fixtureB.financeId],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const config = new ConfigService({
        ERP_FINANCE_CASH_READS_ENABLED: true,
        ERP_FINANCE_CASH_READS_TENANT_IDS: [
          fixtureA.tenantId,
          fixtureB.tenantId,
        ],
      })

      const moduleRef = await Test.createTestingModule({
        controllers: [FinanceCashController],
        providers: [
          FinanceCashService,
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
        const route = '/v1/finance/cash-transactions'

        await request(app.getHttpServer()).get(route).expect(401)
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer unknown-token')
          .expect(401)
        const viewerRead = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer cash-read-viewer-a-token')
          .expect(200)
        await request(app.getHttpServer())
          .get(`${route}?fromDate=2026-09-01&toDate=2026-08-01`)
          .set('Authorization', 'Bearer cash-read-finance-a-token')
          .expect(400)

        const first = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer cash-read-finance-a-token')
          .expect(200)
        expect(viewerRead.body).toEqual(first.body)
        expect(first.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          total: 4,
          postedReceiptCents: 12500,
          postedDisbursementCents: 85000,
          draftCount: 1,
          postedCount: 2,
          reversedCount: 1,
          page: 1,
          limit: 1,
          totalPages: 4,
        })
        expect(first.body.rows).toHaveLength(1)
        expect(first.body.rows[0]).toMatchObject({
          referenceNumber: 'DSP-CASH-A-002',
          internalNumber: 'CT-CASH-A-003',
          direction: 'disbursement',
          status: 'reversed',
          amountCents: 4200,
          cashAccountId: fixtureA.cashAccountId,
          vendorId: fixtureA.vendorId,
        })

        const pageTwo = await request(app.getHttpServer())
          .get(`${route}?page=2&limit=1`)
          .set('Authorization', 'Bearer cash-read-finance-a-token')
          .expect(200)
        expect(pageTwo.body.rows).toHaveLength(1)
        expect(pageTwo.body.rows[0]).toMatchObject({
          referenceNumber: 'RCT-CASH-A-002',
          direction: 'receipt',
          status: 'draft',
          amountCents: 3000,
          internalNumber: null,
        })

        const posted = await request(app.getHttpServer())
          .get(`${route}?status=posted`)
          .set('Authorization', 'Bearer cash-read-finance-a-token')
          .expect(200)
        expect(posted.body).toMatchObject({
          total: 2,
          postedReceiptCents: 12500,
          postedDisbursementCents: 85000,
          draftCount: 0,
          postedCount: 2,
          reversedCount: 0,
        })

        const receiptWindow = await request(app.getHttpServer())
          .get(`${route}?direction=receipt&fromDate=2026-08-01&toDate=2026-08-03`)
          .set('Authorization', 'Bearer cash-read-finance-a-token')
          .expect(200)
        expect(receiptWindow.body).toMatchObject({
          total: 2,
          postedReceiptCents: 12500,
          postedDisbursementCents: 0,
          draftCount: 1,
          postedCount: 1,
          reversedCount: 0,
        })

        const cashAccount = await request(app.getHttpServer())
          .get(`${route}?cashAccountId=${fixtureA.cashAccountId}`)
          .set('Authorization', 'Bearer cash-read-finance-a-token')
          .expect(200)
        expect(cashAccount.body.total).toBe(4)

        const foreign = await request(app.getHttpServer())
          .get(`${route}?cashAccountId=${fixtureB.cashAccountId}`)
          .set('Authorization', 'Bearer cash-read-finance-a-token')
          .expect(200)
        expect(foreign.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          total: 0,
          rows: [],
          postedReceiptCents: 0,
          postedDisbursementCents: 0,
          draftCount: 0,
          postedCount: 0,
          reversedCount: 0,
          totalPages: 1,
        })

        const tenantB = await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer cash-read-finance-b-token')
          .expect(200)
        expect(tenantB.body).toMatchObject({
          tenantId: fixtureB.tenantId,
          total: 1,
          postedReceiptCents: 0,
          postedDisbursementCents: 0,
          draftCount: 1,
          postedCount: 0,
          reversedCount: 0,
        })

        const disabledConfig = new ConfigService({
          ERP_FINANCE_CASH_READS_ENABLED: false,
          ERP_FINANCE_CASH_READS_TENANT_IDS: [fixtureA.tenantId],
        })
        const disabledModule = await Test.createTestingModule({
          controllers: [FinanceCashController],
          providers: [
            FinanceCashService,
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
            .set('Authorization', 'Bearer cash-read-finance-a-token')
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
