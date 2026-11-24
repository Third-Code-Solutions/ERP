import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cnpsSurveys } from '../schema'
import { DATABASE_URL, inRollback, makeSql } from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20261124160000_cnps_response_token_hash_index.sql'
  ),
  'utf8'
)

describe('CNPS response token index migration contract', () => {
  it('builds a partial unique index on issued tokens under bounded timeouts', () => {
    expect(migrationSql.startsWith('-- NEEDS PRODUCTION MIGRATION APPROVAL')).toBe(true)
    expect(migrationSql).toContain(
      "begin;\n\nset local lock_timeout = '5s';\nset local statement_timeout = '60s';"
    )
    expect(migrationSql.replace(/\s+/g, ' ')).toContain(
      'create unique index if not exists idx_cnps_response_token_hash on public.cnps_surveys (response_token_hash) where response_token_hash is not null;'
    )
    expect(migrationSql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('keeps Drizzle aligned with the index', () => {
    const index = getTableConfig(cnpsSurveys).indexes.find(
      (candidate) => candidate.config.name === 'idx_cnps_response_token_hash'
    )
    expect(index?.config.unique).toBe(true)
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

  it('exists on cnps_surveys as a partial unique btree index', async () => {
    const rows = await sql<{ indexdef: string }[]>`
      select indexdef
      from pg_catalog.pg_indexes
      where schemaname = 'public'
        and tablename = 'cnps_surveys'
        and indexname = 'idx_cnps_response_token_hash'
    `
    expect(rows).toHaveLength(1)
    expect(rows[0]?.indexdef).toMatch(
      /^CREATE UNIQUE INDEX .* USING btree \(response_token_hash\) WHERE \(response_token_hash IS NOT NULL\)$/
    )
  })

  it('serves the survey lookup by token hash', async () => {
    const plan = await inRollback(sql, async (tx) => {
      await tx.unsafe(`set local enable_seqscan = off`)
      const rows = (await tx.unsafe(
        `explain (costs off) select id from public.cnps_surveys where response_token_hash = 'probe' limit 1`
      )) as Array<Record<string, string>>
      return rows.map((row) => Object.values(row)[0]).join(' / ')
    })

    expect(plan).toContain('idx_cnps_response_token_hash')
  })
})
