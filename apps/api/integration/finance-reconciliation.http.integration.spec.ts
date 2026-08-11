import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  bankStatementLines,
  bankStatements,
  cashAccounts,
  db,
  tenants,
  type Database,
} from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityGuard } from '../src/auth/capability.guard'
import { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { FinanceReconciliationController } from '../src/finance/finance-reconciliation.controller'
import { FinanceReconciliationService } from '../src/finance/finance-reconciliation.service'

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

type ReconciliationFixture = {
  tenantId: string
  financeId: string
  viewerId: string
  cashAccountId: string
  statementIds: string[]
}

async function seedReconciliationFixture(
  transaction: DatabaseTransaction,
  label: string,
  suffix: string,
  statementCount = 1
): Promise<ReconciliationFixture> {
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const ledgerId = randomUUID()
  const cashAccountId = randomUUID()
  const statementIds = Array.from({ length: statementCount }, () => randomUUID())

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (
      ${tenantId}::uuid,
      ${`Reconciliation HTTP ${label}`},
      ${`reconciliation-http-${label}-${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (
        ${financeId}::uuid,
        ${tenantId}::uuid,
        ${`reconciliation-http-finance-${label}-${suffix}@integration.test`},
        'Reconciliation HTTP Finance',
        'finance'
      ),
      (
        ${viewerId}::uuid,
        ${tenantId}::uuid,
        ${`reconciliation-http-viewer-${label}-${suffix}@integration.test`},
        'Reconciliation HTTP Viewer',
        'viewer'
      )
  `)
  await transaction.execute(sql`
    insert into public.ledger_accounts (
      id, tenant_id, code, name, account_type, normal_balance, created_by
    )
    values (
      ${ledgerId}::uuid,
      ${tenantId}::uuid,
      ${`1000-RECON-${label}-${suffix}`},
      ${`Operating bank ledger ${label}`},
      'asset',
      'debit',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.cash_accounts (
      id, tenant_id, ledger_account_id, name, account_kind, currency,
      is_active, created_by
    )
    values (
      ${cashAccountId}::uuid,
      ${tenantId}::uuid,
      ${ledgerId}::uuid,
      ${`Operating bank ${label}`},
      'bank',
      'PHP',
      true,
      ${financeId}::uuid
    )
  `)

  for (const [index, statementId] of statementIds.entries()) {
    const endDate = index === 0 ? '2026-08-31' : '2026-07-31'
    const lineCount = index === 0 ? 2 : 1
    const firstAmount = index === 0 ? 100 : 75
    const secondAmount = index === 0 ? 50 : 0
    const statementReference = `ST-${label}-${suffix}-${index + 1}`
    const sourceFileName = `statement-${label}-${suffix}-${index + 1}.csv`
    const opening = 100_000 + index * 10_000
    const closing = opening + firstAmount + secondAmount

    await transaction.execute(sql`
      insert into public.bank_statements (
        id, tenant_id, cash_account_id, reference_number, source_file_name,
        source_sha256, status, statement_start, statement_end, currency,
        opening_balance_cents, closing_balance_cents, created_by
      )
      values (
        ${statementId}::uuid,
        ${tenantId}::uuid,
        ${cashAccountId}::uuid,
        ${statementReference},
        ${sourceFileName},
        repeat('a', 64),
        'draft',
        ${index === 0 ? '2026-08-01' : '2026-07-01'}::date,
        ${endDate}::date,
        'PHP',
        ${opening},
        ${closing},
        ${financeId}::uuid
      )
    `)
    await transaction.execute(sql`
      insert into public.bank_statement_lines (
        id, tenant_id, bank_statement_id, line_number, transaction_date,
        reference_number, description, amount_cents
      )
      values (
        ${randomUUID()}::uuid,
        ${tenantId}::uuid,
        ${statementId}::uuid,
        1,
        ${index === 0 ? '2026-08-10' : '2026-07-10'}::date,
        ${`DEP-${label}-${suffix}-${index + 1}-1`},
        'Customer deposit',
        ${firstAmount}
      )
    `)
    if (secondAmount !== 0) {
      await transaction.execute(sql`
        insert into public.bank_statement_lines (
          id, tenant_id, bank_statement_id, line_number, transaction_date,
          reference_number, description, amount_cents
        )
        values (
          ${randomUUID()}::uuid,
          ${tenantId}::uuid,
          ${statementId}::uuid,
          2,
          '2026-08-20'::date,
          ${`DEP-${label}-${suffix}-${index + 1}-2`},
          'Second customer deposit',
          ${secondAmount}
        )
      `)
    }
  }

  return { tenantId, financeId, viewerId, cashAccountId, statementIds }
}

suite('Bank reconciliation protected HTTP canary', () => {
  it('proves auth, tenant scope, selector gating, bounded results, and rollback', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedReconciliationFixture(
        transaction,
        'a',
        suffix,
        2
      )
      const fixtureB = await seedReconciliationFixture(
        transaction,
        'b',
        suffix,
        1
      )
      observedTenantId = fixtureA.tenantId

      const identities = new Map([
        ['reconciliation-http-finance-a-token', fixtureA.financeId],
        ['reconciliation-http-viewer-a-token', fixtureA.viewerId],
        ['reconciliation-http-finance-b-token', fixtureB.financeId],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const featureState = {
        enabled: true,
        tenantIds: [fixtureA.tenantId],
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_FINANCE_RECONCILIATION_READS_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_RECONCILIATION_READS_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService
      const moduleRef = await Test.createTestingModule({
        controllers: [FinanceReconciliationController],
        providers: [
          FinanceReconciliationService,
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
        const route = '/v1/finance/reconciliation'

        await request(app.getHttpServer()).get(route).expect(401)
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer unknown-token')
          .expect(401)
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer reconciliation-http-viewer-a-token')
          .expect(403)
        await request(app.getHttpServer())
          .get(`${route}?unexpected=true`)
          .set('Authorization', 'Bearer reconciliation-http-finance-a-token')
          .expect(400)

        featureState.enabled = false
        await request(app.getHttpServer())
          .get(route)
          .set('Authorization', 'Bearer reconciliation-http-finance-a-token')
          .expect(503)
        featureState.enabled = true

        const bounded = await request(app.getHttpServer())
          .get(`${route}?limit=1`)
          .set('Authorization', 'Bearer reconciliation-http-finance-a-token')
          .expect(200)
        expect(bounded.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          total: 2,
          truncated: true,
          draftCount: 1,
          reconciledCount: 0,
          openExceptions: 2,
          channels: 1,
        })
        expect(bounded.body.rows).toHaveLength(1)
        expect(bounded.body.rows[0]).toMatchObject({
          id: fixtureA.statementIds[0],
          referenceNumber: `ST-a-${suffix}-1`,
          statementEnd: '2026-08-31',
          lineCount: 2,
          matchedCount: 0,
          cashAccountId: fixtureA.cashAccountId,
        })

        const full = await request(app.getHttpServer())
          .get(`${route}?limit=500`)
          .set('Authorization', 'Bearer reconciliation-http-finance-a-token')
          .expect(200)
        expect(full.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          total: 2,
          truncated: false,
          draftCount: 2,
          reconciledCount: 0,
          openExceptions: 3,
          channels: 1,
        })
        expect(full.body.rows).toHaveLength(2)
        expect(
          full.body.rows.every(
            (row: { id: string }) =>
              row.id === fixtureA.statementIds[0] ||
              row.id === fixtureA.statementIds[1]
          )
        ).toBe(true)
        expect(
          full.body.rows.some(
            (row: { id: string }) => row.id === fixtureB.statementIds[0]
          )
        ).toBe(false)

        const [statementCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(bankStatements)
          .where(sql`${bankStatements.tenant_id} = ${fixtureA.tenantId}`)
        const [lineCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(bankStatementLines)
          .where(sql`${bankStatementLines.tenant_id} = ${fixtureA.tenantId}`)
        expect(statementCount?.count).toBe(2)
        expect(lineCount?.count).toBe(3)

        const [account] = await transaction
          .select({ tenantId: cashAccounts.tenant_id })
          .from(cashAccounts)
          .where(sql`${cashAccounts.id} = ${fixtureA.cashAccountId}`)
          .limit(1)
        expect(account?.tenantId).toBe(fixtureA.tenantId)
      } finally {
        await app.close()
      }
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(sql`${tenants.id} = ${observedTenantId}`)
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 90_000)
})
