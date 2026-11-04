import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, inRollback, makeSql, seedTwoTenants } from './_db-harness'

// D-5: bom_line_items.quantity_decimal numeric(18,4) is the BOQ quantity. The
// legacy integer column is dual-written by a trigger until the contract release.
const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>

async function seedBom(tx: postgres.TransactionSql): Promise<{ tenantId: string; bomId: string }> {
  const fixture = await seedTwoTenants(tx)
  const projectId = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client)
       values ('${fixture.tenantA}', 'D-5 project', 'D-5 client') returning id`,
    )) as Rows
  )[0]!.id as string
  const bomId = (
    (await tx.unsafe(
      `insert into boms(tenant_id, project_id, created_by, label)
       values ('${fixture.tenantA}', '${projectId}', '${fixture.userA}', 'D-5 BOM') returning id`,
    )) as Rows
  )[0]!.id as string
  return { tenantId: fixture.tenantA, bomId }
}

async function insertLine(
  tx: postgres.TransactionSql,
  scope: { tenantId: string; bomId: string },
  quantityColumns: string,
  quantityValues: string,
): Promise<string> {
  return (
    (await tx.unsafe(
      `insert into bom_line_items(
         tenant_id, bom_id, kind, classification_status, description,
         description_original, unit, unit_rate_source, ${quantityColumns}
       ) values (
         '${scope.tenantId}', '${scope.bomId}', 'work_item', 'classified', 'D-5 line',
         'D-5 line', 'cu.m', 'manual', ${quantityValues}
       ) returning id`,
    )) as Rows
  )[0]!.id as string
}

async function quantities(
  tx: postgres.TransactionSql,
  lineId: string,
): Promise<{ quantity: number; quantityDecimal: string }> {
  const row = (
    (await tx.unsafe(
      `select quantity, quantity_decimal::text as quantity_decimal
       from bom_line_items where id = '${lineId}'`,
    )) as Rows
  )[0]!
  return { quantity: Number(row.quantity), quantityDecimal: String(row.quantity_decimal) }
}

runtimeSuite('D-5 BOM line decimal quantity', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('adds a NOT NULL numeric(18,4) column and keeps the sync function off client roles', async () => {
    const state = await inRollback(sql, async (tx) => {
      const column = (
        (await tx.unsafe(
          `select data_type, numeric_precision, numeric_scale, is_nullable, column_default
           from information_schema.columns
           where table_schema = 'public' and table_name = 'bom_line_items'
             and column_name = 'quantity_decimal'`,
        )) as Rows
      )[0]
      const privileges = (
        (await tx.unsafe(
          `select
             has_function_privilege('anon', 'public.bom_line_items_sync_quantity()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.bom_line_items_sync_quantity()', 'execute') as authenticated`,
        )) as Rows
      )[0]
      return { column, privileges }
    })

    expect(state.column).toMatchObject({
      data_type: 'numeric',
      numeric_precision: 18,
      numeric_scale: 4,
      is_nullable: 'NO',
      column_default: null,
    })
    expect(state.privileges).toEqual({ anon: false, authenticated: false })
  })

  it('fills the decimal from an integer-only legacy writer', async () => {
    const state = await inRollback(sql, async (tx) => {
      const scope = await seedBom(tx)
      const lineId = await insertLine(tx, scope, 'quantity', '7')
      return quantities(tx, lineId)
    })

    expect(state).toEqual({ quantity: 7, quantityDecimal: '7.0000' })
  })

  it('mirrors a decimal write to the legacy integer with half-up rounding', async () => {
    const state = await inRollback(sql, async (tx) => {
      const scope = await seedBom(tx)
      const results: Record<string, { quantity: number; quantityDecimal: string }> = {}
      for (const value of ['12.5', '12.4999', '0.5', '0.1', '0.0001']) {
        // A stale integer in the same write loses to the decimal.
        const lineId = await insertLine(tx, scope, 'quantity, quantity_decimal', `999, ${value}`)
        results[value] = await quantities(tx, lineId)
      }
      return results
    })

    expect(state).toEqual({
      '12.5': { quantity: 13, quantityDecimal: '12.5000' },
      '12.4999': { quantity: 12, quantityDecimal: '12.4999' },
      '0.5': { quantity: 1, quantityDecimal: '0.5000' },
      '0.1': { quantity: 0, quantityDecimal: '0.1000' },
      '0.0001': { quantity: 0, quantityDecimal: '0.0001' },
    })
  })

  it('keeps both columns in step on update, with the decimal winning a conflicting write', async () => {
    const state = await inRollback(sql, async (tx) => {
      const scope = await seedBom(tx)
      const lineId = await insertLine(tx, scope, 'quantity_decimal', '12.5')

      await tx.unsafe(`update bom_line_items set quantity_decimal = 0.1 where id = '${lineId}'`)
      const afterDecimal = await quantities(tx, lineId)

      await tx.unsafe(`update bom_line_items set quantity = 5 where id = '${lineId}'`)
      const afterLegacyInteger = await quantities(tx, lineId)

      await tx.unsafe(
        `update bom_line_items set quantity = 40, quantity_decimal = 2.5 where id = '${lineId}'`,
      )
      const afterBoth = await quantities(tx, lineId)

      await tx.unsafe(`update bom_line_items set description = 'renamed' where id = '${lineId}'`)
      const afterUnrelated = await quantities(tx, lineId)

      return { afterDecimal, afterLegacyInteger, afterBoth, afterUnrelated }
    })

    expect(state.afterDecimal).toEqual({ quantity: 0, quantityDecimal: '0.1000' })
    expect(state.afterLegacyInteger).toEqual({ quantity: 5, quantityDecimal: '5.0000' })
    expect(state.afterBoth).toEqual({ quantity: 3, quantityDecimal: '2.5000' })
    expect(state.afterUnrelated).toEqual({ quantity: 3, quantityDecimal: '2.5000' })
  })

  it('rejects more than 4 decimal places of storage and a decimal past the legacy integer range', async () => {
    const state = await inRollback(sql, async (tx) => {
      const scope = await seedBom(tx)
      // numeric(18,4) rounds extra digits on input; the app layer rejects them first.
      const rounded = await quantities(
        tx,
        await insertLine(tx, scope, 'quantity_decimal', '1.23456'),
      )
      await tx.unsafe('savepoint d5_range')
      let rangeError = ''
      try {
        await insertLine(tx, scope, 'quantity_decimal', '2147483647.5')
      } catch (error) {
        rangeError = error instanceof Error ? error.message : String(error)
      }
      await tx.unsafe('rollback to savepoint d5_range')
      return { rounded, rangeError }
    })

    expect(state.rounded).toEqual({ quantity: 1, quantityDecimal: '1.2346' })
    expect(state.rangeError).toMatch(/out of range/i)
  })

  it('prices a DUPA line from the decimal quantity, not the rounded integer', async () => {
    const state = await inRollback(sql, async (tx) => {
      const scope = await seedBom(tx)
      const lineId = await insertLine(tx, scope, 'quantity_decimal', '0.1')
      const dupaId = (
        (await tx.unsafe(
          `insert into dupas(tenant_id, bom_line_item_id, header_quantity, uom, vat_base)
           values ('${scope.tenantId}', '${lineId}', 1, 'cu.m', 'direct_only') returning id`,
        )) as Rows
      )[0]!.id as string
      await tx.unsafe(
        `insert into dupa_material_lines(
           tenant_id, dupa_id, description, quantity, uom, unit_rate_centavos, rate_source
         ) values ('${scope.tenantId}', '${dupaId}', 'Ready-mix concrete', 1, 'cu.m', 16217500, 'manual')`,
      )
      const line = (
        (await tx.unsafe(
          `select unit_rate_source, unit_cost_cents, line_total_cents, quantity
           from bom_line_items where id = '${lineId}'`,
        )) as Rows
      )[0]!
      return {
        unitRateSource: line.unit_rate_source,
        unitRate: BigInt(String(line.unit_cost_cents)),
        lineTotal: BigInt(String(line.line_total_cents)),
        quantity: Number(line.quantity),
      }
    })

    expect(state.unitRateSource).toBe('dupa')
    expect(state.quantity).toBe(0)
    expect(state.unitRate).toBeGreaterThan(0n)
    // round(rate x 0.1000) half-up, exactly: (rate x 1000 + 5000) / 10000.
    expect(state.lineTotal).toBe((state.unitRate * 1000n + 5000n) / 10000n)
  })
})
