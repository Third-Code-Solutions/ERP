import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  accounts,
  auditLog,
  db,
  fiscalPeriods,
  invoices,
  journalEntries,
  journalLines,
  ledgerAccounts,
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
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { CustomerInvoiceReverseController } from '../src/finance/customer-invoice-reverse.controller'
import { CustomerInvoiceReverseService } from '../src/finance/customer-invoice-reverse.service'

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

suite('Customer invoice reverse protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, balanced unwind, audit, and rollback', async () => {
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
    const arAccount = randomUUID()
    const revenueAccount = randomUUID()
    const periodA = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      observedTenantId = tenantA
      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Customer invoice reverse HTTP tenant A',
          slug: `customer-invoice-reverse-http-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Customer invoice reverse HTTP tenant B',
          slug: `customer-invoice-reverse-http-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: financeA,
          tenant_id: tenantA,
          email: `customer-invoice-reverse-http-finance-a-${suffix}@integration.test`,
          full_name: 'Customer invoice reverse finance A',
          role: 'finance',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `customer-invoice-reverse-http-viewer-a-${suffix}@integration.test`,
          full_name: 'Customer invoice reverse viewer A',
          role: 'viewer',
        },
        {
          id: financeB,
          tenant_id: tenantB,
          email: `customer-invoice-reverse-http-finance-b-${suffix}@integration.test`,
          full_name: 'Customer invoice reverse finance B',
          role: 'finance',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: `Customer invoice reverse account A ${suffix}`,
          created_by: financeA,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: `Customer invoice reverse account B ${suffix}`,
          created_by: financeB,
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          account_id: accountA,
          name: 'Customer invoice reverse project A',
          client: 'Tenant A client',
          created_by: financeA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          account_id: accountB,
          name: 'Customer invoice reverse project B',
          client: 'Tenant B client',
          created_by: financeB,
        },
      ])
      await transaction.insert(fiscalPeriods).values({
        id: periodA,
        tenant_id: tenantA,
        name: 'FY 2026 reverse A',
        starts_on: '2026-01-01',
        ends_on: '2026-12-31',
        status: 'open',
        created_by: financeA,
      })
      await transaction.insert(ledgerAccounts).values([
        {
          id: arAccount,
          tenant_id: tenantA,
          code: `1100-${suffix}`,
          name: 'Accounts receivable',
          account_type: 'asset',
          normal_balance: 'debit',
          system_key: 'accounts_receivable',
          created_by: financeA,
        },
        {
          id: revenueAccount,
          tenant_id: tenantA,
          code: `4000-${suffix}`,
          name: 'Project revenue',
          account_type: 'income',
          normal_balance: 'credit',
          system_key: 'revenue',
          created_by: financeA,
        },
      ])
      await transaction.insert(invoices).values([
        {
          id: invoiceA,
          tenant_id: tenantA,
          project_id: projectA,
          account_id: accountA,
          created_by: financeA,
          invoice_number: `INV-REV-A-${suffix}`,
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
          invoice_number: `INV-REV-B-${suffix}`,
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

      const issuedRows = (await transaction.execute(sql`
        select journal_entry_id, journal_entry_number
        from public.issue_customer_invoice(
          ${invoiceA}::uuid,
          ${financeA}::uuid,
          '2026-08-01'::date
        )
      `)) as unknown as Array<{
        journal_entry_id: string
        journal_entry_number: string
      }>
      expect(issuedRows[0]).toMatchObject({
        journal_entry_id: expect.any(String),
        journal_entry_number: 'JE-2026-000001',
      })
      const originalJournalId = issuedRows[0]?.journal_entry_id
      if (!originalJournalId) throw new Error('Invoice issue fixture failed')

      const identities = new Map([
        ['customer-invoice-reverse-http-finance-a-token', financeA],
        ['customer-invoice-reverse-http-viewer-a-token', viewerA],
        ['customer-invoice-reverse-http-finance-b-token', financeB],
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
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [CustomerInvoiceReverseController],
        providers: [
          CustomerInvoiceReverseService,
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
        const route = `/v1/finance/customer-invoices/${invoiceA}/reverse`
        const command = {
          reason: 'Contract correction',
          postingDate: '2026-08-03',
        }

        await request(app.getHttpServer()).post(route).send(command).expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'customer-invoice-reverse-http-1')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: tenantA })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(`/v1/finance/customer-invoices/${invoiceB}/reverse`)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'invalid-reason')
          .send({ reason: 'no', postingDate: command.postingDate })
          .expect(400)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', ' customer-invoice-reverse-http-1 ')
          .send(command)
          .expect(200)
        expect(first.body).toMatchObject({
          invoiceId: invoiceA,
          tenantId: tenantA,
          status: 'cancelled',
          reversalJournalEntryId: expect.any(String),
          reversalJournalEntryNumber: 'JE-2026-000002',
        })

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'customer-invoice-reverse-http-1')
          .send(command)
          .expect(200)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'customer-invoice-reverse-http-1')
          .send({ ...command, reason: 'Different correction' })
          .expect(409)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer customer-invoice-reverse-http-finance-a-token')
          .set('Idempotency-Key', 'second-command')
          .send(command)
          .expect(409)

        const [invoice] = await transaction
          .select({
            status: invoices.status,
            reversalJournalId: invoices.reversal_journal_entry_id,
          })
          .from(invoices)
          .where(and(eq(invoices.tenant_id, tenantA), eq(invoices.id, invoiceA)))
          .limit(1)
        expect(invoice).toEqual({
          status: 'cancelled',
          reversalJournalId: first.body.reversalJournalEntryId,
        })

        const [reversal] = await transaction
          .select({
            status: journalEntries.status,
            entryNumber: journalEntries.entry_number,
            reversesEntryId: journalEntries.reverses_entry_id,
          })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenant_id, tenantA),
              eq(journalEntries.id, first.body.reversalJournalEntryId)
            )
          )
          .limit(1)
        expect(reversal).toEqual({
          status: 'posted',
          entryNumber: 'JE-2026-000002',
          reversesEntryId: originalJournalId,
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
              eq(journalLines.tenant_id, tenantA),
              eq(journalLines.journal_entry_id, first.body.reversalJournalEntryId)
            )
          )
        expect(lineTotals).toEqual({ debit: 100000, credit: 100000, count: 2 })

        const [auditEntry] = await transaction
          .select({
            action: auditLog.action,
            entityType: auditLog.entity_type,
            entityId: auditLog.entity_id,
          })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, tenantA),
              eq(auditLog.entity_type, 'invoice'),
              eq(auditLog.entity_id, invoiceA)
            )
          )
          .limit(1)
        expect(auditEntry).toEqual({
          action: 'status_change',
          entityType: 'invoice',
          entityId: invoiceA,
        })

        const [tenantBJournalCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(journalEntries)
          .where(eq(journalEntries.tenant_id, tenantB))
        expect(tenantBJournalCount?.count).toBe(0)
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
