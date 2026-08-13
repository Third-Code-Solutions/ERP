import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260802120000_finance_journal_post_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('journal post idempotency migration contract', () => {
  it('creates a durable tenant-scoped request record', () => {
    expect(migration).toContain(
      'create table if not exists public.journal_post_requests'
    )
    expect(migration).toContain(
      'ux_journal_post_requests_tenant_key'
    )
    expect(migration).toContain(
      'journal_post_requests_journal_entry_tenant_fk'
    )
    expect(migration).toContain(
      'journal_post_requests_created_by_tenant_fk'
    )
  })

  it('keeps request rows service-role-only with replay invariants', () => {
    expect(migration).toContain(
      'journal_post_requests_state_payload'
    )
    expect(migration).toContain(
      'alter table public.journal_post_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.journal_post_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toContain(
      'grant all privileges on table public.journal_post_requests to service_role'
    )
  })
})
