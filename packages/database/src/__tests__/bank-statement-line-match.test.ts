import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260812110000_bank_statement_line_match_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('bank statement line match migration contract', () => {
  it('stores action, target, and tenant-scoped idempotency', () => {
    expect(migrationSql).toContain(
      'create type public.bank_statement_line_match_action'
    )
    expect(migrationSql).toContain(
      'create type public.bank_statement_line_match_request_state'
    )
    expect(migrationSql).toContain(
      'create table if not exists public.bank_statement_line_match_requests'
    )
    expect(migrationSql).toContain(
      'ux_bank_statement_line_match_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'bank_statement_line_match_requests_action_target'
    )
    expect(migrationSql).toContain(
      'bank_statement_line_match_requests_line_tenant_fk'
    )
    expect(migrationSql).toContain(
      'ux_bank_statement_lines_tenant_id_id'
    )
    expect(migrationSql).toContain(
      'bank_statement_line_match_requests_cash_transaction_tenant_fk'
    )
  })

  it('closes browser and anonymous table access', () => {
    expect(migrationSql).toContain(
      'alter table public.bank_statement_line_match_requests enable row level security'
    )
    expect(migrationSql).toContain(
      'alter table public.bank_statement_line_match_requests force row level security'
    )
    expect(migrationSql).toContain(
      'revoke all privileges on table public.bank_statement_line_match_requests'
    )
    expect(migrationSql).toContain(
      'grant all privileges on table public.bank_statement_line_match_requests'
    )
  })
})
