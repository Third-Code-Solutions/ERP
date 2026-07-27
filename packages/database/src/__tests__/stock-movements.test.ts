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
    '../../../../supabase/migrations/20260726244000_stock_movement_schema.sql'
  ),
  'utf8'
).toLowerCase()
const controlSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260726245000_stock_movement_controls.sql'
  ),
  'utf8'
).toLowerCase()

describe('Stock Movement migration contract', () => {
  it('creates tenant-safe movement headers, lines, and ledger sources', () => {
    expect(schemaSql).toContain(
      'create table if not exists public.stock_movements'
    )
    expect(schemaSql).toContain(
      'create table if not exists public.stock_movement_lines'
    )
    for (const constraint of [
      'stock_movements_source_warehouse_tenant_fk',
      'stock_movements_target_warehouse_tenant_fk',
      'stock_movements_project_tenant_fk',
      'stock_movement_lines_movement_tenant_fk',
      'stock_movement_lines_material_tenant_fk',
      'stock_movement_lines_uom_tenant_fk',
      'stock_movement_lines_cost_code_tenant_fk',
      'stock_ledger_entries_single_source',
    ]) {
      expect(schemaSql).toContain(constraint)
    }
  })

  it('extends append-only events without overloading receipt evidence', () => {
    for (const event of [
      'transfer_out',
      'transfer_in',
      'consumption',
      'adjustment',
      'movement_reversal',
    ]) {
      expect(schemaSql).toContain(`add value if not exists '${event}'`)
    }
    expect(schemaSql).toContain('ux_stock_ledger_movement_reversal')
    expect(controlSql).toContain('stock ledger entries are append-only')
  })

  it('enforces movement-specific dimensions and valuation policy', () => {
    expect(controlSql).toContain(
      'transfer requires a different target warehouse'
    )
    expect(controlSql).toContain(
      'consumption requires one source warehouse and project'
    )
    expect(controlSql).toContain('consumption requires a cost code')
    expect(controlSql).toContain(
      'positive adjustment requires an evidenced unit cost'
    )
    expect(controlSql).toContain(
      'negative adjustment uses current weighted-average cost'
    )
  })

  it('serializes warehouse-item balances and blocks negative stock', () => {
    expect(controlSql).toContain('pg_advisory_xact_lock')
    expect(controlSql).toMatch(
      /sum\(entry\.quantity_delta_micros\)[\s\S]*?sum\(entry\.value_delta_cents\)/
    )
    expect(controlSql).toContain(
      'stock movement quantity exceeds available stock'
    )
    expect(controlSql).toContain(
      'stock movement reversal exceeds available stock'
    )
  })

  it('posts explicit consumption and adjustment control accounts', () => {
    expect(controlSql).toContain("system_key = 'inventory_consumption'")
    expect(controlSql).toContain(
      "system_key = 'inventory_adjustment_gain'"
    )
    expect(controlSql).toContain(
      "system_key = 'inventory_adjustment_loss'"
    )
    expect(controlSql).toContain(
      "reference_type = 'stock_movement'"
    )
  })

  it('binds reversal to original stock and journal evidence', () => {
    expect(controlSql).toContain(
      'movement reversal must negate original stock ledger evidence'
    )
    expect(controlSql).toContain(
      "pg_catalog.current_setting('app.stock_movement_reversal', true)"
    )
    expect(controlSql).toContain(
      'from public.reverse_journal_entry('
    )
  })

  it('forces RLS, audit, Cortex, and narrow function ACLs', () => {
    for (const table of ['stock_movements', 'stock_movement_lines']) {
      expect(controlSql).toContain(
        `alter table public.${table} force row level security`
      )
    }
    expect(controlSql).toContain('create trigger audit_stock_movements')
    expect(controlSql).toContain(
      'create trigger cortex_mirror_stock_movement'
    )
    expect(controlSql).toMatch(
      /revoke execute on function public\.post_stock_movement\(uuid, uuid\)[\s\S]*?from public, anon, authenticated/
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_STOCK_MOVEMENT_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface MovementFixture {
  tenantId: string
  financeId: string
  procurementId: string
  viewerId: string
  projectId: string
  itemId: string
  uomId: string
  costCodeId: string
  sourceWarehouseId: string
  targetWarehouseId: string
}

async function seedMovementFixture(
  tx: postgres.TransactionSql
): Promise<MovementFixture> {
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text), 1, 10) as suffix`
    )) as Rows
  )[0]!.suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Movement probe', 'movement-${suffix}')
       returning id`
    )) as Rows
  )[0]!.id as string

  async function user(role: string, label: string): Promise<string> {
    return (
      (await tx.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values(
           gen_random_uuid(),
           '${tenantId}',
           '${label}-${suffix}@probe.test',
           '${label}',
           '${role}'
         )
         returning id`
      )) as Rows
    )[0]!.id as string
  }
  const financeId = await user('finance', 'Finance')
  const procurementId = await user('procurement', 'Procurement')
  const viewerId = await user('viewer', 'Viewer')
  const projectId = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client, created_by)
       values(
         '${tenantId}', 'Movement project', 'Probe', '${financeId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `insert into fiscal_periods(
       tenant_id, name, starts_on, ends_on, created_by
     )
     values(
       '${tenantId}', 'FY 2026', '2026-01-01', '2026-12-31',
       '${financeId}'
     )`
  )
  await tx.unsafe(
    `insert into ledger_accounts(
       tenant_id, code, name, account_type, normal_balance, system_key,
       created_by
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
         '${tenantId}', '5100', 'Inventory consumption',
         'expense', 'debit', 'inventory_consumption', '${financeId}'
       ),
       (
         '${tenantId}', '4200', 'Inventory adjustment gain',
         'income', 'credit', 'inventory_adjustment_gain', '${financeId}'
       ),
       (
         '${tenantId}', '6100', 'Inventory adjustment loss',
         'expense', 'debit', 'inventory_adjustment_loss', '${financeId}'
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
         tenant_id, code, description, unit, base_uom_id,
         inventory_tracked, created_by
       )
       values(
         '${tenantId}', 'MOV-${suffix}', 'Movement Item', 'PCS',
         '${uomId}', true, '${procurementId}'
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
         '${tenantId}', 'MAT-${suffix}', 'Movement material',
         'material', '${procurementId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const warehouseRows = (await tx.unsafe(
    `insert into warehouses(tenant_id, code, name, created_by)
     values
       ('${tenantId}', 'SOURCE', 'Source Warehouse', '${procurementId}'),
       ('${tenantId}', 'TARGET', 'Target Warehouse', '${procurementId}')
     returning id, code`
  )) as Rows
  const sourceWarehouseId = warehouseRows.find(
    (row) => row.code === 'SOURCE'
  )!.id as string
  const targetWarehouseId = warehouseRows.find(
    (row) => row.code === 'TARGET'
  )!.id as string
  const vendorId = (
    (await tx.unsafe(
      `insert into vendors(tenant_id, name)
       values('${tenantId}', 'Movement Vendor')
       returning id`
    )) as Rows
  )[0]!.id as string
  const poId = (
    (await tx.unsafe(
      `insert into purchase_orders(
         tenant_id, project_id, vendor_id, created_by, po_number, status,
         subtotal_cents, total_cents
       )
       values(
         '${tenantId}', '${projectId}', '${vendorId}', '${procurementId}',
         'PO-${suffix}', 'issued', 100000, 100000
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const poLineId = (
    (await tx.unsafe(
      `insert into po_line_items(
         tenant_id, po_id, description, material_item_id, cost_code_id,
         uom_id, unit, quantity, quantity_micros, unit_cost_cents,
         line_total_cents
       )
       values(
         '${tenantId}', '${poId}', 'Movement Item', '${itemId}',
         '${costCodeId}', '${uomId}', 'PCS', 10, 10000000, 10000, 100000
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  const receiptId = (
    (await tx.unsafe(
      `insert into stock_receipts(
         tenant_id, warehouse_id, purchase_order_id, received_date,
         created_by
       )
       values(
         '${tenantId}', '${sourceWarehouseId}', '${poId}', '2026-07-27',
         '${procurementId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `insert into stock_receipt_lines(
       tenant_id, stock_receipt_id, po_line_item_id, material_item_id,
       uom_id, line_number, description, quantity_micros,
       unit_cost_cents, line_total_cents
     )
     values(
       '${tenantId}', '${receiptId}', '${poLineId}', '${itemId}',
       '${uomId}', 1, 'Opening movement stock', 10000000, 10000, 100000
     )`
  )
  await tx.unsafe(
    `select * from post_stock_receipt(
       '${receiptId}', '${financeId}', '2026-07-27'
     )`
  )

  return {
    tenantId,
    financeId,
    procurementId,
    viewerId,
    projectId,
    itemId,
    uomId,
    costCodeId,
    sourceWarehouseId,
    targetWarehouseId,
  }
}

async function createMovement(
  tx: postgres.TransactionSql,
  fixture: MovementFixture,
  type: 'transfer' | 'consumption' | 'adjustment',
  quantityMicros: number,
  declaredUnitCostCents?: number
): Promise<string> {
  const movementId = (
    (await tx.unsafe(
      `insert into stock_movements(
         tenant_id, movement_type, source_warehouse_id,
         target_warehouse_id, project_id, movement_date, reason, created_by
       )
       values(
         '${fixture.tenantId}',
         '${type}',
         '${fixture.sourceWarehouseId}',
         ${type === 'transfer' ? `'${fixture.targetWarehouseId}'` : 'null'},
         ${type === 'consumption' ? `'${fixture.projectId}'` : 'null'},
         '2026-07-27',
         'Runtime movement evidence',
         '${fixture.procurementId}'
       )
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `insert into stock_movement_lines(
       tenant_id, stock_movement_id, material_item_id, uom_id,
       cost_code_id, line_number, description, quantity_micros,
       declared_unit_cost_cents
     )
     values(
       '${fixture.tenantId}',
       '${movementId}',
       '${fixture.itemId}',
       '${fixture.uomId}',
       ${type === 'consumption' ? `'${fixture.costCodeId}'` : 'null'},
       1,
       'Runtime movement line',
       ${quantityMicros},
       ${declaredUnitCostCents ?? 'null'}
     )`
  )
  return movementId
}

runtimeSuite('Stock Movement runtime controls', () => {
  let sqlClient: postgres.Sql

  beforeAll(() => {
    sqlClient = makeSql()
  })

  afterAll(async () => {
    await sqlClient?.end({ timeout: 5 })
  })

  it('transfers equal quantity and value without a journal', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      const movementId = await createMovement(
        tx,
        fixture,
        'transfer',
        4_000_000
      )
      const posted = (await tx.unsafe(
        `select * from post_stock_movement(
           '${movementId}', '${fixture.financeId}'
         )`
      )) as Rows
      const entries = (await tx.unsafe(
        `select event_type, quantity_delta_micros, value_delta_cents
         from stock_ledger_entries
         where stock_movement_id = '${movementId}'
         order by event_type`
      )) as Rows
      return { posted: posted[0], entries }
    })

    expect(result.posted?.movement_number).toMatch(/^SM-2026-\d{6}$/)
    expect(result.posted?.journal_entry_id).toBeNull()
    expect(result.entries).toEqual([
      {
        event_type: 'transfer_in',
        quantity_delta_micros: '4000000',
        value_delta_cents: '40000',
      },
      {
        event_type: 'transfer_out',
        quantity_delta_micros: '-4000000',
        value_delta_cents: '-40000',
      },
    ])
  })

  it('consumes stock into a balanced Project expense journal', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      const movementId = await createMovement(
        tx,
        fixture,
        'consumption',
        2_000_000
      )
      const posted = (await tx.unsafe(
        `select * from post_stock_movement(
           '${movementId}', '${fixture.financeId}'
         )`
      )) as Rows
      const journal = (await tx.unsafe(
        `select account.system_key, line.project_id,
           sum(line.debit_cents)::bigint as debit,
           sum(line.credit_cents)::bigint as credit
         from journal_lines line
         join ledger_accounts account
           on account.id = line.ledger_account_id
          and account.tenant_id = line.tenant_id
         where line.journal_entry_id =
           '${posted[0]!.journal_entry_id}'
         group by account.system_key, line.project_id
         order by account.system_key`
      )) as Rows
      return { posted: posted[0], journal }
    })

    expect(result.posted?.journal_entry_number).toMatch(
      /^JE-2026-\d{6}$/
    )
    expect(result.journal).toEqual([
      {
        system_key: 'inventory',
        project_id: null,
        debit: '0',
        credit: '20000',
      },
      {
        system_key: 'inventory_consumption',
        project_id: expect.any(String),
        debit: '20000',
        credit: '0',
      },
    ])
  })

  it('rejects a movement above available stock', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      const movementId = await createMovement(
        tx,
        fixture,
        'transfer',
        11_000_000
      )
      try {
        await tx.unsafe(
          `select * from post_stock_movement(
             '${movementId}', '${fixture.financeId}'
           )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('rejects direct workflow metadata mutation', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      const movementId = await createMovement(
        tx,
        fixture,
        'transfer',
        1_000_000
      )
      try {
        await tx.unsafe(
          `update stock_movements
           set internal_number = 'SM-2026-999999'
           where id = '${movementId}'`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('can reverse posted evidence after a Warehouse is deactivated', async () => {
    const status = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      const movementId = await createMovement(
        tx,
        fixture,
        'transfer',
        1_000_000
      )
      await tx.unsafe(
        `select * from post_stock_movement(
           '${movementId}', '${fixture.financeId}'
         )`
      )
      await tx.unsafe(
        `update warehouses
         set is_active = false
         where id in (
           '${fixture.sourceWarehouseId}',
           '${fixture.targetWarehouseId}'
         )`
      )
      await tx.unsafe(
        `select * from reverse_stock_movement(
           '${movementId}',
           '${fixture.financeId}',
           'Warehouse closed after posting',
           '2026-07-28'
         )`
      )
      return (await tx.unsafe(
        `select status from stock_movements where id = '${movementId}'`
      )) as Rows
    })
    expect(status[0]?.status).toBe('reversed')
  })

  it('posts and reverses a positive count adjustment', async () => {
    const result = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      const movementId = await createMovement(
        tx,
        fixture,
        'adjustment',
        1_000_000,
        12_000
      )
      await tx.unsafe(
        `select * from post_stock_movement(
           '${movementId}', '${fixture.financeId}'
         )`
      )
      const reversed = (await tx.unsafe(
        `select * from reverse_stock_movement(
           '${movementId}',
           '${fixture.financeId}',
           'Count sheet corrected',
           '2026-07-28'
         )`
      )) as Rows
      const net = (await tx.unsafe(
        `select
           sum(quantity_delta_micros)::bigint as quantity,
           sum(value_delta_cents)::bigint as value
         from stock_ledger_entries
         where stock_movement_id = '${movementId}'`
      )) as Rows
      return { reversed: reversed[0], net: net[0] }
    })
    expect(result.reversed?.reversal_journal_entry_number).toMatch(
      /^JE-2026-\d{6}$/
    )
    expect(result.net).toEqual({ quantity: '0', value: '0' })
  })

  it('rejects cross-tenant movement Warehouse references', async () => {
    const rejected = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      const otherTenantId = (
        (await tx.unsafe(
          `insert into tenants(name, slug)
           values(
             'Other movement',
             'other-' || substr(md5(random()::text), 1, 8)
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      const otherUserId = (
        (await tx.unsafe(
          `insert into users(id, tenant_id, email, full_name, role)
           values(
             gen_random_uuid(),
             '${otherTenantId}',
             'other-' || substr(md5(random()::text), 1, 8) || '@probe.test',
             'Other',
             'admin'
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      const otherWarehouseId = (
        (await tx.unsafe(
          `insert into warehouses(tenant_id, code, name, created_by)
           values(
             '${otherTenantId}', 'OTHER', 'Other', '${otherUserId}'
           )
           returning id`
        )) as Rows
      )[0]!.id as string
      try {
        await tx.unsafe(
          `insert into stock_movements(
             tenant_id, movement_type, source_warehouse_id,
             movement_date, reason, created_by
           )
           values(
             '${fixture.tenantId}', 'adjustment', '${otherWarehouseId}',
             '2026-07-27', 'Cross tenant attempt',
             '${fixture.procurementId}'
           )`
        )
        return false
      } catch {
        return true
      }
    })
    expect(rejected).toBe(true)
  })

  it('hides movement evidence from Viewer RLS', async () => {
    const visible = await inRollback(sqlClient, async (tx) => {
      const fixture = await seedMovementFixture(tx)
      await createMovement(tx, fixture, 'transfer', 1_000_000)
      await becomeAuthenticated(tx, fixture.viewerId)
      return (await tx.unsafe(
        `select count(*)::integer as count
         from stock_movements
         where tenant_id = '${fixture.tenantId}'`
      )) as Rows
    })
    expect(visible[0]?.count).toBe(0)
  })
})
