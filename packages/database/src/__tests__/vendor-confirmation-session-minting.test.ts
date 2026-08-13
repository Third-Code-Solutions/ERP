import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../../../supabase/migrations/20260803160000_vendor_confirmation_session_minting.sql',
    import.meta.url
  ),
  'utf8'
)

describe('supplier confirmation session minting migration', () => {
  it('associates a session with the workflow request and protects pending PO uniqueness', () => {
    expect(migration).toContain(
      'add column if not exists source_workflow_request_id uuid'
    )
    expect(migration).toContain(
      'ux_vendor_confirmation_sessions_tenant_source_request'
    )
    expect(migration).toContain(
      'ux_vendor_confirmation_sessions_pending_tenant_po'
    )
    expect(migration).toContain(
      'references public.purchase_order_workflow_requests (tenant_id, id)'
    )
  })

  it('keeps the migration source-only and the token secret outside the schema', () => {
    expect(migration).toContain('raw URL token is derived')
    expect(migration).not.toMatch(/token\s+varchar/i)
    expect(migration).not.toMatch(/token_secret/i)
  })
})
