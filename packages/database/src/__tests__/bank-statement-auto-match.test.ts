import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260812100000_bank_statement_auto_match_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('bank statement auto-match command migration contract', () => {
  it('stores tenant-scoped idempotency with a terminal result', () => {
    expect(migrationSql).toContain(
      'create type public.bank_statement_auto_match_request_state'
    )
    expect(migrationSql).toContain(
      'create table if not exists public.bank_statement_auto_match_requests'
    )
    expect(migrationSql).toContain(
      'ux_bank_statement_auto_match_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'bank_statement_auto_match_requests_statement_tenant_fk'
    )
    expect(migrationSql).toContain(
      'bank_statement_auto_match_requests_created_by_tenant_fk'
    )
    expect(migrationSql).toContain(
      'bank_statement_auto_match_requests_state_payload'
    )
  })

  it('closes browser and anonymous table access by default', () => {
    expect(migrationSql).toContain(
      'alter table public.bank_statement_auto_match_requests enable row level security'
    )
    expect(migrationSql).toContain(
      'alter table public.bank_statement_auto_match_requests force row level security'
    )
    expect(migrationSql).toContain(
      'revoke all privileges on table public.bank_statement_auto_match_requests'
    )
    expect(migrationSql).toContain(
      'grant all privileges on table public.bank_statement_auto_match_requests'
    )
  })
})
