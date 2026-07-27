import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
} from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726233000_inventory_stock_schema.sql'
  ),
  'utf8'
).toLowerCase()
const workflowSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726234000_inventory_stock_foundation.sql'
  ),
  'utf8'
).toLowerCase()
const billMatchSchemaSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726235000_supplier_bill_receipt_match_schema.sql'
  ),
  'utf8'
).toLowerCase()
const billMatchSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726240000_supplier_bill_three_way_match.sql'
  ),
  'utf8'
).toLowerCase()
const billPostingSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726241000_supplier_bill_three_way_posting.sql'
  ),
  'utf8'
).toLowerCase()

describe('inventory stock ledger migration contract', () => {
  it('creates typed UOM, Warehouse, receipt, and stock evidence', () => {
    expect(schemaSql).toContain('create type public.stock_receipt_status')
    expect(schemaSql).toContain('create type public.stock_ledger_event_type')
    for (const table of [
      'units_of_measure',
      'warehouses',
      'stock_receipts',
      'stock_receipt_lines',
      'stock_ledger_entries',
    ]) {
      expect(schemaSql).toContain(`create table if not exists public.${table}`)
    }
  })

  it('uses integer micro-units and exact minor-unit valuation', () => {
    expect(schemaSql).toContain('quantity_micros bigint')
    expect(schemaSql).toContain('received_quantity_micros bigint')
    expect(schemaSql).toContain('quantity_delta_micros bigint not null')
    expect(schemaSql).toMatch(
      /quantity_micros::numeric \* unit_cost_cents::numeric \/ 1000000/
    )
    expect(workflowSql).not.toMatch(/\b(real|double precision)\b/)
  })

  it('protects every stock reference with tenant-safe composite keys', () => {
    for (const constraint of [
      'stock_receipts_warehouse_tenant_fk',
      'stock_receipts_purchase_order_tenant_fk',
      'stock_receipt_lines_receipt_tenant_fk',
      'stock_receipt_lines_po_line_tenant_fk',
      'stock_receipt_lines_material_tenant_fk',
      'stock_ledger_entries_receipt_tenant_fk',
      'stock_ledger_entries_warehouse_tenant_fk',
    ]) {
      expect(schemaSql).toContain(`constraint ${constraint}`)
    }
  })

  it('serializes PO-line posting and rejects over-receipt', () => {
    expect(workflowSql).toMatch(
      /from public\.po_line_items po_line[\s\S]*?order by po_line\.id[\s\S]*?for update/
    )
    expect(workflowSql).toContain(
      'stock receipt quantity exceeds remaining po quantity'
    )
    expect(schemaSql).toContain(
      'ux_stock_receipt_lines_receipt_po_line'
    )
  })

  it('posts Inventory and GRNI through the journal workflow', () => {
    expect(workflowSql).toContain(
      "account.system_key = 'inventory'"
    )
    expect(workflowSql).toContain(
      "account.system_key = 'goods_received_not_invoiced'"
    )
    expect(workflowSql).toContain(
      'from public.post_journal_entry(v_journal_id, p_actor_id)'
    )
    expect(workflowSql).toContain("'stock_receipt'")
  })

  it('uses equal-opposite reversal evidence instead of mutation', () => {
    expect(workflowSql).toContain(
      'create or replace function public.reverse_stock_receipt'
    )
    expect(workflowSql).toContain("'receipt_reversal'")
    expect(workflowSql).toContain('-line.quantity_micros')
    expect(workflowSql).toContain('-line.line_total_cents')
    expect(workflowSql).toContain(
      'stock ledger entries are append-only'
    )
  })

  it('blocks bypassing controlled stock journal reversal', () => {
    expect(workflowSql).toContain(
      'create or replace function public.guard_stock_journal_reversal'
    )
    expect(workflowSql).toContain(
      'use the stock receipt reversal workflow'
    )
  })

  it('separates procurement draft control from finance posting authority', () => {
    expect(workflowSql).toContain(
      "app_user.role::text in ('procurement', 'admin', 'owner')"
    )
    expect(workflowSql).toContain(
      "v_actor_role not in ('finance', 'admin', 'owner')"
    )
    expect(workflowSql).toMatch(
      /revoke execute on function public\.post_stock_receipt\(uuid, uuid, date\)[\s\S]*?from public, anon, authenticated/
    )
  })

  it('forces RLS, audits, and permissioned Cortex projection', () => {
    expect(workflowSql).toContain(
      'alter table public.stock_ledger_entries force row level security'
    )
    expect(workflowSql).toContain(
      'create policy stock_ledger_entries_inventory_read'
    )
    expect(workflowSql).toContain(
      'create trigger audit_stock_ledger_entries'
    )
    expect(workflowSql).toContain(
      'create or replace function public.cortex_mirror_inventory_record'
    )
    for (const nodeType of [
      'warehouse',
      'stock_receipt',
      'stock_ledger_entry',
    ]) {
      expect(schemaSql).toContain(`add value if not exists '${nodeType}'`)
    }
  })
})

