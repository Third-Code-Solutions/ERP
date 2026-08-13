import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { db, type Database } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { SupplierBillPostService } from '../src/finance/supplier-bill-post.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')
type Rows = Array<Record<string, unknown>>

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

async function rows(
  transaction: DatabaseTransaction,
  query: ReturnType<typeof sql>
): Promise<Rows> {
  return (await transaction.execute(query)) as unknown as Rows
}

async function seedFixture(transaction: DatabaseTransaction) {
  const tenantId = randomUUID()
  const actorId = randomUUID()
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
  const suffix = randomUUID().slice(0, 12)

  await transaction.execute(sql`
    insert into public.tenants (id, name, slug)
    values (${tenantId}::uuid, ${`Supplier bill post ${suffix}`}, ${`supplier-bill-post-${suffix}`})
  `)
  await transaction.execute(sql`
    insert into public.users (id, tenant_id, email, full_name, role)
    values
      (${actorId}::uuid, ${tenantId}::uuid, ${`finance-${suffix}@integration.test`}, 'Supplier Bill Finance', 'finance'),
      (${viewerId}::uuid, ${tenantId}::uuid, ${`viewer-${suffix}@integration.test`}, 'Supplier Bill Viewer', 'viewer')
  `)
  await transaction.execute(sql`
    insert into public.projects (id, tenant_id, name, client, created_by)
    values (${projectId}::uuid, ${tenantId}::uuid, 'Supplier Bill Project', ${`Owner ${suffix}`}, ${actorId}::uuid)
  `)
  await transaction.execute(sql`
    insert into public.vendors (id, tenant_id, name)
    values (${vendorId}::uuid, ${tenantId}::uuid, ${`Vendor ${suffix}`})
  `)
  await transaction.execute(sql`
    insert into public.cost_codes (id, tenant_id, code, name, category, created_by)
    values (${costCodeId}::uuid, ${tenantId}::uuid, ${`MAT-${suffix}`}, 'Project materials', 'material', ${actorId}::uuid)
  `)
  await transaction.execute(sql`
    insert into public.purchase_orders (
      id, tenant_id, project_id, vendor_id, created_by, po_number, status,
      subtotal_cents, vat_cents, withholding_tax_cents, total_cents
    )
    values (
      ${purchaseOrderId}::uuid, ${tenantId}::uuid, ${projectId}::uuid, ${vendorId}::uuid,
      ${actorId}::uuid, ${`PO-${suffix}`}, 'issued', 100000, 12000, 2000, 110000
    )
  `)
  await transaction.execute(sql`
    insert into public.po_line_items (
      id, tenant_id, po_id, sort_order, description, cost_code_id,
      quantity, quantity_micros, unit_cost_cents, line_total_cents
    )
    values (
      ${purchaseOrderLineId}::uuid, ${tenantId}::uuid, ${purchaseOrderId}::uuid,
      1, 'Project materials', ${costCodeId}::uuid, 1, 1000000, 100000, 100000
    )
  `)
  await transaction.execute(sql`
    insert into public.fiscal_periods (
      tenant_id, name, starts_on, ends_on, created_by
    )
    values (${tenantId}::uuid, 'FY 2026', '2026-01-01', '2026-12-31', ${actorId}::uuid)
  `)
  await transaction.execute(sql`
    insert into public.ledger_accounts (
      id, tenant_id, code, name, account_type, normal_balance, system_key, created_by
    )
    values
      (${payableAccountId}::uuid, ${tenantId}::uuid, '2000', 'Accounts payable', 'liability', 'credit', 'accounts_payable', ${actorId}::uuid),
      (${vatAccountId}::uuid, ${tenantId}::uuid, '1130', 'Input VAT receivable', 'asset', 'debit', 'input_vat_receivable', ${actorId}::uuid),
      (${withholdingAccountId}::uuid, ${tenantId}::uuid, '2110', 'Withholding tax payable', 'liability', 'credit', 'withholding_tax_payable', ${actorId}::uuid),
      (${allocationAccountId}::uuid, ${tenantId}::uuid, '6100', 'Project materials', 'expense', 'debit', null, ${actorId}::uuid)
  `)
  await transaction.execute(sql`
    insert into public.supplier_bills (
      id, tenant_id, purchase_order_id, project_id, vendor_id, vendor_bill_number,
      bill_date, due_date, subtotal_cents, input_vat_cents, withholding_tax_cents,
      total_payable_cents, created_by
    )
    values (
      ${billId}::uuid, ${tenantId}::uuid, ${purchaseOrderId}::uuid, ${projectId}::uuid,
      ${vendorId}::uuid, ${`SI-${suffix}`}, '2026-07-20', '2026-08-20',
      100000, 12000, 2000, 110000, ${actorId}::uuid
    )
  `)
  await transaction.execute(sql`
    insert into public.supplier_bill_lines (
      tenant_id, supplier_bill_id, ledger_account_id, project_id, po_line_item_id,
      cost_code_id, line_number, description, amount_cents
    )
    values (
      ${tenantId}::uuid, ${billId}::uuid, ${allocationAccountId}::uuid, ${projectId}::uuid,
      ${purchaseOrderLineId}::uuid, ${costCodeId}::uuid, 1, 'Project materials', 100000
    )
  `)

  return {
    tenantId,
    actorId,
    viewerId,
    billId,
    actorEmail: `finance-${suffix}@integration.test`,
    viewerEmail: `viewer-${suffix}@integration.test`,
  }
}

