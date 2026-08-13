import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { userRoleAssignmentRequests } from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260807150000_user_role_assignment_authority.sql'
  ),
  'utf8'
).toLowerCase()

describe('user role assignment authority migration', () => {
  it('defines a durable service-only idempotency ledger', () => {
    expect(migration).toContain(
      'create table if not exists public.user_role_assignment_requests'
    )
    expect(migration).toContain(
      'alter table public.user_role_assignment_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.user_role_assignment_requests\s+from public, anon, authenticated/
    )
    expect(migration).toMatch(
      /grant all privileges on table public\.user_role_assignment_requests\s+to service_role/
    )
  })

  it('removes browser user DML without removing tenant reads', () => {
    expect(migration).toContain(
      'drop policy if exists users_tenant_write on public.users'
    )
    expect(migration).toContain(
      'drop policy if exists users_tenant_update on public.users'
    )
    expect(migration).toMatch(
      /revoke insert, update, delete on table public\.users\s+from public, anon, authenticated/
    )
    expect(migration).toMatch(
      /revoke insert \(id, tenant_id, email, full_name, role, created_at, updated_at\),\s+update \(id, tenant_id, email, full_name, role, created_at, updated_at\)/
    )
    expect(migration).not.toContain('drop policy if exists users_tenant_read')
  })

  it('keeps Drizzle indexes aligned with the migration', () => {
    expect(
      getTableConfig(userRoleAssignmentRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_user_role_assignment_requests_tenant_key',
        'idx_user_role_assignment_requests_tenant_target',
      ])
    )
  })
})
