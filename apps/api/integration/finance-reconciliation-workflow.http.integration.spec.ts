import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  bankStatementAutoMatchRequests,
  bankStatementLines,
  bankStatements,
  db,
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
import { FinanceReconciliationWorkflowController } from '../src/finance/finance-reconciliation-workflow.controller'
import { FinanceReconciliationWorkflowService } from '../src/finance/finance-reconciliation-workflow.service'

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

async function seedFixture(
  transaction: DatabaseTransaction,
  label: string,
  suffix: string
) {
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const accountId = randomUUID()
  const periodId = randomUUID()
  const ledgerId = randomUUID()
  const cashAccountId = randomUUID()
  const journalId = randomUUID()
  const cashTransactionId = randomUUID()
  const statementId = randomUUID()
  const lineId = randomUUID()
  const secondStatementId = randomUUID()

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (
      ${tenantId}::uuid,
      ${`Auto-match HTTP tenant ${label}`},
      ${`auto-match-http-${label}-${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (
        ${financeId}::uuid,
        ${tenantId}::uuid,
        ${`auto-match-http-finance-${label}-${suffix}@integration.test`},
        'Auto-match HTTP Finance',
        'finance'
      ),
      (
        ${viewerId}::uuid,
        ${tenantId}::uuid,
        ${`auto-match-http-viewer-${label}-${suffix}@integration.test`},
        'Auto-match HTTP Viewer',
        'viewer'
      )
  `)
  await transaction.execute(sql`
    insert into public.accounts (id, tenant_id, name, created_by)
    values (
      ${accountId}::uuid,
      ${tenantId}::uuid,
      ${`Auto-match customer ${label}`},
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
      ${`FY 2026 auto-match ${label} ${suffix}`},
      '2026-01-01',
      '2026-12-31',
      'open',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.ledger_accounts (
      id, tenant_id, code, name, account_type, normal_balance, created_by
    )
    values (
      ${ledgerId}::uuid,
      ${tenantId}::uuid,
      ${`10${label === 'a' ? '1' : '2'}-${suffix}`},
      ${`Auto-match operating bank ${label}`},
      'asset',
      'debit',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.cash_accounts (
      id, tenant_id, ledger_account_id, name, account_kind, currency, created_by
    )
    values (
      ${cashAccountId}::uuid,
      ${tenantId}::uuid,
      ${ledgerId}::uuid,
      ${`Auto-match operating bank ${label}`},
      'bank',
      'PHP',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.journal_entries (
      id, tenant_id, fiscal_period_id, entry_number, status, source_type,
      posting_date, description, currency, created_by, posted_by, posted_at
    )
    values (
      ${journalId}::uuid,
      ${tenantId}::uuid,
      ${periodId}::uuid,
      ${`JE-AUTO-${label}-${suffix}`},
      'posted',
      'system',
      '2026-07-27',
      'Auto-match HTTP fixture',
      'PHP',
      ${financeId}::uuid,
      ${financeId}::uuid,
      now()
    )
  `)
  await transaction.execute(sql`
    insert into public.cash_transactions (
      id, tenant_id, cash_account_id, direction, business_account_id,
      reference_number, internal_number, status, transaction_date, currency,
      amount_cents, posting_journal_entry_id, posted_by, posted_at, created_by
    )
    values (
      ${cashTransactionId}::uuid,
      ${tenantId}::uuid,
      ${cashAccountId}::uuid,
      'receipt',
      ${accountId}::uuid,
      ${`DEP-AUTO-${label}-${suffix}`},
      ${`CT-AUTO-${label}-${suffix}`},
      'posted',
      '2026-07-27',
      'PHP',
      50000,
      ${journalId}::uuid,
      ${financeId}::uuid,
      now(),
      ${financeId}::uuid
    )
  `)

  const statementValues = (id: string, reference: string) => sql`
    insert into public.bank_statements (
      id, tenant_id, cash_account_id, reference_number, source_file_name,
      source_sha256, statement_start, statement_end, currency,
      opening_balance_cents, closing_balance_cents, created_by
    )
    values (
      ${id}::uuid,
      ${tenantId}::uuid,
      ${cashAccountId}::uuid,
      ${reference},
      ${`${reference}.csv`},
      repeat('a', 64),
      '2026-07-01',
      '2026-07-31',
      'PHP',
      100000,
      150000,
      ${financeId}::uuid
    )
  `
  await transaction.execute(
    statementValues(statementId, `ST-AUTO-${label}-${suffix}`)
  )
  await transaction.execute(sql`
    insert into public.bank_statement_lines (
      id, tenant_id, bank_statement_id, line_number, transaction_date,
      reference_number, description, amount_cents
    )
    values (
      ${lineId}::uuid,
      ${tenantId}::uuid,
      ${statementId}::uuid,
      1,
      '2026-07-27',
      'DEP',
      'Auto-match HTTP deposit',
      50000
    )
  `)
  await transaction.execute(
    statementValues(secondStatementId, `ST-AUTO-SECOND-${label}-${suffix}`)
  )

  return {
    tenantId,
    financeId,
    viewerId,
    statementId,
    secondStatementId,
    lineId,
    cashTransactionId,
  }
}

suite('Bank statement auto-match protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, audit, and rollback', async () => {
    const suffix = randomUUID().slice(0, 12)

    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedFixture(transaction, 'a', suffix)
      const fixtureB = await seedFixture(transaction, 'b', suffix)
      const identities = new Map([
        ['auto-match-http-finance-a-token', fixtureA.financeId],
        ['auto-match-http-viewer-a-token', fixtureA.viewerId],
        ['auto-match-http-finance-b-token', fixtureB.financeId],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const featureState = { enabled: true }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (
            key === 'ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS'
          ) {
            return [fixtureA.tenantId, fixtureB.tenantId]
          }
          return fallback
        }),
      } as unknown as ConfigService
      const moduleRef = await Test.createTestingModule({
        controllers: [FinanceReconciliationWorkflowController],
        providers: [
          FinanceReconciliationWorkflowService,
          AuditService,
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
        const route = `/v1/finance/reconciliation/${fixtureA.statementId}/auto-match`
        const command = {}

        await request(app.getHttpServer()).post(route).send(command).expect(401)
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'unknown')
          .send(command)
          .expect(401)
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ tenantId: fixtureA.tenantId })
          .expect(400)
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .send(command)
          .expect(400)
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer auto-match-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureB.statementId}/auto-match`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', ' auto-match-1 ')
          .send(command)
          .expect(200)
        expect(first.body).toEqual({
          statementId: fixtureA.statementId,
          tenantId: fixtureA.tenantId,
          status: 'draft',
          matchedCount: 1,
          remainingCount: 0,
        })

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'auto-match-1')
          .send(command)
          .expect(200)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureA.secondStatementId}/auto-match`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'auto-match-1')
          .send(command)
          .expect(409)

        const [line] = await transaction
          .select({ matchedCashTransactionId: bankStatementLines.matched_cash_transaction_id })
          .from(bankStatementLines)
          .where(
            and(
              eq(bankStatementLines.id, fixtureA.lineId),
              eq(bankStatementLines.tenant_id, fixtureA.tenantId)
            )
          )
        expect(line?.matchedCashTransactionId).toBe(fixtureA.cashTransactionId)

        const [requestRow] = await transaction
          .select({
            state: bankStatementAutoMatchRequests.state,
            result: bankStatementAutoMatchRequests.result,
          })
          .from(bankStatementAutoMatchRequests)
          .where(
            and(
              eq(bankStatementAutoMatchRequests.tenant_id, fixtureA.tenantId),
              eq(bankStatementAutoMatchRequests.idempotency_key, 'auto-match-1')
            )
          )
        expect(requestRow?.state).toBe('succeeded')
        expect(requestRow?.result).toMatchObject({ matchedCount: 1 })

        const [audit] = await transaction
          .select({ action: auditLog.action, entityType: auditLog.entity_type })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_id, fixtureA.statementId),
              eq(auditLog.action, 'update')
            )
          )
        expect(audit).toEqual({ action: 'update', entityType: 'bank_statement' })
      } finally {
        await app.close()
      }
    })
  })
})
