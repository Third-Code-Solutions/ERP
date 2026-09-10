import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260910110000_project_rfi_register.sql',
  ),
  'utf8',
)
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

describe('project RFI register migration', () => {
  it('creates a tenant/project-scoped versioned RFI table', () => {
    expect(migrationSql).toContain('create table if not exists public.project_rfis')
    expect(migrationSql).toContain('tenant_id uuid not null references public.tenants(id)')
    expect(migrationSql).toContain('constraint project_rfis_project_tenant_fk foreign key (tenant_id, project_id)')
    expect(migrationSql).toContain('client_request_id uuid')
    expect(migrationSql).toContain('version integer not null default 1')
    expect(migrationSql).toContain('ux_project_rfis_tenant_project_number')
  })

  it('forces RLS and denies direct client access', () => {
    expect(migrationSql).toContain('alter table public.project_rfis enable row level security;')
    expect(migrationSql).toContain('alter table public.project_rfis force row level security;')
    expect(migrationSql).toContain(
      'revoke all privileges on table public.project_rfis from public, anon, authenticated;',
    )
    expect(migrationSql).toContain(
      'create policy project_rfis_deny_direct_client_access on public.project_rfis for all to anon, authenticated using (false) with check (false);',
    )
  })

  it('attaches the append-only audit trigger without destructive operations', () => {
    expect(migrationSql).toContain('create trigger audit_project_rfis')
    expect(migrationSql).toContain('execute function public.audit_log_trigger();')
    expect(migrationSql).not.toMatch(/drop\s+(?:table|column)|delete\s+from/)
    expect(migrationSql.startsWith('begin;')).toBe(true)
    expect(migrationSql.endsWith('commit;')).toBe(true)
  })

  it('keeps response and closed-state metadata database-consistent', () => {
    expect(migrationSql).toContain('project_rfis_response_metadata_consistent')
    expect(migrationSql).toContain('project_rfis_closed_metadata_consistent')
    expect(migrationSql).toContain('project_rfis_answered_state_consistent')
  })
})
