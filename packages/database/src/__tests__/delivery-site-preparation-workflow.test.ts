import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    '../../supabase/migrations/20260802190000_delivery_site_preparation_start_workflow.sql'
  ),
  'utf8'
)

describe('delivery site-preparation start migration contract', () => {
  it('extends the existing delivery workflow ledger without creating tables', () => {
    expect(migrationSql).toContain(
      "alter type public.delivery_workflow_action\n  add value if not exists 'start_site_preparation'"
    )
    expect(migrationSql).toContain('begin;')
    expect(migrationSql).toContain('commit;')
    expect(migrationSql).not.toMatch(/create table/i)
  })
})
