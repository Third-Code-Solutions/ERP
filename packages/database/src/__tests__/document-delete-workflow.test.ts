import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260803130000_document_delete_workflow.sql'
  ),
  'utf8'
)

describe('document delete workflow migration', () => {
  it('defines durable replay state and tenant idempotency', () => {
    expect(migration).toContain('document_delete_request_state')
    expect(migration).toContain(
      'create table if not exists public.document_delete_requests'
    )
    expect(migration).toContain(
      'ux_document_delete_requests_tenant_key'
    )
    expect(migration).toContain(
      'document_delete_requests_state_payload'
    )
  })

  it('keeps replay target evidence and the table service-only', () => {
    expect(migration).toContain('document_id uuid not null')
    expect(migration).toMatch(
      /document_delete_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migration).toContain(
      'alter table public.document_delete_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.document_delete_requests[\s\S]*?from public, anon, authenticated/
    )
  })
})
