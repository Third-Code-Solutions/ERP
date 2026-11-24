import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cnpsSurveys } from '../schema'
import { DATABASE_URL, makeSql } from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20261124160000_cnps_response_token_hash_index.sql'
  ),
  'utf8'
)

describe('CNPS response token index migration contract', () => {
  it('builds a partial index on issued tokens under bounded timeouts', () => {
    expect(migrationSql.startsWith('-- NEEDS PRODUCTION MIGRATION APPROVAL')).toBe(true)
    expect(migrationSql).toContain(
      "begin;\n\nset local lock_timeout = '5s';\nset local statement_timeout = '60s';"
    )
    expect(migrationSql.replace(/\s+/g, ' ')).toContain(
      'create index if not exists idx_cnps_response_token_hash on public.cnps_surveys (response_token_hash) where response_token_hash is not null;'
    )
    expect(migrationSql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('keeps Drizzle aligned with the index', () => {
    const indexes = getTableConfig(cnpsSurveys).indexes.map((index) => index.config.name)
    expect(indexes).toContain('idx_cnps_response_token_hash')
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

runtimeSuite('CNPS response token index runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('exists on cnps_surveys as a partial btree index', async () => {
    const rows = await sql<{ indexdef: string }[]>`
      select indexdef
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'cnps_surveys'
        and indexname = 'idx_cnps_response_token_hash'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.indexdef).toMatch(
      /USING btree \(response_token_hash\) WHERE \(response_token_hash IS NOT NULL\)/
    )
  })
})
