import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    '../../supabase/migrations/20260802180000_delivery_cancel_workflow.sql'
  ),
  'utf8'
)

describe('delivery cancellation migration contract', () => {
  it('extends the existing ledger and cancellation evidence atomically', () => {
    expect(migrationSql).toContain(
      "alter type public.delivery_workflow_action\n  add value if not exists 'cancel_delivery'"
    )
    expect(migrationSql).toContain('add column if not exists cancelled_at')
    expect(migrationSql).toContain('add column if not exists cancelled_by')
    expect(migrationSql).toContain(
      'add column if not exists cancellation_reason'
    )
    expect(migrationSql).toContain(
      'delivery_schedules_cancelled_by_tenant_fk'
    )
    expect(migrationSql).toContain('references public.users (tenant_id, id)')
    expect(migrationSql).toContain('begin;')
    expect(migrationSql).toContain('commit;')
    expect(migrationSql).not.toMatch(/create table/i)
  })
})