suite('Supplier Bill post database integration', () => {
  it('commits once, replays safely, audits, and denies a viewer', async () => {
    try {
      await db.transaction(async (transaction) => {
        const fixture = await seedFixture(transaction)
        const service = new SupplierBillPostService(
          new ConfigService({
            ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED: true,
            ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS: [
              fixture.tenantId,
            ],
          }),
          transactionBoundDatabase(transaction),
          new AuditService()
        )
        const principal: ErpPrincipal = {
          userId: fixture.actorId,
          tenantId: fixture.tenantId,
          role: 'finance',
          email: fixture.actorEmail,
        }
        const first = await service.post(
          fixture.billId,
          { postingDate: '2026-07-27' },
          principal,
          'supplier-bill-post-integration-1'
        )
        const replay = await service.post(
          fixture.billId,
          { postingDate: '2026-07-27' },
          principal,
          'supplier-bill-post-integration-1'
        )

        expect(first).toEqual(replay)
        expect(first).toMatchObject({
          supplierBillId: fixture.billId,
          tenantId: fixture.tenantId,
          status: 'posted',
        })

        const [bill] = await rows(
          transaction,
          sql`select status, internal_number, posting_journal_entry_id
              from public.supplier_bills
              where tenant_id = ${fixture.tenantId}::uuid
                and id = ${fixture.billId}::uuid`
        )
        const [request] = await rows(
          transaction,
          sql`select state, result
              from public.supplier_bill_post_requests
              where tenant_id = ${fixture.tenantId}::uuid
                and idempotency_key = 'supplier-bill-post-integration-1'`
        )
        const auditRows = await rows(
          transaction,
          sql`select action
              from public.audit_log
              where tenant_id = ${fixture.tenantId}::uuid
                and entity_type = 'supplier_bill'
                and entity_id = ${fixture.billId}::uuid`
        )

        expect(bill).toMatchObject({
          status: 'posted',
          internal_number: first.supplierBillNumber,
          posting_journal_entry_id: first.journalEntryId,
        })
        expect(request).toMatchObject({ state: 'succeeded', result: first })
        expect(auditRows.some((row) => row.action === 'status_change')).toBe(
          true
        )

        await expect(
          service.post(
            fixture.billId,
            { postingDate: '2026-07-27' },
            {
              userId: fixture.viewerId,
              tenantId: fixture.tenantId,
              role: 'viewer',
              email: fixture.viewerEmail,
            },
            'supplier-bill-post-viewer-1'
          )
        ).rejects.toThrow()
        throw ROLLBACK
      })
    } catch (error) {
      if (error !== ROLLBACK) throw error
    }
  })
})
