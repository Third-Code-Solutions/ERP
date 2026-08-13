import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260812120000_bank_statement_reconcile_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('bank statement reconcile request migration contract', () => {
  it('creates a tenant-scoped idempotency ledger with fail-closed access', () => {
    expect(migrationSql).toContain(
      'create type public.bank_statement_reconcile_request_state'
    )
    expect(migrationSql).toContain(
      'create table if not exists public.bank_statement_reconcile_requests'
    )
    expect(migrationSql).toContain(
      'ux_bank_statement_reconcile_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'bank_statement_reconcile_requests_statement_tenant_fk'
    )
    expect(migrationSql).toContain(
      'bank_statement_reconcile_requests_created_by_tenant_fk'
    )
    expect(migrationSql).toContain(
      'alter table public.bank_statement_reconcile_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.bank_statement_reconcile_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toContain(
      'grant all privileges on table public.bank_statement_reconcile_requests'
    )
  })

  it('makes processing and succeeded payloads mutually consistent', () => {
    expect(migrationSql).toContain(
      'bank_statement_reconcile_requests_state_payload'
    )
    expect(migrationSql).toContain("state = 'processing'")
    expect(migrationSql).toContain("state = 'succeeded'")
    expect(migrationSql).toContain(
      'bank_statement_reconcile_requests_completed_after_created'
    )
  })
})