describe('supplier bill three-way match contract', () => {
  it('links bill lines to tenant-safe PO and Stock Receipt evidence', () => {
    expect(billMatchSchemaSql).toContain(
      'supplier_bill_lines_po_line_tenant_fk'
    )
    expect(billMatchSchemaSql).toContain(
      'supplier_bill_lines_receipt_line_tenant_fk'
    )
    expect(billMatchSchemaSql).toContain(
      'supplier_bill_lines_receipt_match_complete'
    )
  })

  it('requires active posted receipt evidence and exact GRNI value', () => {
    expect(billMatchSql).toContain(
      'inventory bill line requires active posted stock receipt evidence'
    )
    expect(billMatchSql).toContain(
      'supplier bill amount exceeds stock receipt rounding tolerance'
    )
    expect(billMatchSql).toContain(
      "v_account_system_key is distinct from 'goods_received_not_invoiced'"
    )
    expect(billMatchSql).toContain(
      'supplier bill exceeds unmatched stock receipt evidence'
    )
  })

  it('locks PO, receipt line, and receipt before the posted transition', () => {
    expect(billMatchSql).toMatch(
      /from public\.po_line_items po_line[\s\S]*?for update/
    )
    expect(billMatchSql).toMatch(
      /from public\.stock_receipt_lines receipt_line[\s\S]*?for update/
    )
    expect(billMatchSql).toMatch(
      /from public\.stock_receipts receipt[\s\S]*?for update/
    )
  })

  it('posts receipt matches as GRNI debits and keeps RPC authority narrow', () => {
    expect(billPostingSql).toMatch(
      /account\.system_key is distinct from\s+'goods_received_not_invoiced'/
    )
    expect(billPostingSql).toContain(
      'from public.post_journal_entry(v_journal_id, p_actor_id)'
    )
    expect(billPostingSql).toMatch(
      /revoke execute on function public\.post_supplier_bill\(uuid, uuid, date\)[\s\S]*?from public, anon, authenticated/
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_INVENTORY_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface InventoryFixture {
  tenantId: string
  financeId: string
  procurementId: string
  viewerId: string
  projectId: string
  vendorId: string
  purchaseOrderId: string
  poLineId: string
  costCodeId: string
  warehouseId: string
  receiptId: string
  receiptLineId: string
}

async function seedInventoryFixture(
  tx: postgres.TransactionSql,
  options: { receiptMicros?: number } = {}
): Promise<InventoryFixture> {
  const receiptMicros = options.receiptMicros ?? 4_000_000
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Inventory probe', 'inventory-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const users = (await tx.unsafe(
    `insert into users(id, tenant_id, email, full_name, role)
     values
       (
         gen_random_uuid(), '${tenantId}',
         'finance-${suffix}@probe.test', 'Finance Probe', 'finance'
       ),
       (
         gen_random_uuid(), '${tenantId}',
         'procurement-${suffix}@probe.test', 'Procurement Probe', 'procurement'
       ),
       (
         gen_random_uuid(), '${tenantId}',
         'viewer-${suffix}@probe.test', 'Viewer Probe', 'viewer'
       )
     returning id, role`
  )) as Rows
  const financeId = users.find((row) => row.role === 'finance')!.id as string
  const procurementId = users.find(
    (row) => row.role === 'procurement'
  )!.id as string
  const viewerId = users.find((row) => row.role === 'viewer')!.id as string
  const projectId = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client, created_by)
       values(
         '${tenantId}', 'Inventory project', 'Owner ${suffix}', '${financeId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const vendorId = (
    (await tx.unsafe(
      `insert into vendors(tenant_id, name)
       values('${tenantId}', 'Stock Vendor ${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string

  await tx.unsafe(
    `insert into fiscal_periods(
       tenant_id, name, starts_on, ends_on, created_by
     )
     values(
       '${tenantId}', 'FY 2026', '2026-01-01', '2026-12-31', '${financeId}'
     )`
  )
  await tx.unsafe(
    `insert into ledger_accounts(
       tenant_id, code, name, account_type, normal_balance, system_key, created_by
     )
     values
       (
         '${tenantId}', '1200', 'Inventory',
         'asset', 'debit', 'inventory', '${financeId}'
       ),
       (
         '${tenantId}', '2010', 'Goods received, not invoiced',
         'liability', 'credit', 'goods_received_not_invoiced', '${financeId}'
       ),
       (
         '${tenantId}', '2000', 'Accounts payable',
         'liability', 'credit', 'accounts_payable', '${financeId}'
       )`
  )
  const uomId = (
    (await tx.unsafe(
      `insert into units_of_measure(
         tenant_id, code, name, decimal_places, created_by
       )
       values('${tenantId}', 'PCS', 'Pieces', 0, '${procurementId}')
       returning id`
    )) as Rows
  )[0]!.id as string
  const itemId = (
    (await tx.unsafe(
      `insert into material_items(
         tenant_id,
         code,
         description,
         unit,
         base_uom_id,
         inventory_tracked,
         created_by
       )
       values(
         '${tenantId}',
         'MAT-${suffix}',
         'Tracked material',
         'PCS',
         '${uomId}',
         true,
         '${procurementId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const costCodeId = (
    (await tx.unsafe(
      `insert into cost_codes(
         tenant_id, code, name, category, created_by
       )
       values(
         '${tenantId}', 'MAT-${suffix}', 'Tracked materials', 'material',
         '${procurementId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const purchaseOrderId = (
    (await tx.unsafe(
      `insert into purchase_orders(
         tenant_id,
         project_id,
         vendor_id,
         created_by,
         po_number,
         status,
         subtotal_cents,
         total_cents
       )
       values(
         '${tenantId}',
         '${projectId}',
         '${vendorId}',
         '${procurementId}',
         'PO-${suffix}',
         'issued',
         100000,
         100000
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const poLineId = (
    (await tx.unsafe(
      `insert into po_line_items(
         tenant_id,
         po_id,
         sort_order,
         code,
         description,
         unit,
         material_item_id,
         cost_code_id,
         uom_id,
         quantity,
         quantity_micros,
         unit_cost_cents,
         line_total_cents
       )
       values(
         '${tenantId}',
         '${purchaseOrderId}',
         1,
         'MAT-${suffix}',
         'Tracked material',
         'PCS',
         '${itemId}',
         '${costCodeId}',
         '${uomId}',
         10,
         10000000,
         10000,
         100000
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const warehouseId = (
    (await tx.unsafe(
      `insert into warehouses(
         tenant_id, code, name, project_id, created_by
       )
       values(
         '${tenantId}', 'MAIN', 'Main Warehouse', null, '${procurementId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const receiptId = (
    (await tx.unsafe(
      `insert into stock_receipts(
         tenant_id,
         warehouse_id,
         purchase_order_id,
         supplier_delivery_reference,
         received_date,
         created_by
       )
       values(
         '${tenantId}',
         '${warehouseId}',
         '${purchaseOrderId}',
         'DR-${suffix}',
         '2026-07-27',
         '${procurementId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string

  const receiptLineId = (
    (await tx.unsafe(
    `insert into stock_receipt_lines(
       tenant_id,
       stock_receipt_id,
       po_line_item_id,
       material_item_id,
       uom_id,
       line_number,
       description,
       quantity_micros,
       unit_cost_cents,
       line_total_cents
     )
     values(
       '${tenantId}',
       '${receiptId}',
       '${poLineId}',
       '${itemId}',
       '${uomId}',
       1,
       'Tracked material',
       ${receiptMicros},
       10000,
       ${Math.round((receiptMicros * 10_000) / 1_000_000)}
     )
     returning id`
    )) as Rows
  )[0]!.id as string

  return {
    tenantId,
    financeId,
    procurementId,
    viewerId,
    projectId,
    vendorId,
    purchaseOrderId,
    poLineId,
    costCodeId,
    warehouseId,
    receiptId,
    receiptLineId,
  }
}

async function createMatchedSupplierBill(
  tx: postgres.TransactionSql,
  fixture: InventoryFixture,
  quantityMicros: number,
  vendorBillNumber: string
): Promise<string> {
  const amountCents = Math.round(
    (quantityMicros * 10_000) / 1_000_000
  )
  const grniId = (
    (await tx.unsafe(
      `select id from ledger_accounts
       where tenant_id = '${fixture.tenantId}'
         and system_key = 'goods_received_not_invoiced'`
    )) as Rows
  )[0]!.id as string
  const billId = (
    (await tx.unsafe(
      `insert into supplier_bills(
         tenant_id,
         purchase_order_id,
         project_id,
         vendor_id,
         vendor_bill_number,
         bill_date,
         subtotal_cents,
         input_vat_cents,
         withholding_tax_cents,
         total_payable_cents,
         created_by
       )
       values(
         '${fixture.tenantId}',
         '${fixture.purchaseOrderId}',
         '${fixture.projectId}',
         '${fixture.vendorId}',
         '${vendorBillNumber}',
         '2026-07-27',
         ${amountCents},
         0,
         0,
         ${amountCents},
         '${fixture.financeId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string

  await tx.unsafe(
    `insert into supplier_bill_lines(
       tenant_id,
       supplier_bill_id,
       ledger_account_id,
       project_id,
       po_line_item_id,
       stock_receipt_line_id,
       quantity_micros,
       line_number,
       description,
       amount_cents
     )
     values(
       '${fixture.tenantId}',
       '${billId}',
       '${grniId}',
       '${fixture.projectId}',
       '${fixture.poLineId}',
       '${fixture.receiptLineId}',
       ${quantityMicros},
       1,
       'Matched received inventory',
       ${amountCents}
     )`
  )
  return billId
}

runtimeSuite('inventory stock ledger runtime proof', () => {
  let sqlClient: postgres.Sql

  beforeAll(() => {
    sqlClient = makeSql()
  })

  afterAll(async () => {
    await sqlClient?.end({ timeout: 5 })
  })

  it('posts balanced journal and exact perpetual stock', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedInventoryFixture(tx)
      const posted = (await tx.unsafe(
        `select * from post_stock_receipt(
          '${fixture.receiptId}', '${fixture.financeId}', '2026-07-27'
        )`
      )) as Rows
      const receipt = (await tx.unsafe(
        `select status, internal_number, posting_journal_entry_id
         from stock_receipts
         where id = '${fixture.receiptId}'`
      )) as Rows
      const journal = (await tx.unsafe(
        `select
           sum(debit_cents)::bigint as debit,
           sum(credit_cents)::bigint as credit,
           count(*)::integer as line_count
         from journal_lines
         where journal_entry_id = '${posted[0]!.journal_entry_id}'`
      )) as Rows
      const stock = (await tx.unsafe(
        `select
           sum(quantity_delta_micros)::bigint as quantity,
           sum(value_delta_cents)::bigint as value
         from stock_ledger_entries
         where stock_receipt_id = '${fixture.receiptId}'`
      )) as Rows
      const poLine = (await tx.unsafe(
        `select received_quantity_micros, received_qty
         from po_line_items where id = '${fixture.poLineId}'`
      )) as Rows
      return {
        posted: posted[0],
        receipt: receipt[0],
        journal: journal[0],
        stock: stock[0],
        poLine: poLine[0],
      }
    })

    expect(result.posted?.receipt_number).toMatch(/^SR-2026-\d{6}$/)
    expect(result.receipt).toMatchObject({
      status: 'posted',
      internal_number: result.posted?.receipt_number,
      posting_journal_entry_id: result.posted?.journal_entry_id,
    })
    expect(result.journal).toEqual({
      debit: '40000',
      credit: '40000',
      line_count: 2,
    })
    expect(result.stock).toEqual({
      quantity: '4000000',
      value: '40000',
    })
    expect(result.poLine).toMatchObject({
      received_quantity_micros: '4000000',
      received_qty: 4,
    })
  })

  it('rejects cumulative quantity above the ordered PO line', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const first = await seedInventoryFixture(tx, {
        receiptMicros: 7_000_000,
      })
      await tx.unsafe(
        `select * from post_stock_receipt(
          '${first.receiptId}', '${first.financeId}', '2026-07-27'
        )`
      )
      const secondReceiptId = (
        (await tx.unsafe(
          `insert into stock_receipts(
             tenant_id,
             warehouse_id,
             purchase_order_id,
             received_date,
             created_by
           )
           values(
             '${first.tenantId}',
             '${first.warehouseId}',
             '${first.purchaseOrderId}',
             '2026-07-28',
             '${first.procurementId}'
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      const source = (await tx.unsafe(
        `select material_item_id, uom_id
         from po_line_items where id = '${first.poLineId}'`
      )) as Rows
      await tx.unsafe(
        `insert into stock_receipt_lines(
           tenant_id,
           stock_receipt_id,
           po_line_item_id,
           material_item_id,
           uom_id,
           line_number,
           description,
           quantity_micros,
           unit_cost_cents,
           line_total_cents
         )
         values(
           '${first.tenantId}',
           '${secondReceiptId}',
           '${first.poLineId}',
           '${source[0]!.material_item_id}',
           '${source[0]!.uom_id}',
           1,
           'Excess receipt',
           4000000,
           10000,
           40000
         )`
      )
      try {
        await tx.unsafe(
          `select * from post_stock_receipt(
            '${secondReceiptId}', '${first.financeId}', '2026-07-28'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects generic journal reversal bypass', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedInventoryFixture(tx)
      const posted = (await tx.unsafe(
        `select * from post_stock_receipt(
          '${fixture.receiptId}', '${fixture.financeId}', '2026-07-27'
        )`
      )) as Rows
      try {
        await tx.unsafe(
          `select * from reverse_journal_entry(
            '${posted[0]!.journal_entry_id}',
            '${fixture.financeId}',
            'Bypass attempt',
            '2026-07-28'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('reverses with equal-opposite stock and journal evidence', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedInventoryFixture(tx)
      await tx.unsafe(
        `select * from post_stock_receipt(
          '${fixture.receiptId}', '${fixture.financeId}', '2026-07-27'
        )`
      )
      const reversed = (await tx.unsafe(
        `select * from reverse_stock_receipt(
          '${fixture.receiptId}',
          '${fixture.financeId}',
          'Supplier delivery rejected after review',
          '2026-07-28'
        )`
      )) as Rows
      const receipt = (await tx.unsafe(
        `select status, reversal_journal_entry_id, reversal_reason
         from stock_receipts where id = '${fixture.receiptId}'`
      )) as Rows
      const stock = (await tx.unsafe(
        `select
           sum(quantity_delta_micros)::bigint as quantity,
           sum(value_delta_cents)::bigint as value,
           count(*)::integer as entries
         from stock_ledger_entries
         where stock_receipt_id = '${fixture.receiptId}'`
      )) as Rows
      const poLine = (await tx.unsafe(
        `select received_quantity_micros, received_qty
         from po_line_items where id = '${fixture.poLineId}'`
      )) as Rows
      return {
        reversed: reversed[0],
        receipt: receipt[0],
        stock: stock[0],
        poLine: poLine[0],
      }
    })
    expect(result.reversed?.reversal_journal_entry_number).toMatch(
      /^JE-2026-\d{6}$/
    )
    expect(result.receipt).toMatchObject({
      status: 'reversed',
      reversal_journal_entry_id:
        result.reversed?.reversal_journal_entry_id,
      reversal_reason: 'Supplier delivery rejected after review',
    })
    expect(result.stock).toEqual({
      quantity: '0',
      value: '0',
      entries: 2,
    })
    expect(result.poLine).toMatchObject({
      received_quantity_micros: '0',
      received_qty: 0,
    })
  })

  it('clears GRNI into Accounts Payable from receipt-linked bill evidence', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedInventoryFixture(tx)
      await tx.unsafe(
        `select * from post_stock_receipt(
          '${fixture.receiptId}', '${fixture.financeId}', '2026-07-27'
        )`
      )
      const billId = await createMatchedSupplierBill(
        tx,
        fixture,
        4_000_000,
        `SI-${fixture.receiptId.slice(0, 8)}`
      )
      const posted = (await tx.unsafe(
        `select * from post_supplier_bill(
          '${billId}', '${fixture.financeId}', '2026-07-27'
        )`
      )) as Rows
      const journals = (await tx.unsafe(
        `select
           account.system_key,
           sum(line.debit_cents)::bigint as debit,
           sum(line.credit_cents)::bigint as credit
         from journal_lines line
         join ledger_accounts account
           on account.id = line.ledger_account_id
          and account.tenant_id = line.tenant_id
         where line.journal_entry_id =
           '${posted[0]!.journal_entry_id}'
         group by account.system_key
         order by account.system_key`
      )) as Rows
      const billLine = (
        (await tx.unsafe(
          `select cost_code_id
           from supplier_bill_lines
           where supplier_bill_id = '${billId}'`
        )) as Rows
      )[0]!
      return { journals, billCostCodeId: billLine.cost_code_id }
    })

    expect(result.journals).toEqual([
      {
        system_key: 'accounts_payable',
        debit: '0',
        credit: '40000',
      },
      {
        system_key: 'goods_received_not_invoiced',
        debit: '40000',
        credit: '0',
      },
    ])
    expect(result.billCostCodeId).toBeTruthy()
  })

  it('rejects cumulative Supplier Bill quantity above receipt evidence', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedInventoryFixture(tx)
      await tx.unsafe(
        `select * from post_stock_receipt(
          '${fixture.receiptId}', '${fixture.financeId}', '2026-07-27'
        )`
      )
      const firstBillId = await createMatchedSupplierBill(
        tx,
        fixture,
        3_000_000,
        `SI-A-${fixture.receiptId.slice(0, 8)}`
      )
      await tx.unsafe(
        `select * from post_supplier_bill(
          '${firstBillId}', '${fixture.financeId}', '2026-07-27'
        )`
      )
      const secondBillId = await createMatchedSupplierBill(
        tx,
        fixture,
        2_000_000,
        `SI-B-${fixture.receiptId.slice(0, 8)}`
      )
      try {
        await tx.unsafe(
          `select * from post_supplier_bill(
            '${secondBillId}', '${fixture.financeId}', '2026-07-27'
          )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects cross-tenant Warehouse references', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedInventoryFixture(tx)
      const otherTenant = (
        (await tx.unsafe(
          `insert into tenants(name, slug)
           values('Other inventory', 'other-' || substr(md5(random()::text),1,8))
           returning id`
        )) as Rows
      )[0]!.id as string
      const otherUser = (
        (await tx.unsafe(
          `insert into users(id, tenant_id, email, full_name, role)
           values(
             gen_random_uuid(),
             '${otherTenant}',
             'other-' || substr(md5(random()::text),1,8) || '@probe.test',
             'Other User',
             'admin'
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      const otherWarehouse = (
        (await tx.unsafe(
          `insert into warehouses(tenant_id, code, name, created_by)
           values('${otherTenant}', 'OTHER', 'Other Warehouse', '${otherUser}')
           returning id`
        )) as Rows
      )[0]!.id as string
      try {
        await tx.unsafe(
          `update stock_receipts
           set warehouse_id = '${otherWarehouse}'
           where id = '${fixture.receiptId}'`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('hides inventory records from Viewer RLS', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedInventoryFixture(tx)
      await becomeAuthenticated(tx, fixture.viewerId)
      return (await tx.unsafe(
        `select count(*)::integer as count
         from stock_receipts
         where tenant_id = '${fixture.tenantId}'`
      )) as Rows
    })
    expect(visible[0]?.count).toBe(0)
  })
})
