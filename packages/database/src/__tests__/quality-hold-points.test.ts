import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../supabase/migrations/20260910130000_quality_hold_points.sql',
  ),
  'utf8',
)
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

describe('quality hold point migration', () => {
  it('creates a tenant/project-scoped IWR spine with lifecycle constraints', () => {
    expect(migrationSql).toContain('create table if not exists public.quality_hold_points')
    expect(migrationSql).toContain('constraint quality_hold_points_project_tenant_fk foreign key (tenant_id, project_id)')
    expect(migrationSql).toContain('client_request_id uuid not null')
    expect(migrationSql).toContain('ux_quality_hold_points_tenant_project_number')
    expect(migrationSql).toContain('quality_hold_points_lifecycle_metadata_consistent')
  })

  it('forces RLS and revokes direct client access', () => {
    expect(migrationSql).toContain('alter table public.quality_hold_points enable row level security')
    expect(migrationSql).toContain('alter table public.quality_hold_points force row level security')
    expect(migrationSql).toContain('revoke all privileges on table public.quality_hold_points from public, anon, authenticated')
    expect(migrationSql).toContain('quality_hold_points_deny_direct_client_access')
  })

  it('protects accepted evidence and appends database audit events', () => {
    expect(migrationSql).toContain('prevent_accepted_quality_hold_point_update')
    expect(migrationSql).toContain('accepted quality hold points are immutable')
    expect(migrationSql).toContain('audit_quality_hold_points')
    expect(migrationSql).toContain('public.audit_log_trigger()')
  })

  it('contains no destructive operation', () => {
    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|type)\b/)
    expect(migrationSql.startsWith('begin;')).toBe(true)
    expect(migrationSql.endsWith('commit;')).toBe(true)
  })
})
