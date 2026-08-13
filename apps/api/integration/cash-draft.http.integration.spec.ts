import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  cashAccounts,
  cashAllocations,
  cashTransactionDraftRequests,
  cashTransactions,
  db,
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
import { CashDraftController } from '../src/finance/cash-draft.controller'
import { CashDraftService } from '../src/finance/cash-draft.service'

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

type DraftFixture = {
  tenantId: string
  financeId: string
  viewerId: string
  cashAccountId: string
  vendorId: string
  supplierBillId: string
  existingDraftId: string
}

async function seedDraftFixture(
  transaction: DatabaseTransaction,
  label: string,
  suffix: string
): Promise<DraftFixture> {
  const tenantId = randomUUID()
  const financeId = randomUUID()
  const viewerId = randomUUID()
  const projectId = randomUUID()
  const vendorId = randomUUID()
  const costCodeId = randomUUID()
  const purchaseOrderId = randomUUID()
  const purchaseOrderLineId = randomUUID()
  const supplierBillId = randomUUID()
  const cashLedgerId = randomUUID()
  const payableLedgerId = randomUUID()
  const inputVatLedgerId = randomUUID()
  const withholdingLedgerId = randomUUID()
  const expenseLedgerId = randomUUID()
  const cashAccountId = randomUUID()
  const existingDraftId = randomUUID()

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (
      ${tenantId}::uuid,
      ${`Cash draft HTTP tenant ${label}`},
      ${`cash-draft-http-${label}-${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (
        ${financeId}::uuid,
        ${tenantId}::uuid,
        ${`cash-draft-http-finance-${label}-${suffix}@integration.test`},
        'Cash draft HTTP Finance',
        'finance'
      ),
      (
        ${viewerId}::uuid,
        ${tenantId}::uuid,
        ${`cash-draft-http-viewer-${label}-${suffix}@integration.test`},
        'Cash draft HTTP Viewer',
        'viewer'
      )
  `)
  await transaction.execute(sql`
    insert into public.projects (id, tenant_id, name, client, created_by)
    values (
      ${projectId}::uuid,
      ${tenantId}::uuid,
      ${`Cash draft HTTP project ${label}`},
      'Cash draft HTTP client',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.vendors (id, tenant_id, name)
    values (
      ${vendorId}::uuid,
      ${tenantId}::uuid,
      ${`Cash draft HTTP vendor ${label} ${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.cost_codes (id, tenant_id, code, name, category, created_by)
    values (
      ${costCodeId}::uuid,
      ${tenantId}::uuid,
      ${`MAT-DRAFT-${label}-${suffix}`},
      'Cash draft HTTP materials',
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
      ${`FY 2026 cash draft ${label} ${suffix}`},
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
        ${`1000-DRAFT-${label}-${suffix}`},
        'Cash on hand',
        'asset',
        'debit',
        'cash',
        ${financeId}::uuid
      ),
      (
        ${payableLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`2000-DRAFT-${label}-${suffix}`},
        'Accounts payable',
        'liability',
        'credit',
        'accounts_payable',
        ${financeId}::uuid
      ),
      (
        ${inputVatLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`1130-DRAFT-${label}-${suffix}`},
        'Input VAT',
        'asset',
        'debit',
        'input_vat_receivable',
        ${financeId}::uuid
      ),
      (
        ${withholdingLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`2110-DRAFT-${label}-${suffix}`},
        'Withholding payable',
        'liability',
        'credit',
        'withholding_tax_payable',
        ${financeId}::uuid
      ),
      (
        ${expenseLedgerId}::uuid,
        ${tenantId}::uuid,
        ${`6100-DRAFT-${label}-${suffix}`},
        'Cash draft materials',
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
      ${`PO-DRAFT-${label}-${suffix}`},
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
      'Cash draft materials',
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
      ${supplierBillId}::uuid,
      ${tenantId}::uuid,
      ${purchaseOrderId}::uuid,
      ${projectId}::uuid,
      ${vendorId}::uuid,
      ${`SI-DRAFT-${label}-${suffix}`},
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
      ${supplierBillId}::uuid,
      ${expenseLedgerId}::uuid,
      ${projectId}::uuid,
      ${purchaseOrderLineId}::uuid,
      ${costCodeId}::uuid,
      1,
      'Cash draft materials',
      100000
    )
  `)
  await transaction.execute(sql`
    select * from public.post_supplier_bill(
      ${supplierBillId}::uuid,
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
      ${existingDraftId}::uuid,
      ${tenantId}::uuid,
      ${cashAccountId}::uuid,
      'disbursement',
      ${vendorId}::uuid,
      ${`EXISTING-DRAFT-${label}-${suffix}`},
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
      ${existingDraftId}::uuid,
      'supplier_bill',
      ${supplierBillId}::uuid,
      1,
      'Existing cross-tenant draft',
      110000
    )
  `)

  return {
    tenantId,
    financeId,
    viewerId,
    cashAccountId,
    vendorId,
    supplierBillId,
    existingDraftId,
  }
}

suite('Cash draft protected HTTP canary', () => {
  it('proves create/update/delete auth, tenant scope, idempotency, audit, and rollback', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedDraftFixture(transaction, 'a', suffix)
      const fixtureB = await seedDraftFixture(transaction, 'b', suffix)
      observedTenantId = fixtureA.tenantId
      const identities = new Map([
        ['cash-draft-http-finance-a-token', fixtureA.financeId],
        ['cash-draft-http-viewer-a-token', fixtureA.viewerId],
        ['cash-draft-http-finance-b-token', fixtureB.financeId],
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
          if (key === 'ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService
      const moduleRef = await Test.createTestingModule({
        controllers: [CashDraftController],
        providers: [
          CashDraftService,
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
        const firstBody = {
          cashAccountId: fixtureA.cashAccountId,
          direction: 'disbursement' as const,
          counterpartyId: fixtureA.vendorId,
          referenceNumber: `DRAFT-A-${suffix}`,
          transactionDate: '2026-07-28',
          notes: 'First cash draft',
          allocations: [
            {
              allocationType: 'supplier_bill' as const,
              targetId: fixtureA.supplierBillId,
              description: 'Supplier bill draft allocation',
              amountCents: 110000,
            },
          ],
        }
        const firstRoute = '/v1/finance/cash-transactions/drafts'

        await request(app.getHttpServer())
          .post(firstRoute)
          .send(firstBody)
          .expect(401)

        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'unknown')
          .send(firstBody)
          .expect(401)

        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...firstBody, tenantId: fixtureA.tenantId })
          .expect(400)

        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .send(firstBody)
          .expect(400)

        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(firstBody)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(firstBody)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant-create')
          .send({
            ...firstBody,
            cashAccountId: fixtureB.cashAccountId,
            counterpartyId: fixtureB.vendorId,
            allocations: [
              {
                ...firstBody.allocations[0],
                targetId: fixtureB.supplierBillId,
              },
            ],
          })
          .expect(409)

        const firstSave = await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', ' cash-draft-save-1 ')
          .send(firstBody)
          .expect(200)
        expect(firstSave.body).toEqual({
          cashTransactionId: expect.any(String),
          tenantId: fixtureA.tenantId,
          status: 'draft',
        })

        const firstDraftId = firstSave.body.cashTransactionId as string
        const firstReplay = await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cash-draft-save-1')
          .send(firstBody)
          .expect(200)
        expect(firstReplay.body).toEqual(firstSave.body)

        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cash-draft-save-1')
          .send({ ...firstBody, notes: 'Changed command' })
          .expect(409)

        const updateBody = {
          ...firstBody,
          transactionId: firstDraftId,
          referenceNumber: `DRAFT-A-UPDATED-${suffix}`,
          notes: 'Updated cash draft',
          allocations: [
            {
              ...firstBody.allocations[0],
              amountCents: 100000,
              description: 'Updated supplier bill allocation',
            },
          ],
        }
        const updated = await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', ' cash-draft-update-1 ')
          .send(updateBody)
          .expect(200)
        expect(updated.body).toEqual({
          cashTransactionId: firstDraftId,
          tenantId: fixtureA.tenantId,
          status: 'draft',
        })

        const updateReplay = await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cash-draft-update-1')
          .send(updateBody)
          .expect(200)
        expect(updateReplay.body).toEqual(updated.body)

        await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cash-draft-update-1')
          .send({ ...updateBody, notes: 'Different update' })
          .expect(409)

        await request(app.getHttpServer())
          .post(
            `/v1/finance/cash-transactions/${fixtureB.existingDraftId}/draft`
          )
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant-update')
          .send(updateBody)
          .expect(404)

        const secondBody = {
          ...firstBody,
          referenceNumber: `DRAFT-A-SECOND-${suffix}`,
          notes: 'Draft to delete',
        }
        const secondSave = await request(app.getHttpServer())
          .post(firstRoute)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cash-draft-save-2')
          .send(secondBody)
          .expect(200)
        const secondDraftId = secondSave.body.cashTransactionId as string

        await request(app.getHttpServer())
          .delete(`/v1/finance/cash-transactions/${firstDraftId}/draft`)
          .set('Authorization', 'Bearer cash-draft-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-delete')
          .send({})
          .expect(403)

        const deleted = await request(app.getHttpServer())
          .delete(`/v1/finance/cash-transactions/${secondDraftId}/draft`)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', ' cash-draft-delete-1 ')
          .send({})
          .expect(200)
        expect(deleted.body).toEqual({
          cashTransactionId: secondDraftId,
          tenantId: fixtureA.tenantId,
          status: 'deleted',
        })

        const deleteReplay = await request(app.getHttpServer())
          .delete(`/v1/finance/cash-transactions/${secondDraftId}/draft`)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cash-draft-delete-1')
          .send({})
          .expect(200)
        expect(deleteReplay.body).toEqual(deleted.body)

        await request(app.getHttpServer())
          .delete(`/v1/finance/cash-transactions/${fixtureB.existingDraftId}/draft`)
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant-delete')
          .send({})
          .expect(404)

        await request(app.getHttpServer())
          .delete('/v1/finance/cash-transactions/not-a-uuid/draft')
          .set('Authorization', 'Bearer cash-draft-http-finance-a-token')
          .set('Idempotency-Key', 'invalid-path')
          .send({})
          .expect(400)

        const [savedDraft] = await transaction
          .select({
            status: cashTransactions.status,
            referenceNumber: cashTransactions.reference_number,
            amountCents: cashTransactions.amount_cents,
            notes: cashTransactions.notes,
          })
          .from(cashTransactions)
          .where(
            and(
              eq(cashTransactions.tenant_id, fixtureA.tenantId),
              eq(cashTransactions.id, firstDraftId)
            )
          )
          .limit(1)
        expect(savedDraft).toEqual({
          status: 'draft',
          referenceNumber: `DRAFT-A-UPDATED-${suffix}`,
          amountCents: 100000,
          notes: 'Updated cash draft',
        })

        const savedAllocations = await transaction
          .select({
            allocationType: cashAllocations.allocation_type,
            supplierBillId: cashAllocations.supplier_bill_id,
            amountCents: cashAllocations.amount_cents,
          })
          .from(cashAllocations)
          .where(
            and(
              eq(cashAllocations.tenant_id, fixtureA.tenantId),
              eq(cashAllocations.cash_transaction_id, firstDraftId)
            )
          )
        expect(savedAllocations).toEqual([
          {
            allocationType: 'supplier_bill',
            supplierBillId: fixtureA.supplierBillId,
            amountCents: 100000,
          },
        ])

        const [deletedDraft] = await transaction
          .select({ id: cashTransactions.id })
          .from(cashTransactions)
          .where(
            and(
              eq(cashTransactions.tenant_id, fixtureA.tenantId),
              eq(cashTransactions.id, secondDraftId)
            )
          )
          .limit(1)
        expect(deletedDraft).toBeUndefined()

        const requestRows = await transaction
          .select({
            action: cashTransactionDraftRequests.action,
            state: cashTransactionDraftRequests.state,
            cashTransactionId: cashTransactionDraftRequests.cash_transaction_id,
          })
          .from(cashTransactionDraftRequests)
          .where(eq(cashTransactionDraftRequests.tenant_id, fixtureA.tenantId))
        expect(requestRows).toEqual(
          expect.arrayContaining([
            { action: 'save', state: 'succeeded', cashTransactionId: firstDraftId },
            { action: 'save', state: 'succeeded', cashTransactionId: firstDraftId },
            { action: 'save', state: 'succeeded', cashTransactionId: secondDraftId },
            { action: 'delete', state: 'succeeded', cashTransactionId: secondDraftId },
          ])
        )

        const auditRows = await transaction
          .select({ action: auditLog.action, diff: auditLog.diff })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.tenant_id, fixtureA.tenantId),
              eq(auditLog.entity_type, 'cash_transaction')
            )
          )
        expect(auditRows.some((row) => row.action === 'create')).toBe(true)
        expect(auditRows.some((row) => row.action === 'update')).toBe(true)
        expect(auditRows.some((row) => row.action === 'delete')).toBe(true)

        const [tenantBRequestCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(cashTransactionDraftRequests)
          .where(eq(cashTransactionDraftRequests.tenant_id, fixtureB.tenantId))
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
