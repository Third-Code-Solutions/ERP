import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260803150000_vendor_confirmation_workflow.sql'
  ),
  'utf8'
)

describe('supplier confirmation workflow migration', () => {
  it('defines explicit response states and tenant-scoped replay evidence', () => {
    expect(migration).toContain('vendor_confirmation_state')
    expect(migration).toContain('vendor_confirmation_request_state')
    expect(migration).toContain(
      'create table if not exists public.vendor_confirmation_sessions'
    )
    expect(migration).toContain(
      'create table if not exists public.vendor_confirmation_requests'
    )
    expect(migration).toContain(
      'ux_vendor_confirmation_requests_tenant_key'
    )
    expect(migration).toContain(
      'vendor_confirmation_sessions_state_response'
    )
    expect(migration).toContain(
      'references public.purchase_orders (tenant_id, id)'
    )
  })

  it('keeps token sessions and replay evidence service-only', () => {
    expect(migration).toMatch(
      /alter table public\.vendor_confirmation_sessions force row level security/
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.vendor_confirmation_sessions[\s\S]*?from public, anon, authenticated/
    )
    expect(migration).toMatch(
      /alter table public\.vendor_confirmation_requests force row level security/
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.vendor_confirmation_requests[\s\S]*?from public, anon, authenticated/
    )
  })
})
