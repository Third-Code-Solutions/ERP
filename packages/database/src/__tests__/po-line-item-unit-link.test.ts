import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, inRollback, makeSql } from './_db-harness'

// S1: a BEFORE INSERT trigger gives every Purchase Order line its stock item
// (exact code) and unit of measure (UOM code or tenant alias). Equivalence is
// tenant data; a unit miss leaves uom_id NULL.
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20261124140000_po_line_item_and_unit_link.sql'
  ),
  'utf8'
)
  .replace(/\r\n/g, '\n')
  .toLowerCase()

describe('PO line item and unit link migration contract', () => {
  it('is expand-only, locked, reversible and flagged for approval', () => {
    expect(migrationSql).toContain('needs production migration approval')
    expect(migrationSql).toMatch(/begin;\s+set local lock_timeout = '5s';/)
    expect(migrationSql).toContain('-- rollback')
    const statements = migrationSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(statements).not.toMatch(/\b(drop (table|column)|truncate|delete from)\b/)
  })

  it('keeps aliases tenant-scoped, unique per tenant and server-only', () => {
    expect(migrationSql).toContain('create table if not exists public.unit_aliases')
    expect(migrationSql).toContain('unit_aliases_uom_tenant_fk')
    expect(migrationSql).toMatch(
      /create unique index if not exists ux_unit_aliases_tenant_alias\s+on public\.unit_aliases \(tenant_id, lower\(alias\)\)/
    )
    expect(migrationSql).toContain(
      'alter table public.unit_aliases force row level security'
    )
    expect(migrationSql).toContain('audit_unit_aliases')
  })

  it('matches items by exact tenant code and never overwrites a writer value', () => {
    expect(migrationSql).toMatch(
      /new\.material_item_id is null and new\.code is not null[\s\S]*?item\.tenant_id = new\.tenant_id\s+and item\.code = new\.code/
    )
    expect(migrationSql).toMatch(/new\.uom_id is null and new\.unit is not null/)
    expect(migrationSql).toContain('before insert')
  })

  it('keeps the trigger functions off client roles', () => {
    for (const fn of [
      'resolve_unit_of_measure(uuid, text)',
      'link_po_line_item_and_unit()',
    ]) {
      expect(migrationSql).toContain(
        `revoke execute on function public.${fn}\n  from public, anon, authenticated;`
      )
    }
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_INVENTORY_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

interface Fixture {
  tenantA: string
  tenantB: string
  userA: string
  poA: string
  uomPc: string
  uomBox: string
  itemPc: string
}

async function seed(tx: postgres.TransactionSql): Promise<Fixture> {
  const suffix = (
    (await tx.unsafe(`select substr(md5(random()::text), 1, 10) as s`)) as Rows
  )[0]!.s as string
  const tenants = (await tx.unsafe(
    `insert into tenants(name, slug)
     values ('Link A', 'link-a-${suffix}'), ('Link B', 'link-b-${suffix}')
     returning id, slug`
  )) as Rows
  const tenantA = tenants.find((row) => String(row.slug).startsWith('link-a'))!
    .id as string
  const tenantB = tenants.find((row) => String(row.slug).startsWith('link-b'))!
    .id as string
  const userA = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values (gen_random_uuid(), '${tenantA}', 'a-${suffix}@probe.test', 'Probe A', 'procurement')
       returning id`
    )) as Rows
  )[0]!.id as string
  const userB = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values (gen_random_uuid(), '${tenantB}', 'b-${suffix}@probe.test', 'Probe B', 'procurement')
       returning id`
    )) as Rows
  )[0]!.id as string
  const uoms = (await tx.unsafe(
    `insert into units_of_measure(tenant_id, code, name, created_by)
     values
       ('${tenantA}', 'PC', 'Piece', '${userA}'),
       ('${tenantA}', 'BOX', 'Box', '${userA}'),
       ('${tenantB}', 'PC', 'Piece', '${userB}')
     returning id, tenant_id, code`
  )) as Rows
  const uomPc = uoms.find((row) => row.tenant_id === tenantA && row.code === 'PC')!
    .id as string
  const uomBox = uoms.find((row) => row.tenant_id === tenantA && row.code === 'BOX')!
    .id as string
  const uomPcB = uoms.find((row) => row.tenant_id === tenantB)!.id as string
  await tx.unsafe(
    `insert into unit_aliases(tenant_id, alias, uom_id, created_by)
     values ('${tenantA}', 'pcs', '${uomPc}', '${userA}')`
  )
  const itemPc = (
    (await tx.unsafe(
      `insert into material_items(tenant_id, code, description, unit, base_uom_id, inventory_tracked, created_by)
       values ('${tenantA}', 'MAT-1', 'Tracked material', 'PC', '${uomPc}', true, '${userA}')
       returning id`
    )) as Rows
  )[0]!.id as string
  await tx.unsafe(
    `insert into material_items(tenant_id, code, description, unit, base_uom_id, inventory_tracked, created_by)
     values ('${tenantB}', 'ONLY-B', 'Other tenant material', 'PC', '${uomPcB}', true, '${userB}')`
  )
  const projectA = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client, created_by)
       values ('${tenantA}', 'Link project', 'Client', '${userA}') returning id`
    )) as Rows
  )[0]!.id as string
  const poA = (
    (await tx.unsafe(
      `insert into purchase_orders(tenant_id, project_id, created_by, po_number, status, subtotal_cents, total_cents)
       values ('${tenantA}', '${projectA}', '${userA}', 'PO-${suffix}', 'issued', 100, 100)
       returning id`
    )) as Rows
  )[0]!.id as string
  return { tenantA, tenantB, userA, poA, uomPc, uomBox, itemPc }
}

async function insertLine(
  tx: postgres.TransactionSql,
  fixture: Fixture,
  columns: { code?: string | null; unit?: string | null; item?: string; uom?: string },
  tenantId = fixture.tenantA
): Promise<{ material_item_id: string | null; uom_id: string | null }> {
  const code = columns.code === undefined ? null : columns.code
  const unit = columns.unit === undefined ? null : columns.unit
  const row = (
    (await tx.unsafe(
      `insert into po_line_items(
         tenant_id, po_id, sort_order, code, description, unit,
         material_item_id, uom_id, quantity, quantity_micros,
         unit_cost_cents, line_total_cents
       ) values (
         '${tenantId}', '${fixture.poA}', 1,
         ${code === null ? 'null' : `'${code}'`}, 'Probe line',
         ${unit === null ? 'null' : `'${unit}'`},
         ${columns.item ? `'${columns.item}'` : 'null'},
         ${columns.uom ? `'${columns.uom}'` : 'null'},
         1, 1000000, 100, 100
       ) returning material_item_id, uom_id`
    )) as Rows
  )[0]!
  return {
    material_item_id: (row.material_item_id as string | null) ?? null,
    uom_id: (row.uom_id as string | null) ?? null,
  }
}

runtimeSuite('PO line item and unit link trigger', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('links the item by exact code and the unit by UOM code, ignoring case and padding', async () => {
    const result = await inRollback(sql, async (tx) => {
      const fixture = await seed(tx)
      return { fixture, line: await insertLine(tx, fixture, { code: 'MAT-1', unit: ' pc ' }) }
    })

    expect(result.line).toEqual({
      material_item_id: result.fixture.itemPc,
      uom_id: result.fixture.uomPc,
    })
  })

  it('links the unit through a tenant alias', async () => {
    const result = await inRollback(sql, async (tx) => {
      const fixture = await seed(tx)
      return { fixture, line: await insertLine(tx, fixture, { code: 'MAT-1', unit: 'PCS' }) }
    })

    expect(result.line.uom_id).toBe(result.fixture.uomPc)
  })

  it('leaves the unit empty on a miss and never guesses a match', async () => {
    const line = await inRollback(sql, async (tx) => {
      const fixture = await seed(tx)
      return insertLine(tx, fixture, { code: 'MAT-1', unit: 'bags' })
    })

    expect(line.uom_id).toBeNull()
  })

  it('does not match a code by prefix or another tenant item', async () => {
    const line = await inRollback(sql, async (tx) => {
      const fixture = await seed(tx)
      const prefix = await insertLine(tx, fixture, { code: 'MAT' })
      const otherTenant = await insertLine(tx, fixture, { code: 'ONLY-B' })
      return { prefix, otherTenant }
    })

    expect(line.prefix.material_item_id).toBeNull()
    expect(line.otherTenant.material_item_id).toBeNull()
  })

  it('never overwrites an item or unit the writer set', async () => {
    const result = await inRollback(sql, async (tx) => {
      const fixture = await seed(tx)
      return {
        fixture,
        line: await insertLine(tx, fixture, {
          code: 'MAT-1',
          unit: 'pc',
          uom: fixture.uomBox,
        }),
      }
    })

    expect(result.line.uom_id).toBe(result.fixture.uomBox)
  })

  it('still rejects a receipt line whose unit is not the item base unit', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const fixture = await seed(tx)
      const line = (
        (await tx.unsafe(
          `insert into po_line_items(
             tenant_id, po_id, sort_order, code, description, unit,
             uom_id, quantity, quantity_micros, unit_cost_cents, line_total_cents
           ) values (
             '${fixture.tenantA}', '${fixture.poA}', 2, 'MAT-1', 'Probe line', 'box',
             '${fixture.uomBox}', 1, 1000000, 100, 100
           ) returning id`
        )) as Rows
      )[0]!.id as string
      const warehouse = (
        (await tx.unsafe(
          `insert into warehouses(tenant_id, code, name, created_by)
           values ('${fixture.tenantA}', 'MAIN', 'Main', '${fixture.userA}') returning id`
        )) as Rows
      )[0]!.id as string
      const receipt = (
        (await tx.unsafe(
          `insert into stock_receipts(tenant_id, warehouse_id, purchase_order_id, received_date, created_by)
           values ('${fixture.tenantA}', '${warehouse}', '${fixture.poA}', '2026-11-18', '${fixture.userA}')
           returning id`
        )) as Rows
      )[0]!.id as string
      try {
        await tx.savepoint(async (inner) => {
          await inner.unsafe(
            `insert into stock_receipt_lines(
               tenant_id, stock_receipt_id, po_line_item_id, material_item_id, uom_id,
               line_number, description, quantity_micros, unit_cost_cents, line_total_cents
             ) values (
               '${fixture.tenantA}', '${receipt}', '${line}', '${fixture.itemPc}', '${fixture.uomBox}',
               1, 'Probe', 1000000, 100, 100
             )`
          )
        })
        return null
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    })

    expect(rejected).toContain('Receipt line must match a tracked PO Item, UOM, and cost')
  })
})
