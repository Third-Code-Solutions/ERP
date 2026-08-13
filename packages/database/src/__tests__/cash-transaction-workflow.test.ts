import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    '../../supabase/migrations/20260802230000_cash_transaction_workflow_idempotency.sql'
  ),
  'utf8'
)

describe('cash transaction workflow migration contract', () => {
  it('uses one tenant-scoped ledger for post and reverse commands', () => {
    expect(migration).toContain(
      'create type public.cash_transaction_workflow_action'
    )
    expect(migration).toContain(
      'create table if not exists public.cash_transaction_workflow_requests'
    )
    expect(migration).toContain(
      'ux_cash_transaction_workflow_requests_tenant_key'
    )
    expect(migration).toContain(
      'cash_transaction_workflow_requests_transaction_tenant_fk'
    )
    expect(migration).toContain(
      'cash_transaction_workflow_requests_created_by_tenant_fk'
    )
  })

  it('forces service-only access and validates replay payloads', () => {
    expect(migration).toContain(
      'alter table public.cash_transaction_workflow_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.cash_transaction_workflow_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toContain(
      'grant all privileges on table public.cash_transaction_workflow_requests'
    )
    expect(migration).toContain(
      'cash_transaction_workflow_requests_state_payload'
    )
  })
})
