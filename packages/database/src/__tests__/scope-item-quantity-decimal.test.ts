import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DATABASE_URL, inRollback, makeSql, seedTwoTenants } from './_db-harness'

// scope_items.quantity_decimal numeric(18,4) holds fractional CAD areas. The
// legacy integer column is dual-written by a trigger until the contract release.
const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

type Rows = Array<Record<string, unknown>>
type Quantities = { quantity: number; quantityDecimal: string }

async function seedProject(tx: postgres.TransactionSql): Promise<{ tenantId: string; projectId: string }> {
  const fixture = await seedTwoTenants(tx)
  const rows = (await tx.unsafe(
    `insert into projects(tenant_id, name, client)
     values ('${fixture.tenantA}', 'Scope qty project', 'Scope qty client') returning id`,
  )) as Rows
  return { tenantId: fixture.tenantA, projectId: String(rows[0]?.id) }
}

async function insertScopeItem(
  tx: postgres.TransactionSql,
  scope: { tenantId: string; projectId: string },
  columns: string,
  values: string,
): Promise<string> {
  const rows = (await tx.unsafe(
    `insert into scope_items(tenant_id, project_id, description, unit, ${columns})
     values ('${scope.tenantId}', '${scope.projectId}', 'Floor area', 'sqm', ${values})
     returning id`,
  )) as Rows
  return String(rows[0]?.id)
}

async function quantities(tx: postgres.TransactionSql, id: string): Promise<Quantities> {
  const rows = (await tx.unsafe(
    `select quantity, quantity_decimal::text as quantity_decimal from scope_items where id = '${id}'`,
  )) as Rows
  return { quantity: Number(rows[0]?.quantity), quantityDecimal: String(rows[0]?.quantity_decimal) }
}

runtimeSuite('scope_items decimal quantity', () => {
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
           where table_schema = 'public' and table_name = 'scope_items'
             and column_name = 'quantity_decimal'`,
        )) as Rows
      )[0]
      const privileges = (
        (await tx.unsafe(
          `select
             has_function_privilege('anon', 'public.scope_items_sync_quantity()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.scope_items_sync_quantity()', 'execute') as authenticated`,
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

  it('fills the decimal from an integer-only writer and mirrors a decimal write half-up', async () => {
    const state = await inRollback(sql, async (tx) => {
      const scope = await seedProject(tx)
      const legacy = await quantities(tx, await insertScopeItem(tx, scope, 'quantity', '7'))
      const fractional = await quantities(
        tx,
        await insertScopeItem(tx, scope, 'quantity, quantity_decimal', '999, 12.5'),
      )
      const id = await insertScopeItem(tx, scope, 'quantity_decimal', '12.3457')
      const inserted = await quantities(tx, id)
      await tx.unsafe(`update scope_items set quantity = 5 where id = '${id}'`)
      const afterLegacyUpdate = await quantities(tx, id)
      return { legacy, fractional, inserted, afterLegacyUpdate }
    })

    expect(state.legacy).toEqual({ quantity: 7, quantityDecimal: '7.0000' })
    expect(state.fractional).toEqual({ quantity: 13, quantityDecimal: '12.5000' })
    expect(state.inserted).toEqual({ quantity: 12, quantityDecimal: '12.3457' })
    expect(state.afterLegacyUpdate).toEqual({ quantity: 5, quantityDecimal: '5.0000' })
  })
})
