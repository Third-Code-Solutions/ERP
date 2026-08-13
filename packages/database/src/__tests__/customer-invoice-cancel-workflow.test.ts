import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260803110000_customer_invoice_cancel_workflow.sql'
  ),
  'utf8'
)

describe('customer invoice cancellation workflow migration', () => {
  it('defines a tenant-scoped durable idempotency ledger', () => {
    expect(migration).toContain('customer_invoice_cancel_request_state')
    expect(migration).toContain(
      'create table if not exists public.customer_invoice_cancel_requests'
    )
    expect(migration).toContain(
      'ux_customer_invoice_cancel_requests_tenant_key'
    )
    expect(migration).toContain(
      'customer_invoice_cancel_requests_state_payload'
    )
  })

  it('keeps authority fields tenant-composite and service-only', () => {
    expect(migration).toMatch(
      /customer_invoice_cancel_requests_invoice_tenant_fk[\s\S]*?foreign key \(tenant_id, invoice_id\)[\s\S]*?references public\.invoices \(tenant_id, id\)/
    )
    expect(migration).toMatch(
      /customer_invoice_cancel_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migration).toContain(
      'alter table public.customer_invoice_cancel_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.customer_invoice_cancel_requests[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toContain(
      'grant all privileges on table public.customer_invoice_cancel_requests'
    )
  })
})
