import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { approvalDelegations, tenantMemberships } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260817090000_tenant_membership_delegation_foundation.sql'
  ),
  'utf8'
).toLowerCase()

describe('ADR-022 tenant membership and delegation foundation', () => {
  it('keeps the schema rule-scoped, tenant-safe, and dormant', () => {
    expect(tenantMemberships.user_id.name).toBe('user_id')
    expect(tenantMemberships.is_default.name).toBe('is_default')
    expect(approvalDelegations.approval_rule_id.name).toBe('approval_rule_id')
    expect(approvalDelegations.effective_until.name).toBe('effective_until')

    expect(migration).toContain('create table if not exists public.tenant_memberships')
    expect(migration).toContain('create table if not exists public.approval_delegations')
    expect(migration).toContain('ux_tenant_memberships_tenant_user')
    expect(migration).toContain('approval_delegations_delegator_membership_tenant_fk')
    expect(migration).toContain('approval_delegations_delegate_membership_tenant_fk')
    expect(migration).toContain('approval_delegations_rule_tenant_fk')
    expect(migration).toContain('approval_delegations_not_self')
    expect(migration).toContain('approval_delegations_effective_window')
    expect(migration).toContain('effective_until timestamptz not null')
    expect(migration).toContain('alter table public.tenant_memberships force row level security')
    expect(migration).toContain('alter table public.approval_delegations force row level security')
    expect(migration).toContain('revoke all privileges on table public.tenant_memberships')
    expect(migration).toContain('revoke all privileges on table public.approval_delegations')
    expect(migration).toContain('create policy deny_direct_client_access on public.tenant_memberships')
    expect(migration).toContain('create policy deny_direct_client_access on public.approval_delegations')
    expect(migration).toContain(
      'for all to anon, authenticated using (false) with check (false)'
    )
    expect(migration).toContain('sync_legacy_user_default_membership')
    expect(migration).toContain('audit_tenant_memberships')
    expect(migration).toContain('audit_approval_delegations')
  })

  it('does not activate a new tenant/session authority or use destructive DDL', () => {
    expect(migration).not.toContain('create or replace function public.auth_tenant_id')
    expect(migration).not.toContain('alter table public.approvals')
    expect(migration).toMatch(
      /create or replace function public\.sync_legacy_user_default_membership\(\)[\s\S]*?security definer\s*set search_path = ''/
    )
    expect(migration).not.toMatch(
      /\b(drop|truncate)\s+(table|column|index|constraint|trigger|function)\b/i
    )
  })
})
