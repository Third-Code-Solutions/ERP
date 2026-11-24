import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { purchaseOrders } from '../schema'
import { DATABASE_URL, makeSql } from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20261124180000_po_supplier_confirmation.sql'
  ),
  'utf8'
)
const flat = migrationSql.replace(/\s+/g, ' ')

const COLUMNS = [
  ['supplier_confirmed_at', 'timestamp with time zone'],
  ['supplier_confirmed_by_name', 'character varying'],
  ['supplier_confirmed_channel', 'character varying'],
  ['supplier_confirmed_note', 'text'],
] as const

describe('PO supplier confirmation migration contract', () => {
  it('adds four nullable columns and a validated pairing check under bounded timeouts', () => {
    expect(migrationSql.startsWith('-- NEEDS PRODUCTION MIGRATION APPROVAL')).toBe(true)
    expect(migrationSql).toContain(
      "begin;\n\nset local lock_timeout = '5s';\nset local statement_timeout = '60s';"
    )
    expect(flat).toContain(
      'add column if not exists supplier_confirmed_at timestamptz, add column if not exists supplier_confirmed_by_name varchar(255), add column if not exists supplier_confirmed_channel varchar(20), add column if not exists supplier_confirmed_note text;'
    )
    expect(flat).toContain(
      "check ( (supplier_confirmed_at is null) = (supplier_confirmed_channel is null) and ( supplier_confirmed_channel is null or supplier_confirmed_channel in ('email', 'phone', 'in_person', 'other') ) ) not valid;"
    )
    expect(flat).toContain(
      'validate constraint purchase_orders_supplier_confirmation_check;'
    )
    expect(migrationSql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('is expand-only: no default, backfill, status change or grant', () => {
    const body = migrationSql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(body).not.toMatch(/\bdefault\b/i)
    expect(body).not.toMatch(/\bupdate\s+public\./i)
    expect(body).not.toMatch(/\bgrant\b|\brevoke\b/i)
    expect(body).not.toMatch(/purchase_order_status/i)
    expect(body).not.toMatch(/\bnot null\b/i)
  })

  it('keeps Drizzle aligned with the columns and the check', () => {
    const config = getTableConfig(purchaseOrders)
    for (const [name] of COLUMNS) {
      const column = config.columns.find((candidate) => candidate.name === name)
      expect(column, name).toBeDefined()
      expect(column?.notNull, name).toBe(false)
    }
    expect(
      config.checks.map((check) => check.name)
    ).toContain('purchase_orders_supplier_confirmation_check')
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

runtimeSuite('PO supplier confirmation runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('has the four nullable columns', async () => {
    const rows = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'purchase_orders'
        and column_name like 'supplier_confirmed_%'
      order by column_name
    `
    expect(rows.map((row) => [row.column_name, row.data_type, row.is_nullable])).toEqual(
      [...COLUMNS]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, type]) => [name, type, 'YES'])
    )
  })

  it('holds the pairing check validated', async () => {
    const rows = await sql<{ convalidated: boolean; definition: string }[]>`
      select con.convalidated, pg_get_constraintdef(con.oid) as definition
      from pg_catalog.pg_constraint con
      where con.conrelid = 'public.purchase_orders'::regclass
        and con.conname = 'purchase_orders_supplier_confirmation_check'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.convalidated).toBe(true)
    expect(rows[0]?.definition).toContain('supplier_confirmed_channel')
    expect(rows[0]?.definition).toContain('in_person')
  })
})
