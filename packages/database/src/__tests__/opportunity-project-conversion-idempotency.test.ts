import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(
    process.cwd(),
    '..',
    '..',
    'supabase',
    'migrations',
    '20260806150000_opportunity_project_conversion_idempotency.sql'
  ),
  'utf8'
)

describe('Won to Project conversion migration contract', () => {
  it('creates the service-only idempotency ledger with tenant FKs', () => {
    expect(migration).toContain(
      'create table if not exists public.opportunity_project_conversion_requests'
    )
    expect(migration).toContain(
      'opportunity_project_conversion_requests_opportunity_tenant_fk'
    )
    expect(migration).toContain(
      'opportunity_project_conversion_requests_project_tenant_fk'
    )
    expect(migration).toContain(
      'opportunity_project_conversion_requests_checklist_tenant_fk'
    )
    expect(migration).toContain(
      'opportunity_project_conversion_requests_created_by_tenant_fk'
    )
  })

  it('keeps the ledger forced-RLS and service-role-only', () => {
    expect(migration).toContain(
      'alter table public.opportunity_project_conversion_requests force row level security'
    )
    expect(migration).toContain(
      'revoke all privileges on table public.opportunity_project_conversion_requests'
    )
    expect(migration).toContain(
      'grant all privileges on table public.opportunity_project_conversion_requests'
    )
    expect(migration).toContain('to service_role')
  })

  it('enforces processing/succeeded payload states and unique tenant keys', () => {
    expect(migration).toContain(
      'ux_opportunity_project_conversion_requests_tenant_key'
    )
    expect(migration).toContain(
      'opportunity_project_conversion_requests_state_payload'
    )
    expect(migration).toContain(
      'opportunity_project_conversion_requests_completed_after_created'
    )
  })
})
