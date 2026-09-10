import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260910100000_inspection_rfi_resolution_authority.sql',
  ),
  'utf8',
)
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

describe('inspection RFI resolution authority migration', () => {
  it('revokes direct table and column UPDATE and keeps tenant RLS forced', () => {
    expect(migrationSql).toContain(
      'alter table public.site_inspection_rfis enable row level security;',
    )
    expect(migrationSql).toContain(
      'alter table public.site_inspection_rfis force row level security;',
    )
    expect(migrationSql).toContain(
      'revoke update on table public.site_inspection_rfis from public, anon, authenticated;',
    )
    expect(migrationSql).toContain(
      'revoke update ( id, tenant_id, inspection_id, description, priority, resolved_at, resolved_by, created_at ) on public.site_inspection_rfis from public, anon, authenticated;',
    )
  })

  it('denies client UPDATE even if table privileges are restored later', () => {
    expect(migrationSql).toContain(
      'create policy site_inspection_rfis_deny_client_update on public.site_inspection_rfis as restrictive for update to anon, authenticated using (false) with check (false);',
    )
  })

  it('adds an open-state INSERT gate without replacing tenant policies', () => {
    expect(migrationSql).toContain(
      'create policy site_inspection_rfis_client_insert_open on public.site_inspection_rfis as restrictive for insert to authenticated with check ( tenant_id = public.auth_tenant_id() and resolved_at is null and resolved_by is null );',
    )
    expect(migrationSql).not.toMatch(/drop\s+policy|alter\s+policy/)
    expect(migrationSql).not.toMatch(/revoke\s+(?:all|insert|select)/)
  })

  it('preserves inspection/photo access, audit infrastructure and server role identity', () => {
    expect(migrationSql).not.toMatch(/public\.site_inspections\b|public\.site_inspection_photos\b/)
    expect(migrationSql).not.toMatch(/audit_log|trigger|request\.jwt|auth\.role/)
    expect(migrationSql).not.toMatch(/drop\s+(?:table|column)|delete\s+from|grant\s+/)
    expect(migrationSql.startsWith('begin;')).toBe(true)
    expect(migrationSql.endsWith('commit;')).toBe(true)
  })
})
