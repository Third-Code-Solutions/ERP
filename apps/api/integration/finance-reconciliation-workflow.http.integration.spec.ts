import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  bankStatementAutoMatchRequests,
  bankStatementLineMatchRequests,
  bankStatementImportRequests,
  bankStatementLines,
  bankStatementReconcileRequests,
  bankStatementVoidRequests,
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
import { BankStatementImportStorageService } from '../src/finance/bank-statement-import.storage'

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
    cashAccountId,
  }
}

suite('Bank statement matching protected HTTP canary', () => {
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
      const featureState = {
        autoMatchEnabled: true,
        lineMatchEnabled: true,
        reconcileEnabled: true,
        voidEnabled: true,
        importEnabled: true,
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED') {
            return featureState.autoMatchEnabled
          }
          if (
            key === 'ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS'
          ) {
            return [fixtureA.tenantId, fixtureB.tenantId]
          }
          if (key === 'ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED') {
            return featureState.lineMatchEnabled
          }
          if (
            key === 'ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS'
          ) {
            return [fixtureA.tenantId, fixtureB.tenantId]
          }
          if (
            key === 'ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED'
          ) {
            return featureState.reconcileEnabled
          }
          if (
            key === 'ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS'
          ) {
            return [fixtureA.tenantId, fixtureB.tenantId]
          }
          if (key === 'ERP_FINANCE_RECONCILIATION_VOID_WRITES_ENABLED') {
            return featureState.voidEnabled
          }
          if (key === 'ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS') {
            return [fixtureA.tenantId, fixtureB.tenantId]
          }
          if (key === 'ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED') {
            return featureState.importEnabled
          }
          if (key === 'ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_TENANT_IDS') {
            return [fixtureA.tenantId, fixtureB.tenantId]
          }
          return fallback
        }),
      } as unknown as ConfigService
      const storageSource = Buffer.from(
        'date,reference,description,amount\n2026-07-02,DEP-2,Storage deposit,10.00\n'
      )
      const importStorage = {
        readCsv: vi.fn(async () => storageSource),
      }
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
          { provide: BankStatementImportStorageService, useValue: importStorage },
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
        const importRoute = '/v1/finance/reconciliation/import'
        const importBody = {
          cashAccountId: fixtureA.cashAccountId,
          referenceNumber: `ST-IMPORT-${suffix}`,
          sourceFileName: 'july-statement.csv',
          statementStart: '2026-07-01',
          statementEnd: '2026-07-31',
          openingBalanceCents: 0,
          closingBalanceCents: 1000,
          sourceBase64: Buffer.from(
            'date,reference,description,amount\n2026-07-01,DEP-1,Customer deposit,10.00\n'
          ).toString('base64'),
        }

        await request(app.getHttpServer())
          .post(importRoute)
          .send(importBody)
          .expect(401)
        await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'import-unknown')
          .send(importBody)
          .expect(401)
        await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'import-strict-body')
          .send({ ...importBody, tenantId: fixtureA.tenantId })
          .expect(400)
        await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-viewer-a-token')
          .set('Idempotency-Key', 'import-viewer-denied')
          .send(importBody)
          .expect(403)
        featureState.importEnabled = false
        await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'import-disabled-write')
          .send(importBody)
          .expect(503)
        featureState.importEnabled = true
        await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'import-cross-tenant')
          .send({ ...importBody, cashAccountId: fixtureB.cashAccountId })
          .expect(409)

        const imported = await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'import-1')
          .send(importBody)
          .expect(200)
        expect(imported.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          status: 'draft',
          lineCount: 1,
        })
        const importedReplay = await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', ' import-1 ')
          .send(importBody)
          .expect(200)
        expect(importedReplay.body).toEqual(imported.body)
        await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'import-1')
          .send({ ...importBody, referenceNumber: `ST-IMPORT-OTHER-${suffix}` })
          .expect(409)

        const storagePath = `${fixtureA.tenantId}/bank-statements/${suffix}.csv`
        await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'import-storage-cross-tenant')
          .send({
            ...importBody,
            sourceBase64: undefined,
            sourceStoragePath: `${fixtureB.tenantId}/bank-statements/${suffix}.csv`,
            referenceNumber: `ST-IMPORT-CROSS-${suffix}`,
          })
          .expect(403)
        const importedFromStorage = await request(app.getHttpServer())
          .post(importRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'import-storage-1')
          .send({
            ...importBody,
            sourceBase64: undefined,
            sourceStoragePath: storagePath,
            referenceNumber: `ST-IMPORT-STORAGE-${suffix}`,
          })
          .expect(200)
        expect(importedFromStorage.body).toMatchObject({
          tenantId: fixtureA.tenantId,
          status: 'draft',
          lineCount: 1,
        })
        expect(importStorage.readCsv).toHaveBeenCalledWith(storagePath)

        const [importRequestRow] = await transaction
          .select({
            state: bankStatementImportRequests.state,
            statementId: bankStatementImportRequests.bank_statement_id,
            result: bankStatementImportRequests.result,
          })
          .from(bankStatementImportRequests)
          .where(
            and(
              eq(bankStatementImportRequests.tenant_id, fixtureA.tenantId),
              eq(bankStatementImportRequests.idempotency_key, 'import-1')
            )
          )
        expect(importRequestRow?.state).toBe('succeeded')
        expect(importRequestRow?.statementId).toBe(imported.body.statementId)
        expect(importRequestRow?.result).toEqual(imported.body)

        const [importedStatement] = await transaction
        .select({
          status: bankStatements.status,
          sourceSha256: bankStatements.source_sha256,
          sourceStoragePath: bankStatements.source_storage_path,
        })
          .from(bankStatements)
          .where(
            and(
              eq(bankStatements.id, imported.body.statementId),
              eq(bankStatements.tenant_id, fixtureA.tenantId)
            )
          )
        expect(importedStatement?.status).toBe('draft')
        expect(importedStatement?.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
        expect(importedStatement?.sourceStoragePath).toBeNull()

        const [storageStatement] = await transaction
          .select({ sourceStoragePath: bankStatements.source_storage_path })
          .from(bankStatements)
          .where(
            and(
              eq(bankStatements.id, importedFromStorage.body.statementId),
              eq(bankStatements.tenant_id, fixtureA.tenantId)
            )
          )
        expect(storageStatement?.sourceStoragePath).toBe(storagePath)

        const [importAudit] = await transaction
          .select({ diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_id, imported.body.statementId),
              eq(auditLog.action, 'create'),
              sql`${auditLog.diff}->>'operation' = 'import'`
            )
          )
        expect(importAudit?.diff).toMatchObject({
          operation: 'import',
          line_count: 1,
        })

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

        featureState.autoMatchEnabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.autoMatchEnabled = true

        const reconcileRoute = `/v1/finance/reconciliation/${fixtureA.statementId}/reconcile`
        await request(app.getHttpServer())
          .post(reconcileRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .send({})
          .expect(400)
        await request(app.getHttpServer())
          .post(reconcileRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'reconcile-strict-body')
          .send({ tenantId: fixtureA.tenantId })
          .expect(400)
        await request(app.getHttpServer())
          .post(reconcileRoute)
          .set('Authorization', 'Bearer auto-match-http-viewer-a-token')
          .set('Idempotency-Key', 'reconcile-viewer-denied')
          .send({})
          .expect(403)
        featureState.reconcileEnabled = false
        await request(app.getHttpServer())
          .post(reconcileRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'reconcile-disabled-write')
          .send({})
          .expect(503)
        featureState.reconcileEnabled = true
        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureB.statementId}/reconcile`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'reconcile-cross-tenant')
          .send({})
          .expect(404)

        const voidRoute = `/v1/finance/reconciliation/${fixtureA.statementId}/void`
        await request(app.getHttpServer())
          .post(voidRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'void-invalid-reason')
          .send({ reason: 'x' })
          .expect(400)
        await request(app.getHttpServer())
          .post(voidRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'void-strict-body')
          .send({ reason: 'Valid correction', tenantId: fixtureA.tenantId })
          .expect(400)
        await request(app.getHttpServer())
          .post(voidRoute)
          .set('Authorization', 'Bearer auto-match-http-viewer-a-token')
          .set('Idempotency-Key', 'void-viewer-denied')
          .send({ reason: 'Valid correction' })
          .expect(403)
        featureState.voidEnabled = false
        await request(app.getHttpServer())
          .post(voidRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'void-disabled-write')
          .send({ reason: 'Valid correction' })
          .expect(503)
        featureState.voidEnabled = true
        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureB.statementId}/void`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'void-cross-tenant')
          .send({ reason: 'Valid correction' })
          .expect(404)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureB.statementId}/auto-match`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        const lineMatchRoute = `/v1/finance/reconciliation/${fixtureA.statementId}/lines/${fixtureA.lineId}/match`
        const lineMatchBody = {
          cashTransactionId: fixtureA.cashTransactionId,
        }
        await request(app.getHttpServer())
          .post(lineMatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .send(lineMatchBody)
          .expect(400)
        await request(app.getHttpServer())
          .post(lineMatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'strict-line-body')
          .send({ ...lineMatchBody, tenantId: fixtureA.tenantId })
          .expect(400)
        await request(app.getHttpServer())
          .post(lineMatchRoute)
          .set('Authorization', 'Bearer auto-match-http-viewer-a-token')
          .set('Idempotency-Key', 'line-viewer-denied')
          .send(lineMatchBody)
          .expect(403)
        featureState.lineMatchEnabled = false
        await request(app.getHttpServer())
          .post(lineMatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'line-disabled-write')
          .send(lineMatchBody)
          .expect(503)
        featureState.lineMatchEnabled = true
        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureB.statementId}/lines/${fixtureB.lineId}/match`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'line-cross-tenant')
          .send(lineMatchBody)
          .expect(404)

        const manualMatch = await request(app.getHttpServer())
          .post(lineMatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', ' manual-match-1 ')
          .send(lineMatchBody)
          .expect(200)
        expect(manualMatch.body).toEqual({
          statementId: fixtureA.statementId,
          lineId: fixtureA.lineId,
          tenantId: fixtureA.tenantId,
          status: 'matched',
          matchedCashTransactionId: fixtureA.cashTransactionId,
        })
        const manualMatchReplay = await request(app.getHttpServer())
          .post(lineMatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'manual-match-1')
          .send(lineMatchBody)
          .expect(200)
        expect(manualMatchReplay.body).toEqual(manualMatch.body)

        const lineUnmatchRoute = `/v1/finance/reconciliation/${fixtureA.statementId}/lines/${fixtureA.lineId}/unmatch`
        await request(app.getHttpServer())
          .post(lineUnmatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'manual-match-1')
          .send({})
          .expect(409)
        const manualUnmatch = await request(app.getHttpServer())
          .post(lineUnmatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', ' manual-unmatch-1 ')
          .send({})
          .expect(200)
        expect(manualUnmatch.body).toEqual({
          statementId: fixtureA.statementId,
          lineId: fixtureA.lineId,
          tenantId: fixtureA.tenantId,
          status: 'unmatched',
          matchedCashTransactionId: null,
        })
        const manualUnmatchReplay = await request(app.getHttpServer())
          .post(lineUnmatchRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'manual-unmatch-1')
          .send({})
          .expect(200)
        expect(manualUnmatchReplay.body).toEqual(manualUnmatch.body)

        await request(app.getHttpServer())
          .post(reconcileRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'reconcile-before-match')
          .send({})
          .expect(409)

        await request(app.getHttpServer())
          .post(voidRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'void-before-reconcile')
          .send({ reason: 'Correction before finalization' })
          .expect(409)

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

        const reconciled = await request(app.getHttpServer())
          .post(reconcileRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', ' reconcile-1 ')
          .send({})
          .expect(200)
        expect(reconciled.body).toEqual({
          statementId: fixtureA.statementId,
          tenantId: fixtureA.tenantId,
          status: 'reconciled',
        })
        const reconciledReplay = await request(app.getHttpServer())
          .post(reconcileRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'reconcile-1')
          .send({})
          .expect(200)
        expect(reconciledReplay.body).toEqual(reconciled.body)

        const voided = await request(app.getHttpServer())
          .post(voidRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', ' void-1 ')
          .send({ reason: 'Duplicate statement import' })
          .expect(200)
        expect(voided.body).toEqual({
          statementId: fixtureA.statementId,
          tenantId: fixtureA.tenantId,
          status: 'voided',
        })
        const voidedReplay = await request(app.getHttpServer())
          .post(voidRoute)
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'void-1')
          .send({ reason: 'Duplicate statement import' })
          .expect(200)
        expect(voidedReplay.body).toEqual(voided.body)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureA.secondStatementId}/auto-match`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'auto-match-1')
          .send(command)
          .expect(409)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureA.secondStatementId}/reconcile`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'reconcile-1')
          .send({})
          .expect(409)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/reconciliation/${fixtureA.secondStatementId}/void`
          )
          .set('Authorization', 'Bearer auto-match-http-finance-a-token')
          .set('Idempotency-Key', 'void-1')
          .send({ reason: 'Duplicate statement import' })
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

        const [reconcileRequestRow] = await transaction
          .select({
            state: bankStatementReconcileRequests.state,
            result: bankStatementReconcileRequests.result,
          })
          .from(bankStatementReconcileRequests)
          .where(
            and(
              eq(bankStatementReconcileRequests.tenant_id, fixtureA.tenantId),
              eq(
                bankStatementReconcileRequests.idempotency_key,
                'reconcile-1'
              )
            )
          )
        expect(reconcileRequestRow?.state).toBe('succeeded')
        expect(reconcileRequestRow?.result).toMatchObject({
          status: 'reconciled',
        })

        const [voidRequestRow] = await transaction
          .select({
            state: bankStatementVoidRequests.state,
            result: bankStatementVoidRequests.result,
          })
          .from(bankStatementVoidRequests)
          .where(
            and(
              eq(bankStatementVoidRequests.tenant_id, fixtureA.tenantId),
              eq(bankStatementVoidRequests.idempotency_key, 'void-1')
            )
          )
        expect(voidRequestRow?.state).toBe('succeeded')
        expect(voidRequestRow?.result).toMatchObject({ status: 'voided' })

        const [statementRow] = await transaction
          .select({ status: bankStatements.status })
          .from(bankStatements)
          .where(
            and(
              eq(bankStatements.id, fixtureA.statementId),
              eq(bankStatements.tenant_id, fixtureA.tenantId)
            )
          )
        expect(statementRow?.status).toBe('voided')

        const [lineRequestRow] = await transaction
          .select({
            action: bankStatementLineMatchRequests.action,
            state: bankStatementLineMatchRequests.state,
            result: bankStatementLineMatchRequests.result,
          })
          .from(bankStatementLineMatchRequests)
          .where(
            and(
              eq(bankStatementLineMatchRequests.tenant_id, fixtureA.tenantId),
              eq(
                bankStatementLineMatchRequests.idempotency_key,
                'manual-unmatch-1'
              )
            )
          )
        expect(lineRequestRow?.action).toBe('unmatch')
        expect(lineRequestRow?.state).toBe('succeeded')
        expect(lineRequestRow?.result).toMatchObject({ status: 'unmatched' })

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

        const [reconcileAudit] = await transaction
          .select({ diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_id, fixtureA.statementId),
              eq(auditLog.action, 'update'),
              sql`${auditLog.diff}->>'operation' = 'reconcile'`
            )
          )
        expect(reconcileAudit?.diff).toMatchObject({
          operation: 'reconcile',
          to_status: 'reconciled',
        })

        const [voidAudit] = await transaction
          .select({ diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_id, fixtureA.statementId),
              eq(auditLog.action, 'status_change'),
              sql`${auditLog.diff}->>'operation' = 'void'`
            )
          )
        expect(voidAudit?.diff).toMatchObject({
          operation: 'void',
          to_status: 'voided',
          reason: 'Duplicate statement import',
        })

        const [lineAudit] = await transaction
          .select({ action: auditLog.action, entityType: auditLog.entity_type })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_id, fixtureA.lineId),
              eq(auditLog.action, 'update'),
              sql`${auditLog.diff}->>'operation' = 'unmatch'`
            )
          )
        expect(lineAudit).toEqual({
          action: 'update',
          entityType: 'bank_statement_line',
        })
      } finally {
        await app.close()
      }
    })
  })
})
