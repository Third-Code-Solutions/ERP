import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  db,
  journalEntries,
  journalLines,
  supplierBills,
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
import { SupplierBillPostController } from '../src/finance/supplier-bill-post.controller'
import { SupplierBillPostService } from '../src/finance/supplier-bill-post.service'

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

async function seedSupplierBill(
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
  const allocationAccountId = randomUUID()
  const payableAccountId = randomUUID()
  const vatAccountId = randomUUID()
  const withholdingAccountId = randomUUID()
  const billId = randomUUID()

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (
      ${tenantId}::uuid,
      ${`Supplier bill post HTTP ${label} ${suffix}`},
      ${`supplier-bill-post-http-${label}-${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (
        ${financeId}::uuid,
        ${tenantId}::uuid,
        ${`supplier-bill-post-http-finance-${label}-${suffix}@integration.test`},
        'Supplier Bill HTTP Finance',
        'finance'
      ),
      (
        ${viewerId}::uuid,
        ${tenantId}::uuid,
        ${`supplier-bill-post-http-viewer-${label}-${suffix}@integration.test`},
        'Supplier Bill HTTP Viewer',
        'viewer'
      )
  `)
  await transaction.execute(sql`
    insert into public.projects (id, tenant_id, name, client, created_by)
    values (
      ${projectId}::uuid,
      ${tenantId}::uuid,
      ${`Supplier Bill HTTP Project ${label}`},
      'Supplier Bill HTTP Client',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.vendors (id, tenant_id, name)
    values (
      ${vendorId}::uuid,
      ${tenantId}::uuid,
      ${`Supplier Bill HTTP Vendor ${label} ${suffix}`}
    )
  `)
  await transaction.execute(sql`
    insert into public.cost_codes (id, tenant_id, code, name, category, created_by)
    values (
      ${costCodeId}::uuid,
      ${tenantId}::uuid,
      ${`MAT-${label}-${suffix}`},
      'Supplier Bill HTTP materials',
      'material',
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
      ${`PO-${label}-${suffix}`},
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
      'Supplier Bill HTTP materials',
      ${costCodeId}::uuid,
      1,
      1000000,
      100000,
      100000
    )
  `)
  await transaction.execute(sql`
    insert into public.fiscal_periods (
      tenant_id, name, starts_on, ends_on, created_by
    )
    values (
      ${tenantId}::uuid,
      ${`FY 2026 supplier bill post ${label}`},
      '2026-01-01',
      '2026-12-31',
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.ledger_accounts (
      id, tenant_id, code, name, account_type, normal_balance, system_key, created_by
    )
    values
      (
        ${payableAccountId}::uuid,
        ${tenantId}::uuid,
        '2000',
        'Accounts payable',
        'liability',
        'credit',
        'accounts_payable',
        ${financeId}::uuid
      ),
      (
        ${vatAccountId}::uuid,
        ${tenantId}::uuid,
        '1130',
        'Input VAT receivable',
        'asset',
        'debit',
        'input_vat_receivable',
        ${financeId}::uuid
      ),
      (
        ${withholdingAccountId}::uuid,
        ${tenantId}::uuid,
        '2110',
        'Withholding tax payable',
        'liability',
        'credit',
        'withholding_tax_payable',
        ${financeId}::uuid
      ),
      (
        ${allocationAccountId}::uuid,
        ${tenantId}::uuid,
        '6100',
        'Supplier Bill HTTP materials',
        'expense',
        'debit',
        null,
        ${financeId}::uuid
      )
  `)
  await transaction.execute(sql`
    insert into public.supplier_bills (
      id, tenant_id, purchase_order_id, project_id, vendor_id, vendor_bill_number,
      bill_date, due_date, subtotal_cents, input_vat_cents, withholding_tax_cents,
      total_payable_cents, created_by
    )
    values (
      ${billId}::uuid,
      ${tenantId}::uuid,
      ${purchaseOrderId}::uuid,
      ${projectId}::uuid,
      ${vendorId}::uuid,
      ${`SI-${label}-${suffix}`},
      '2026-07-20',
      '2026-08-20',
      100000,
      12000,
      2000,
      110000,
      ${financeId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.supplier_bill_lines (
      tenant_id, supplier_bill_id, ledger_account_id, project_id, po_line_item_id,
      cost_code_id, line_number, description, amount_cents
    )
    values (
      ${tenantId}::uuid,
      ${billId}::uuid,
      ${allocationAccountId}::uuid,
      ${projectId}::uuid,
      ${purchaseOrderLineId}::uuid,
      ${costCodeId}::uuid,
      1,
      'Supplier Bill HTTP materials',
      100000
    )
  `)

  return {
    tenantId,
    financeId,
    viewerId,
    billId,
    financeEmail: `supplier-bill-post-http-finance-${label}-${suffix}@integration.test`,
    viewerEmail: `supplier-bill-post-http-viewer-${label}-${suffix}@integration.test`,
  }
}

suite('Supplier Bill post protected HTTP canary', () => {
  it('proves auth, tenant scope, idempotency, balanced posting, audit, and rollback', async () => {
    const suffix = randomUUID().slice(0, 12)
    let observedTenantId = ''

    await alwaysRollback(async (transaction) => {
      const fixtureA = await seedSupplierBill(transaction, 'a', suffix)
      const fixtureB = await seedSupplierBill(transaction, 'b', suffix)
      observedTenantId = fixtureA.tenantId

      const identities = new Map([
        ['supplier-bill-post-http-finance-a-token', fixtureA.financeId],
        ['supplier-bill-post-http-viewer-a-token', fixtureA.viewerId],
        ['supplier-bill-post-http-finance-b-token', fixtureB.financeId],
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
          if (key === 'ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED') {
            return featureState.enabled
          }
          if (key === 'ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS') {
            return featureState.tenantIds
          }
          return fallback
        }),
      } as unknown as ConfigService

      const moduleRef = await Test.createTestingModule({
        controllers: [SupplierBillPostController],
        providers: [
          SupplierBillPostService,
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
        const route = `/v1/finance/supplier-bills/${fixtureA.billId}/post`
        const command = { postingDate: '2026-07-27' }

        await request(app.getHttpServer()).post(route).send(command).expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer unknown-token')
          .set('Idempotency-Key', 'unknown')
          .send(command)
          .expect(401)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', 'strict-body')
          .send({ ...command, tenantId: fixtureA.tenantId })
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .send(command)
          .expect(400)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-viewer-a-token')
          .set('Idempotency-Key', 'viewer-denied')
          .send(command)
          .expect(403)

        featureState.enabled = false
        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', 'disabled-write')
          .send(command)
          .expect(503)
        featureState.enabled = true

        await request(app.getHttpServer())
          .post(`/v1/finance/supplier-bills/${fixtureB.billId}/post`)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', 'cross-tenant')
          .send(command)
          .expect(404)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', 'invalid-date')
          .send({ postingDate: 'not-a-date' })
          .expect(400)

        const first = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', ' supplier-bill-post-http-1 ')
          .send(command)
          .expect(200)
        expect(first.body).toMatchObject({
          supplierBillId: fixtureA.billId,
          tenantId: fixtureA.tenantId,
          status: 'posted',
          supplierBillNumber: 'SB-2026-000001',
          journalEntryId: expect.any(String),
          journalEntryNumber: 'JE-2026-000001',
        })

        const replay = await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', 'supplier-bill-post-http-1')
          .send(command)
          .expect(200)
        expect(replay.body).toEqual(first.body)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', 'supplier-bill-post-http-1')
          .send({ postingDate: '2026-07-28' })
          .expect(409)

        await request(app.getHttpServer())
          .post(route)
          .set('Authorization', 'Bearer supplier-bill-post-http-finance-a-token')
          .set('Idempotency-Key', 'second-command')
          .send(command)
          .expect(409)

        const [bill] = await transaction
          .select({
            status: supplierBills.status,
            internalNumber: supplierBills.internal_number,
            postingJournalId: supplierBills.posting_journal_entry_id,
          })
          .from(supplierBills)
          .where(
            and(
              eq(supplierBills.tenant_id, fixtureA.tenantId),
              eq(supplierBills.id, fixtureA.billId)
            )
          )
          .limit(1)
        expect(bill).toEqual({
          status: 'posted',
          internalNumber: first.body.supplierBillNumber,
          postingJournalId: first.body.journalEntryId,
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
              eq(journalLines.journal_entry_id, first.body.journalEntryId)
            )
          )
        expect(lineTotals).toEqual({ debit: 112000, credit: 112000, count: 4 })

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
              eq(auditLog.entity_type, 'supplier_bill'),
              eq(auditLog.entity_id, fixtureA.billId)
            )
          )
          .limit(1)
        expect(auditEntry).toEqual({
          action: 'status_change',
          entityType: 'supplier_bill',
          entityId: fixtureA.billId,
        })

        const [tenantBJournalCount] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(journalEntries)
          .where(eq(journalEntries.tenant_id, fixtureB.tenantId))
        expect(tenantBJournalCount?.count).toBe(0)

        const [tenantBRequestCount] = await transaction.execute(sql`
          select count(*)::int as count
          from public.supplier_bill_post_requests
          where tenant_id = ${fixtureB.tenantId}::uuid
        `) as unknown as [{ count: number }]
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
