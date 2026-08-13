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
import { JournalPostController } from '../src/finance/journal-post.controller'
import { JournalPostService } from '../src/finance/journal-post.service'

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
  const otherJournalEntryId = randomUUID()

  await transaction.insert(tenants).values({
    id: tenantId,
    name: `Journal post HTTP tenant ${label}`,
    slug: `journal-post-http-${label}-${suffix}`,
  })
  await transaction.insert(users).values([
    {
      id: financeId,
      tenant_id: tenantId,
      email: `journal-post-http-finance-${label}-${suffix}@integration.test`,
      full_name: 'Journal post HTTP Finance',
      role: 'finance',
    },
    {
      id: viewerId,
      tenant_id: tenantId,
      email: `journal-post-http-viewer-${label}-${suffix}@integration.test`,
      full_name: 'Journal post HTTP Viewer',
      role: 'viewer',
    },
  ])
  await transaction.insert(fiscalPeriods).values({
    id: periodId,
    tenant_id: tenantId,
    name: `FY 2026 journal post ${label} ${suffix}`,
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
      name: 'Journal post HTTP debit account',
      account_type: 'asset',
      normal_balance: 'debit',
      created_by: financeId,
    },
    {
      id: creditAccountId,
      tenant_id: tenantId,
      code: `4000-${label}-${suffix}`,
      name: 'Journal post HTTP credit account',
      account_type: 'income',
      normal_balance: 'credit',
      created_by: financeId,
    },
  ])
  await transaction.insert(journalEntries).values([
    {
      id: journalEntryId,
      tenant_id: tenantId,
      posting_date: '2026-08-01',
      description: `Journal post HTTP entry ${label}`,
      source_type: 'manual',
      created_by: financeId,
    },
    {
      id: otherJournalEntryId,
      tenant_id: tenantId,
      posting_date: '2026-08-01',
      description: `Journal post HTTP alternate entry ${label}`,
      source_type: 'manual',
      created_by: financeId,
    },
  ])
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
    {
      tenant_id: tenantId,
      journal_entry_id: otherJournalEntryId,
      ledger_account_id: debitAccountId,
      line_number: 1,
      debit_cents: 10_000,
      credit_cents: 0,
    },
    {
      tenant_id: tenantId,
      journal_entry_id: otherJournalEntryId,
      ledger_account_id: creditAccountId,
      line_number: 2,
      debit_cents: 0,
      credit_cents: 10_000,
    },
  ])

  return {
    tenantId,
    financeId,
    viewerId,
    journalEntryId,
    otherJournalEntryId,
  }
}

suite('Journal post protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, posting, audit, and rollback', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedJournal(transaction, 'a', suffix)
      const fixtureB = await seedJournal(transaction, 'b', suffix)
      observedTenantId = fixtureA.tenantId

      const identities = new Map([
        ['journal-post-http-finance-a-token', fixtureA.financeId],
        ['journal-post-http-viewer-a-token', fixtureA.viewerId],
        ['journal-post-http-finance-b-token', fixtureB.financeId],
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
          if (key === 'ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [JournalPostController],
        providers: [
          JournalPostService,
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
        const route = `/v1/finance/journals/${fixtureA.journalEntryId}/post`

        await request(app.getHttpServer()).post(route).expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'unknown')
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-post-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-post-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(`/v1/finance/journals/${fixtureB.journalEntryId}/post`)
          .set('Authorization', 'Bearer journal-post-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .expect(404)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-post-http-finance-a-token')
          .set('Idempotency-Key', ' journal-post-http-1 ')
          .send({ journalEntryId: fixtureA.journalEntryId })
          .expect(200)
        expect(first.body).toEqual({
          journalEntryId: fixtureA.journalEntryId,
          tenantId: fixtureA.tenantId,
          postedNumber: 'JE-2026-000001',
        })

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-post-http-finance-a-token')
          .set('Idempotency-Key', 'journal-post-http-1')
          .expect(200)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/journals/${fixtureA.otherJournalEntryId}/post`
          )
          .set('Authorization', 'Bearer journal-post-http-finance-a-token')
          .set('Idempotency-Key', 'journal-post-http-1')
          .expect(409)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer journal-post-http-finance-a-token')
          .set('Idempotency-Key', 'second-command')
          .expect(409)

        const [entry] = await transaction
          .select({
            status: journalEntries.status,
            entryNumber: journalEntries.entry_number,
            tenantId: journalEntries.tenant_id,
          })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenant_id, fixtureA.tenantId),
              eq(journalEntries.id, fixtureA.journalEntryId)
            )
          )
          .limit(1)
        expect(entry).toEqual({
          status: 'posted',
          entryNumber: 'JE-2026-000001',
          tenantId: fixtureA.tenantId,
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
              eq(journalLines.journal_entry_id, fixtureA.journalEntryId)
            )
          )
        expect(lineTotals).toEqual({ debit: 10_000, credit: 10_000, count: 2 })

        const [auditEntry] = await transaction
          .select({
            action: auditLog.action,
            entityType: auditLog.entity_type,
            entityId: auditLog.entity_id,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_type, 'journal_entry'),
              eq(auditLog.entity_id, fixtureA.journalEntryId)
            )
          )
          .limit(1)
        expect(auditEntry).toEqual({
          action: 'status_change',
          entityType: 'journal_entry',
          entityId: fixtureA.journalEntryId,
        })

        const [tenantBEntry] = await transaction
          .select({ status: journalEntries.status })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenant_id, fixtureB.tenantId),
              eq(journalEntries.id, fixtureB.journalEntryId)
            )
          )
          .limit(1)
        expect(tenantBEntry).toEqual({ status: 'draft' })

        const [tenantARequestCount] = await transaction.execute(sql`
          select count(*)::int as count
          from public.journal_post_requests
          where tenant_id = ${fixtureA.tenantId}::uuid
            and idempotency_key = 'cross-tenant'
        `) as unknown as [{ count: number }]
        expect(tenantARequestCount?.count).toBe(0)
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
