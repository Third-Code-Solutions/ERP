import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  platformAuditEvents,
  platformRoleAssignments,
  platformSupportSessions,
  platformUserInvitations,
  tenants,
  users,
} from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260904020000_platform_owner_administration_boundary.sql'
  ),
  'utf8'
).toLowerCase()

describe('ADR-027 platform-owner administration boundary', () => {
  it('keeps platform authority distinct from tenant roles and fixed to one owner', () => {
    expect(platformRoleAssignments.role.enumValues).toEqual(['platform_owner'])
    expect(platformRoleAssignments.user_id.name).toBe('user_id')
    expect(platformRoleAssignments.normalized_email.name).toBe(
      'normalized_email'
    )
    expect(migration).toContain(
      "normalized_email = 'kurt@thirdcodesolutions.com'"
    )
    expect(migration).toContain(
      'create unique index if not exists ux_platform_role_assignments_active_role'
    )
    expect(migration).toContain('where revoked_at is null')
    expect(migration).not.toMatch(
      /alter\s+type\s+public\.role\s+add\s+value[^;]*platform_owner/
    )
  })

  it('requires provider verification, exact email, immutable id, and sole assignment', () => {
    expect(migration).toContain(
      'create or replace function public.is_platform_owner()'
    )
    expect(migration).toContain('assignment.user_id = (select auth.uid())')
    expect(migration).toContain('auth_user.email_confirmed_at is not null')
    expect(migration).toContain(
      'lower(auth_user.email) = assignment.normalized_email'
    )
    expect(migration).toContain(
      'count(*) filter (where assignment.revoked_at is null) = 1'
    )
    expect(migration).toContain("app_user.account_status = 'active'")
    expect(migration).toContain(
      'revoke execute on function public.is_platform_owner()'
    )
    expect(migration).toContain('to authenticated, service_role')
  })

  it('makes suspended users and tenants lose tenant RLS identity', () => {
    expect(tenants.status.name).toBe('status')
    expect(users.account_status.name).toBe('account_status')
    expect(migration).toContain(
      'create or replace function public.auth_tenant_id()'
    )
    expect(migration).toContain("app_user.account_status = 'active'")
    expect(migration).toContain("tenant.status = 'active'")
    expect(migration).toContain(
      'the active platform owner cannot be deleted, suspended, or disabled'
    )
    expect(migration).toContain('before update of account_status or delete')
    expect(migration).toContain(
      'the tenant containing the active platform owner cannot be suspended or disabled'
    )
  })

  it('keeps global platform tables force-RLS and unavailable to browser roles', () => {
    for (const table of [
      'platform_role_assignments',
      'platform_audit_events',
      'platform_support_sessions',
      'platform_user_invitations',
    ]) {
      expect(migration).toContain(
        `alter table public.${table} force row level security`
      )
      expect(migration).toContain(
        `revoke all privileges on table public.${table}`
      )
      expect(migration).toMatch(
        new RegExp(
          `create policy deny_direct_client_access\\s+on public\\.${table}\\s+for all to anon, authenticated using \\(false\\) with check \\(false\\)`
        )
      )
    }
  })

  it('defines append-only audit and bounded explicit support context', () => {
    expect(platformAuditEvents.trace_id.name).toBe('trace_id')
    expect(platformSupportSessions.tenant_id.name).toBe('tenant_id')
    expect(platformSupportSessions.expires_at.name).toBe('expires_at')
    expect(migration).toContain('platform audit events are append-only')
    expect(migration).toContain(
      'before update or delete on public.platform_audit_events'
    )
    expect(migration).toContain(
      "expires_at <= created_at + interval '4 hours'"
    )
    expect(migration).toContain(
      'only ending an active platform support session is allowed'
    )
  })

  it('provisions server-owned invitations before legacy self-signup', () => {
    expect(platformUserInvitations.tenant_id.name).toBe('tenant_id')
    expect(platformUserInvitations.role.name).toBe('role')
    expect(migration).toContain('a_platform_invited_user_provision')
    expect(migration).toContain(
      'from public.platform_user_invitations as candidate'
    )
    expect(migration).toContain("candidate.status = 'pending'")
    expect(migration).toContain("account_status = 'active'")
    expect(migration).toContain(
      'create or replace function public.activate_current_invited_user()'
    )
    expect(migration).toContain('auth_user.email_confirmed_at is not null')
  })
})
