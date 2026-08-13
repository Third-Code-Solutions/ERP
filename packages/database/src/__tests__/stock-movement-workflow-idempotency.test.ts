import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    process.cwd(),
    '..',
    '..',
    'supabase/migrations/20260805120000_stock_movement_workflow_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('Stock Movement workflow idempotency migration contract', () => {
  it('creates a forced-RLS service-only tenant ledger', () => {
    expect(migration).toContain(
      'create type public.stock_movement_workflow_action'
    )
    expect(migration).toContain(
      'create type public.stock_movement_workflow_request_state'
    )
    expect(migration).toContain(
      'create table if not exists public.stock_movement_workflow_requests'
    )
    expect(migration).toContain(
      'ux_stock_movement_workflow_requests_tenant_key'
    )
    expect(migration).toContain(
      'stock_movement_workflow_requests_movement_tenant_fk'
    )
    expect(migration).toContain(
      'stock_movement_workflow_requests_created_by_tenant_fk'
    )
    expect(migration).toContain(
      'alter table public.stock_movement_workflow_requests force row level security'
    )
    expect(migration).toContain(
      'revoke all privileges on table public.stock_movement_workflow_requests'
    )
    expect(migration).toContain(
      'grant all privileges on table public.stock_movement_workflow_requests'
    )
  })
})
