import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  fiscalPeriods,
  journalEntries,
  journalLines,
  journalReverseRequests,
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
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { JournalPostService } from '../src/finance/journal-post.service'
import { JournalReverseController } from '../src/finance/journal-reverse.controller'
import { JournalReverseService } from '../src/finance/journal-reverse.service'

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

async function seedJournal(
  transaction: DatabaseTransaction,
  label: string,
  suffix: string
) {
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const periodId = randomUUID()
  const debitAccountId = randomUUID()
  const creditAccountId = randomUUID()
  const journalEntryId = randomUUID()

  await transaction.insert(tenants).values({
    id: tenantId,
    name: `Journal reverse HTTP tenant ${label}`,
    slug: `journal-reverse-http-${label}-${suffix}`,
  })
  await transaction.insert(users).values([
    {
      id: financeId,
      tenant_id: tenantId,
      email: `journal-reverse-http-finance-${label}-${suffix}@integration.test`,
      full_name: 'Journal reverse HTTP Finance',
      role: 'finance',
    },
    {
      id: viewerId,
      tenant_id: tenantId,
      email: `journal-reverse-http-viewer-${label}-${suffix}@integration.test`,
      full_name: 'Journal reverse HTTP Viewer',
      role: 'viewer',
    },
  ])
  await transaction.insert(fiscalPeriods).values({
    id: periodId,
    tenant_id: tenantId,
    name: `FY 2026 journal reverse ${label} ${suffix}`,
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
      name: 'Journal reverse HTTP debit account',
      account_type: 'asset',
      normal_balance: 'debit',
      created_by: financeId,
    },
    {
      id: creditAccountId,
      tenant_id: tenantId,
      code: `4000-${label}-${suffix}`,
      name: 'Journal reverse HTTP credit account',
      account_type: 'income',
      normal_balance: 'credit',
      created_by: financeId,
    },
  ])
  await transaction.insert(journalEntries).values({
    id: journalEntryId,
    tenant_id: tenantId,
    posting_date: '2026-08-01',
    description: `Journal reverse HTTP entry ${label}`,
    source_type: 'manual',
    created_by: financeId,
  })
  await transaction.insert(journalLines).values([
    {
      tenant_id: tenantId,
      journal_entry_id: journalEntryId,
      ledger_account_id: debitAccountId,
      line_number: 1,
      debit_cents: 10_000,
      credit_cents: 0,
    },
    {
      tenant_id: tenantId,
      journal_entry_id: journalEntryId,
      ledger_account_id: creditAccountId,
      line_number: 2,
      debit_cents: 0,
      credit_cents: 10_000,
    },
  ])

  return { tenantId, financeId, viewerId, journalEntryId }
}

