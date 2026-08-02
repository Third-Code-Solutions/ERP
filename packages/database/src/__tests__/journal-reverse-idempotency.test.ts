import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../../../supabase/migrations/20260802150000_finance_journal_reverse_idempotency.sql',
    import.meta.url
  ),
  'utf8'
)

describe('journal reverse idempotency migration contract', () => {
  it('keeps the ledger tenant-scoped and service-only', () => {
    expect(migration).toContain(
      'create type public.journal_reverse_request_state'
    )
    expect(migration).toContain(
      'create table if not exists public.journal_reverse_requests'
    )
    expect(migration).toContain(
      'ux_journal_reverse_requests_tenant_key'
    )
    expect(migration).toContain(
      'journal_reverse_requests_journal_entry_tenant_fk'
    )
    expect(migration).toContain(
      'journal_reverse_requests_created_by_tenant_fk'
    )
    expect(migration).toContain(
      'alter table public.journal_reverse_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.journal_reverse_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toContain(
      'grant all privileges on table public.journal_reverse_requests to service_role'
    )
  })

  it('requires a complete result for successful replay', () => {
    expect(migration).toContain(
      "state = 'processing'"
    )
    expect(migration).toContain(
      "state = 'succeeded'"
    )
    expect(migration).toContain(
      'journal_reverse_requests_completed_after_created'
    )
  })
})
