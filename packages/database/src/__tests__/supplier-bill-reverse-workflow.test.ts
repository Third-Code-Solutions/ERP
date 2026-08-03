import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    '../../supabase/migrations/20260802220000_supplier_bill_reverse_workflow.sql'
  ),
  'utf8'
)

describe('supplier bill reversal workflow migration contract', () => {
  it('uses a tenant-scoped durable idempotency ledger', () => {
    expect(migration).toContain(
      'create type public.supplier_bill_reverse_request_state'
    )
    expect(migration).toContain(
      'create table if not exists public.supplier_bill_reverse_requests'
    )
    expect(migration).toContain(
      'ux_supplier_bill_reverse_requests_tenant_key'
    )
    expect(migration).toContain(
      'supplier_bill_reverse_requests_bill_tenant_fk'
    )
    expect(migration).toContain(
      'supplier_bill_reverse_requests_created_by_tenant_fk'
    )
  })

  it('forces service-only access and validates replay payloads', () => {
    expect(migration).toContain(
      'alter table public.supplier_bill_reverse_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.supplier_bill_reverse_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toContain(
      'grant all privileges on table public.supplier_bill_reverse_requests'
    )
    expect(migration).toContain(
      'supplier_bill_reverse_requests_state_payload'
    )
  })
})