suite('Journal reverse protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, balanced unwind, audit, and rollback', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedJournal(transaction, 'a', suffix)
      const fixtureB = await seedJournal(transaction, 'b', suffix)
      observedTenantId = fixtureA.tenantId
      const bound = transactionBoundDatabase(transaction)
      const audit = new AuditService()
      const postConfig = new ConfigService({
        ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED: true,
        ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS: [
          fixtureA.tenantId,
          fixtureB.tenantId,
        ],
      })
      const postService = new JournalPostService(
        postConfig,
        bound,
        audit
      )
      await postService.post(
        fixtureA.journalEntryId,
        {
          userId: fixtureA.financeId,
          tenantId: fixtureA.tenantId,
          role: 'finance',
          email: `journal-reverse-http-finance-a-${suffix}@integration.test`,
        },
        'journal-reverse-post-a'
      )
      await postService.post(
        fixtureB.journalEntryId,
        {
          userId: fixtureB.financeId,
          tenantId: fixtureB.tenantId,
          role: 'finance',
          email: `journal-reverse-http-finance-b-${suffix}@integration.test`,
        },
        'journal-reverse-post-b'
      )

      const identities = new Map([
        ['journal-reverse-http-finance-a-token', fixtureA.financeId],
        ['journal-reverse-http-viewer-a-token', fixtureA.viewerId],
        ['journal-reverse-http-finance-b-token', fixtureB.financeId],
      ])
      const identity = {
        verifyAccessToken: vi.fn(async (token: string) => {
          const userId = identities.get(token)
          return userId ? { userId } : null
        }),
      }
      const featureState = {
        enabled: true,
        tenantIds: [fixtureA.tenantId, fixtureB.tenantId],
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [JournalReverseController],
        providers: [
          JournalReverseService,
          AuditService,
          { provide: ConfigService, useValue: config },
          { provide: DatabaseService, useValue: bound },
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
        const route = `/v1/finance/journals/${fixtureA.journalEntryId}/reverse`
        const command = {
          reason: 'Correct duplicate accrual',
          postingDate: '2026-08-02',
        }

        await request(app.getHttpServer()).post(route).send(command).expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'unknown')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .send(command)
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: fixtureA.tenantId })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'invalid-reason')
          .send({ ...command, reason: 'x' })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(`/v1/finance/journals/${fixtureB.journalEntryId}/reverse`)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', ' journal-reverse-http-1 ')
          .send(command)
          .expect(200)
        expect(first.body).toEqual({
          journalEntryId: fixtureA.journalEntryId,
          tenantId: fixtureA.tenantId,
          reversalJournalEntryId: expect.any(String),
          reversalNumber: 'JE-2026-000002',
        })

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'journal-reverse-http-1')
          .send(command)
          .expect(200)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'journal-reverse-http-1')
          .send({ ...command, reason: 'Different correction' })
          .expect(409)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'second-command')
          .send(command)
          .expect(409)

        const [original] = await transaction
          .select({
            status: journalEntries.status,
            entryNumber: journalEntries.entry_number,
          })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenant_id, fixtureA.tenantId),
              eq(journalEntries.id, fixtureA.journalEntryId)
            )
          )
          .limit(1)
        expect(original).toEqual({
          status: 'posted',
          entryNumber: 'JE-2026-000001',
        })

        const [reversal] = await transaction
          .select({
            status: journalEntries.status,
            reversesEntryId: journalEntries.reverses_entry_id,
            entryNumber: journalEntries.entry_number,
          })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenant_id, fixtureA.tenantId),
              eq(journalEntries.id, first.body.reversalJournalEntryId)
            )
          )
          .limit(1)
        expect(reversal).toEqual({
          status: 'posted',
          reversesEntryId: fixtureA.journalEntryId,
          entryNumber: 'JE-2026-000002',
        })

        const [lineTotals] = await transaction
          .select({
            debit: sql<number>`coalesce(sum(${journalLines.debit_cents}), 0)::int`,
            credit: sql<number>`coalesce(sum(${journalLines.credit_cents}), 0)::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(journalLines)
          .where(
            and(
              eq(journalLines.tenant_id, fixtureA.tenantId),
              eq(journalLines.journal_entry_id, first.body.reversalJournalEntryId)
            )
          )
        expect(lineTotals).toEqual({ debit: 10_000, credit: 10_000, count: 2 })

        const [requestRow] = await transaction
          .select({
            state: journalReverseRequests.state,
            result: journalReverseRequests.result,
          })
          .from(journalReverseRequests)
          .where(
            and(
              eq(journalReverseRequests.tenant_id, fixtureA.tenantId),
              eq(
                journalReverseRequests.idempotency_key,
                'journal-reverse-http-1'
              )
            )
          )
          .limit(1)
        expect(requestRow).toEqual({ state: 'succeeded', result: first.body })

        const auditRows = await transaction
          .select({ action: auditLog.action, diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_type, 'journal_entry'),
              eq(auditLog.entity_id, fixtureA.journalEntryId)
            )
          )
        expect(
          auditRows.filter((row) => {
            const diff = row.diff as Record<string, unknown> | null
            return (
              row.action === 'status_change' &&
              diff?.from === 'posted' &&
              diff?.to === 'reversed'
            )
          })
        ).toHaveLength(1)

        const [tenantBRequestCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(journalReverseRequests)
          .where(eq(journalReverseRequests.tenant_id, fixtureB.tenantId))
        expect(tenantBRequestCount?.count).toBe(0)
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
