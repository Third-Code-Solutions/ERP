import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260803140000_public_signing_workflow.sql'
  ),
  'utf8'
)

describe('public signing workflow migration', () => {
  it('defines tenant-scoped session replay state and constraints', () => {
    expect(migration).toContain('public_signing_request_state')
    expect(migration).toContain(
      'create table if not exists public.public_signing_requests'
    )
    expect(migration).toContain(
      'ux_public_signing_requests_tenant_key'
    )
    expect(migration).toContain(
      'public_signing_requests_state_payload'
    )
    expect(migration).toContain(
      'references public.signature_sessions(id) on delete cascade'
    )
  })

  it('keeps anonymous replay evidence service-only', () => {
    expect(migration).toContain(
      'alter table public.public_signing_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.public_signing_requests[\s\S]*?from public, anon, authenticated/
    )
  })
})
