import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  cashTransactionWorkflowRequests,
  cashTransactions,
  db,
  journalEntries,
  journalLines,
  tenants,
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
import { CashTransactionWorkflowController } from '../src/finance/cash-transaction-workflow.controller'
import { CashTransactionWorkflowService } from '../src/finance/cash-transaction-workflow.service'

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

async function seedCashFixture(
  transaction: DatabaseTransaction,
  label: string,
  suffix: string
) {
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const projectId = randomUUID()
  const vendorId = randomUUID()
  const costCodeId = randomUUID()
  const purchaseOrderId = randomUUID()
  const purchaseOrderLineId = randomUUID()
  const billId = randomUUID()
  const cashLedgerId = randomUUID()
  const payableLedgerId = randomUUID()
  const inputVatLedgerId = randomUUID()
  const withholdingLedgerId = randomUUID()
  const expenseLedgerId = randomUUID()
  const cashAccountId = randomUUID()
  const cashTransactionId = randomUUID()

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (
      ${tenantId}::uuid,
      ${`Cash workflow HTTP tenant ${label}`},
      ${`cash-workflow-http-${label}-${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (
        ${financeId}::uuid,
        ${tenantId}::uuid,
        ${`cash-workflow-http-finance-${label}-${suffix}@integration.test`},
        'Cash workflow HTTP Finance',
        'finance'
      ),
      (
        ${viewerId}::uuid,
        ${tenantId}::uuid,
        ${`cash-workflow-http-viewer-${label}-${suffix}@integration.test`},
        'Cash workflow HTTP Viewer',
        'viewer'
      )
  `)
  await transaction.execute(sql`
    insert into public.projects (id, tenant_id, name, client, created_by)
    values (
      ${projectId}::uuid,
      ${tenantId}::uuid,
      ${`Cash workflow HTTP project ${label}`},
      'Cash workflow HTTP client',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.vendors (id, tenant_id, name)
    values (
      ${vendorId}::uuid,
      ${tenantId}::uuid,
      ${`Cash workflow HTTP vendor ${label} ${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.cost_codes (id, tenant_id, code, name, category, created_by)
    values (
      ${costCodeId}::uuid,
      ${tenantId}::uuid,
      ${`MAT-${label}-${suffix}`},
      'Cash workflow HTTP materials',
      'material',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.fiscal_periods (
      tenant_id, name, starts_on, ends_on, status, created_by
    )
    values (
      ${tenantId}::uuid,
      ${`FY 2026 cash workflow ${label} ${suffix}`},
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
        ${cashLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`1000-${label}-${suffix}`},
        'Cash on hand',
        'asset',
        'debit',
        'cash',
        ${financeId}::uuid
      ),
      (
        ${payableLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`2000-${label}-${suffix}`},
        'Accounts payable',
        'liability',
        'credit',
        'accounts_payable',
        ${financeId}::uuid
      ),
      (
        ${inputVatLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`1130-${label}-${suffix}`},
        'Input VAT',
        'asset',
        'debit',
        'input_vat_receivable',
        ${financeId}::uuid
      ),
      (
        ${withholdingLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`2110-${label}-${suffix}`},
        'Withholding payable',
        'liability',
        'credit',
        'withholding_tax_payable',
        ${financeId}::uuid
      ),
      (
        ${expenseLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`6100-${label}-${suffix}`},
        'Cash workflow materials',
        'expense',
        'debit',
        null,
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
      ${cashLedgerId}::uuid,
      ${`Operating cash ${label}`},
      'bank',
      'PHP',
      ${financeId}::uuid
    )
  `)
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
      ${`PO-CASH-${label}-${suffix}`},
      'issued',
      100000,
      12000,
      2000,
      110000
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
      'Cash workflow materials',
      ${costCodeId}::uuid,
      1,
      1000000,
      100000,
      100000
    )
  `)
  await transaction.execute(sql`
    insert into public.supplier_bills (
      id, tenant_id, purchase_order_id, project_id, vendor_id,
      vendor_bill_number, bill_date, due_date, subtotal_cents, input_vat_cents,
      withholding_tax_cents, total_payable_cents, created_by
    )
    values (
      ${billId}::uuid,
      ${tenantId}::uuid,
      ${purchaseOrderId}::uuid,
      ${projectId}::uuid,
      ${vendorId}::uuid,
      ${`SI-CASH-${label}-${suffix}`},
      '2026-07-27',
      '2026-08-27',
      100000,
      12000,
      2000,
      110000,
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
      ${expenseLedgerId}::uuid,
      ${projectId}::uuid,
      ${purchaseOrderLineId}::uuid,
      ${costCodeId}::uuid,
      1,
      'Cash workflow materials',
      100000
    )
  `)
  await transaction.execute(sql`
    select * from public.post_supplier_bill(
      ${billId}::uuid,
      ${financeId}::uuid,
      '2026-07-27'::date
    )
  `)
  await transaction.execute(sql`
    insert into public.cash_transactions (
      id, tenant_id, cash_account_id, direction, vendor_id,
      reference_number, transaction_date, currency, amount_cents, created_by
    )
    values (
      ${cashTransactionId}::uuid,
      ${tenantId}::uuid,
      ${cashAccountId}::uuid,
      'disbursement',
      ${vendorId}::uuid,
      ${`DSP-CASH-${label}-${suffix}`},
      '2026-07-28',
      'PHP',
      110000,
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.cash_allocations (
      tenant_id, cash_transaction_id, allocation_type, supplier_bill_id,
      line_number, description, amount_cents
    )
    values (
      ${tenantId}::uuid,
      ${cashTransactionId}::uuid,
      'supplier_bill',
      ${billId}::uuid,
      1,
      'Cash workflow supplier bill allocation',
      110000
    )
  `)

  return {
    tenantId,
    financeId,
    viewerId,
    cashTransactionId,
    supplierBillId: billId,
    cashAccountId,
  }
}

suite('Cash transaction workflow protected HTTP canary', () => {
  it('proves post/reverse auth, tenant scope, idempotency, ledger, audit, and rollback', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedCashFixture(transaction, 'a', suffix)
      const fixtureB = await seedCashFixture(transaction, 'b', suffix)
      observedTenantId = fixtureA.tenantId
      const identities = new Map([
        ['cash-workflow-http-finance-a-token', fixtureA.financeId],
        ['cash-workflow-http-viewer-a-token', fixtureA.viewerId],
        ['cash-workflow-http-finance-b-token', fixtureB.financeId],
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
          if (key === 'ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService
      const moduleRef = await Test.createTestingModule({
        controllers: [CashTransactionWorkflowController],
        providers: [
          CashTransactionWorkflowService,
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
        const postRoute = `/v1/finance/cash-transactions/${fixtureA.cashTransactionId}/post`
        const reverseRoute = `/v1/finance/cash-transactions/${fixtureA.cashTransactionId}/reverse`
        const postCommand = { postingDate: '2026-07-29' }
        const reverseCommand = {
          reason: 'Returned vendor payment',
          postingDate: '2026-07-30',
        }

        await request(app.getHttpServer()).post(postRoute).send(postCommand).expect(401)

        await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'unknown')
          .send(postCommand)
          .expect(401)

        await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...postCommand, tenantId: fixtureA.tenantId })
          .expect(400)

        await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .send(postCommand)
          .expect(400)

        await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(postCommand)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(postCommand)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(
            `/v1/finance/cash-transactions/${fixtureB.cashTransactionId}/post`
          )
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant-post')
          .send(postCommand)
          .expect(404)

        const firstPost = await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', ' cash-workflow-post-1 ')
          .send(postCommand)
          .expect(200)
        expect(firstPost.body).toEqual({
          cashTransactionId: fixtureA.cashTransactionId,
          tenantId: fixtureA.tenantId,
          status: 'posted',
          cashTransactionNumber: 'CT-2026-000001',
          journalEntryId: expect.any(String),
          journalEntryNumber: 'JE-2026-000002',
        })

        const postReplay = await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cash-workflow-post-1')
          .send(postCommand)
          .expect(200)
        expect(postReplay.body).toEqual(firstPost.body)

        await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cash-workflow-post-1')
          .send({ postingDate: '2026-07-30' })
          .expect(409)

        await request(app.getHttpServer())
          .post(postRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cash-workflow-post-2')
          .send(postCommand)
          .expect(409)

        const [postedCash] = await transaction
          .select({
            status: cashTransactions.status,
            internalNumber: cashTransactions.internal_number,
            postingJournalId: cashTransactions.posting_journal_entry_id,
          })
          .from(cashTransactions)
          .where(
            and(
              eq(cashTransactions.tenant_id, fixtureA.tenantId),
              eq(cashTransactions.id, fixtureA.cashTransactionId)
            )
          )
          .limit(1)
        expect(postedCash).toEqual({
          status: 'posted',
          internalNumber: 'CT-2026-000001',
          postingJournalId: firstPost.body.journalEntryId,
        })

        const [postLineTotals] = await transaction
          .select({
            debit: sql<number>`coalesce(sum(${journalLines.debit_cents}), 0)::int`,
            credit: sql<number>`coalesce(sum(${journalLines.credit_cents}), 0)::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(journalLines)
          .where(
            and(
              eq(journalLines.tenant_id, fixtureA.tenantId),
              eq(journalLines.journal_entry_id, firstPost.body.journalEntryId)
            )
          )
        expect(postLineTotals).toEqual({
          debit: 110_000,
          credit: 110_000,
          count: 2,
        })

        const firstReverse = await request(app.getHttpServer())
          .post(reverseRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', ' cash-workflow-reverse-1 ')
          .send(reverseCommand)
          .expect(200)
        expect(firstReverse.body).toEqual({
          cashTransactionId: fixtureA.cashTransactionId,
          tenantId: fixtureA.tenantId,
          status: 'reversed',
          reversalJournalEntryId: expect.any(String),
          reversalJournalEntryNumber: 'JE-2026-000003',
        })

        const reverseReplay = await request(app.getHttpServer())
          .post(reverseRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cash-workflow-reverse-1')
          .send(reverseCommand)
          .expect(200)
        expect(reverseReplay.body).toEqual(firstReverse.body)

        await request(app.getHttpServer())
          .post(reverseRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cash-workflow-reverse-1')
          .send({ ...reverseCommand, reason: 'Different reason' })
          .expect(409)

        await request(app.getHttpServer())
          .post(reverseRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cash-workflow-reverse-2')
          .send(reverseCommand)
          .expect(409)

        await request(app.getHttpServer())
          .post(reverseRoute)
          .set('Authorization', 'Bearer cash-workflow-http-viewer-a-token')
          .set('Idempotency-Key', 'reverse-viewer')
          .send(reverseCommand)
          .expect(403)

        await request(app.getHttpServer())
          .post(reverseRoute)
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'reverse-invalid')
          .send({ reason: 'x', postingDate: '2026-07-30' })
          .expect(400)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/cash-transactions/${fixtureB.cashTransactionId}/reverse`
          )
          .set('Authorization', 'Bearer cash-workflow-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant-reverse')
          .send(reverseCommand)
          .expect(404)

        const [reversedCash] = await transaction
          .select({
            status: cashTransactions.status,
            reversalJournalId: cashTransactions.reversal_journal_entry_id,
            reversalReason: cashTransactions.reversal_reason,
          })
          .from(cashTransactions)
          .where(
            and(
              eq(cashTransactions.tenant_id, fixtureA.tenantId),
              eq(cashTransactions.id, fixtureA.cashTransactionId)
            )
          )
          .limit(1)
        expect(reversedCash).toEqual({
          status: 'reversed',
          reversalJournalId: firstReverse.body.reversalJournalEntryId,
          reversalReason: 'Returned vendor payment',
        })

        const [reversalEntry] = await transaction
          .select({
            status: journalEntries.status,
            reversesEntryId: journalEntries.reverses_entry_id,
            entryNumber: journalEntries.entry_number,
          })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenant_id, fixtureA.tenantId),
              eq(journalEntries.id, firstReverse.body.reversalJournalEntryId)
            )
          )
          .limit(1)
        expect(reversalEntry).toEqual({
          status: 'posted',
          reversesEntryId: firstPost.body.journalEntryId,
          entryNumber: 'JE-2026-000003',
        })

        const [reverseLineTotals] = await transaction
          .select({
            debit: sql<number>`coalesce(sum(${journalLines.debit_cents}), 0)::int`,
            credit: sql<number>`coalesce(sum(${journalLines.credit_cents}), 0)::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(journalLines)
          .where(
            and(
              eq(journalLines.tenant_id, fixtureA.tenantId),
              eq(journalLines.journal_entry_id, firstReverse.body.reversalJournalEntryId)
            )
          )
        expect(reverseLineTotals).toEqual({
          debit: 110_000,
          credit: 110_000,
          count: 2,
        })

        const requestRows = await transaction
          .select({
            action: cashTransactionWorkflowRequests.action,
            state: cashTransactionWorkflowRequests.state,
          })
          .from(cashTransactionWorkflowRequests)
          .where(
            and(
              eq(
                cashTransactionWorkflowRequests.tenant_id,
                fixtureA.tenantId
              ),
              eq(
                cashTransactionWorkflowRequests.cash_transaction_id,
                fixtureA.cashTransactionId
              )
            )
          )
        expect(requestRows).toEqual(
          expect.arrayContaining([
            { action: 'post', state: 'succeeded' },
            { action: 'reverse', state: 'succeeded' },
          ])
        )

        const auditRows = await transaction
          .select({ action: auditLog.action, diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_type, 'cash_transaction'),
              eq(auditLog.entity_id, fixtureA.cashTransactionId)
            )
          )
        expect(
          auditRows.some((row) => {
            const diff = row.diff as Record<string, unknown> | null
            return (
              row.action === 'status_change' &&
              diff?.from === 'posted' &&
              diff?.to === 'reversed'
            )
          })
        ).toBe(true)

        const [tenantBRequestCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(cashTransactionWorkflowRequests)
          .where(eq(cashTransactionWorkflowRequests.tenant_id, fixtureB.tenantId))
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
  }, 90_000)
})
