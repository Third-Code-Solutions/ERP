import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  db,
  fiscalPeriods,
  journalEntries,
  journalLines,
  ledgerAccounts,
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
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { FinanceLedgerController } from '../src/finance/finance-ledger.controller'
import { FinanceLedgerService } from '../src/finance/finance-ledger.service'

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

async function seedLedger(transaction: DatabaseTransaction, label: string) {
  const suffix = randomUUID().slice(0, 12)
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const periodId = randomUUID()
  const debitAccountId = randomUUID()
  const creditAccountId = randomUUID()
  const journalEntryId = randomUUID()

  await transaction.insert(tenants).values({
    id: tenantId,
    name: `Finance ledger HTTP tenant ${label}`,
    slug: `finance-ledger-http-${label}-${suffix}`,
  })
  await transaction.insert(users).values([
    {
      id: financeId,
      tenant_id: tenantId,
      email: `finance-ledger-${label}-${suffix}@integration.test`,
      full_name: `Finance ledger ${label}`,
      role: 'finance',
    },
    {
      id: viewerId,
      tenant_id: tenantId,
      email: `viewer-ledger-${label}-${suffix}@integration.test`,
      full_name: `Viewer ledger ${label}`,
      role: 'viewer',
    },
  ])
  await transaction.insert(fiscalPeriods).values({
    id: periodId,
    tenant_id: tenantId,
    name: `FY 2026 ledger ${label} ${suffix}`,
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    status: 'open',
    created_by: financeId,
  })
  await transaction.insert(ledgerAccounts).values([
    {
      id: debitAccountId,
      tenant_id: tenantId,
      code: `1100-${label}-${suffix}`,
      name: `Ledger debit ${label}`,
      account_type: 'asset',
      normal_balance: 'debit',
      created_by: financeId,
    },
    {
      id: creditAccountId,
      tenant_id: tenantId,
      code: `4000-${label}-${suffix}`,
      name: `Ledger credit ${label}`,
      account_type: 'income',
      normal_balance: 'credit',
      created_by: financeId,
    },
  ])
  await transaction.insert(journalEntries).values({
    id: journalEntryId,
    tenant_id: tenantId,
    status: 'draft',
    source_type: 'manual',
    posting_date: '2026-08-01',
    description: `Ledger HTTP entry ${label}`,
    currency: 'PHP',
    created_by: financeId,
  })
  await transaction.insert(journalLines).values([
    {
      tenant_id: tenantId,
      journal_entry_id: journalEntryId,
      ledger_account_id: debitAccountId,
      line_number: 1,
      description: `Debit line ${label}`,
      debit_cents: 10_000,
      credit_cents: 0,
    },
    {
      tenant_id: tenantId,
      journal_entry_id: journalEntryId,
      ledger_account_id: creditAccountId,
      line_number: 2,
      description: `Credit line ${label}`,
      debit_cents: 0,
      credit_cents: 10_000,
    },
  ])
  await transaction.execute(sql`
    select * from public.post_journal_entry(
      ${journalEntryId}::uuid,
      ${financeId}::uuid
    )
  `)

  return {
    tenantId,
    financeId,
    viewerId,
    journalEntryId,
    debitAccountId,
  }
}

suite('Finance ledger protected HTTP canary', () => {
  it('proves authorization, tenant isolation, filters, totals, pagination, and rollback', async () => {
    let observedTenantId = ''
    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedLedger(transaction, 'a')
      const fixtureB = await seedLedger(transaction, 'b')
      observedTenantId = fixtureA.tenantId
      const identities = new Map([
        ['ledger-finance-a-token', fixtureA.financeId],
        ['ledger-viewer-a-token', fixtureA.viewerId],
        ['ledger-finance-b-token', fixtureB.financeId],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const config = new ConfigService({
        ERP_FINANCE_LEDGER_READS_ENABLED: true,
        ERP_FINANCE_LEDGER_READS_TENANT_IDS: [fixtureA.tenantId],
      })

      const moduleRef = await Test.createTestingModule({
        controllers: [FinanceLedgerController],
        providers: [
          FinanceLedgerService,
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
        const route = '/v1/finance/ledger'

        await request(app.getHttpServer()).get(route).expect(401)
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer unknown-token')
          .expect(401)
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer ledger-viewer-a-token')
          .expect(403)

        const first = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer ledger-finance-a-token')
          .expect(200)
        expect(first.body).toMatchObject({
          total: 2,
          totalDebitCents: 10_000,
          totalCreditCents: 10_000,
          page: 1,
          limit: 1,
          totalPages: 2,
        })
        expect(first.body.rows).toHaveLength(1)
        expect(first.body.rows[0]).toMatchObject({
          entryId: fixtureA.journalEntryId,
          postingDate: '2026-08-01',
        })
        expect(first.body.rows[0].entryId).not.toBe(fixtureB.journalEntryId)

        const pageTwo = await request(app.getHttpServer())
          .get(`${route}?page=2&limit=1`)
          .set('Authorization', 'Bearer ledger-finance-a-token')
          .expect(200)
        expect(pageTwo.body).toMatchObject({
          total: 2,
          totalDebitCents: 10_000,
          totalCreditCents: 10_000,
          page: 2,
          limit: 1,
          totalPages: 2,
        })
        expect(pageTwo.body.rows).toHaveLength(1)
        expect(pageTwo.body.rows[0].id).not.toBe(first.body.rows[0].id)

        const second = await request(app.getHttpServer())
          .get(`${route}?limit=1&accountId=${fixtureA.debitAccountId}`)
          .set('Authorization', 'Bearer ledger-finance-a-token')
          .expect(200)
        expect(second.body).toMatchObject({
          total: 1,
          totalDebitCents: 10_000,
          totalCreditCents: 0,
          page: 1,
          limit: 1,
          totalPages: 1,
        })
        expect(second.body.rows).toHaveLength(1)
        expect(second.body.rows[0]).toMatchObject({
          entryId: fixtureA.journalEntryId,
          debitCents: 10_000,
          creditCents: 0,
        })

        await request(app.getHttpServer())
          .get(`${route}?accountId=${fixtureB.debitAccountId}`)
          .set('Authorization', 'Bearer ledger-finance-a-token')
          .expect(200)
          .expect(({ body }) => {
            expect(body.total).toBe(0)
            expect(body.rows).toEqual([])
          })

        const disabledConfig = new ConfigService({
          ERP_FINANCE_LEDGER_READS_ENABLED: false,
          ERP_FINANCE_LEDGER_READS_TENANT_IDS: [fixtureA.tenantId],
        })
        const disabledModule = await Test.createTestingModule({
          controllers: [FinanceLedgerController],
          providers: [
            FinanceLedgerService,
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
            .set('Authorization', 'Bearer ledger-finance-a-token')
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
