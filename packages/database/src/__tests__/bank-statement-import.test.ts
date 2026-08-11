import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(
    process.cwd(),
    '../../supabase/migrations/20260812140000_bank_statement_import_workflow.sql'
  ),
  'utf8'
)
const storageMigration = readFileSync(
  resolve(
    process.cwd(),
    '../../supabase/migrations/20260812150000_bank_statement_storage_source.sql'
  ),
  'utf8'
)

describe('bank statement import request ledger migration', () => {
  it('keeps import requests tenant-scoped, force-RLS, and service-only', () => {
    expect(migration).toContain(
      'create type public.bank_statement_import_request_state'
    )
    expect(migration).toContain(
      'create table if not exists public.bank_statement_import_requests'
    )
    expect(migration).toContain(
      'ux_bank_statement_import_requests_tenant_key'
    )
    expect(migration).toContain(
      'bank_statement_import_requests_statement_tenant_fk'
    )
    expect(migration).toContain(
      'bank_statement_import_requests_created_by_tenant_fk'
    )
    expect(migration).toContain(
      'alter table public.bank_statement_import_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.bank_statement_import_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toContain(
      'grant all privileges on table public.bank_statement_import_requests'
    )
    expect(migration).toContain(
      'bank_statement_import_requests_state_payload'
    )
  })

  it('keeps storage sources optional but path-shaped and bounded', () => {
    expect(storageMigration).toContain(
      'add column if not exists source_storage_path text'
    )
    expect(storageMigration).toContain(
      'bank_statements_source_storage_path_format'
    )
    expect(storageMigration).toMatch(
      /source_storage_path ~\*.*bank-statements/
    )
  })
})
