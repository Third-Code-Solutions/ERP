import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260803100000_customer_invoice_reverse_workflow.sql'
  ),
  'utf8'
)

describe('customer invoice reverse migration contract', () => {
  it('creates a tenant-scoped durable idempotency ledger', () => {
    expect(migrationSql).toContain(
      'create type public.customer_invoice_reverse_request_state'
    )
    expect(migrationSql).toContain(
      'create table if not exists public.customer_invoice_reverse_requests'
    )
    expect(migrationSql).toContain(
      'ux_customer_invoice_reverse_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'customer_invoice_reverse_requests_state_payload'
    )
  })

  it('forces service-only access and tenant-composite foreign keys', () => {
    expect(migrationSql).toMatch(
      /customer_invoice_reverse_requests_invoice_tenant_fk[\s\S]*?foreign key \(tenant_id, invoice_id\)[\s\S]*?references public\.invoices \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /customer_invoice_reverse_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.customer_invoice_reverse_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.customer_invoice_reverse_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toContain(
      'grant all privileges on table public.customer_invoice_reverse_requests'
    )
  })
})
