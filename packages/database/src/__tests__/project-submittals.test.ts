import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations/20260910140000_project_submittals.sql'), 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

describe('project submittals migration', () => {
  it('creates a tenant/project document-control register with lifecycle checks', () => {
    expect(migrationSql).toContain('create table if not exists public.project_submittals')
    expect(migrationSql).toContain('constraint project_submittals_project_tenant_fk foreign key (tenant_id, project_id)')
    expect(migrationSql).toContain('ux_project_submittals_tenant_project_number')
    expect(migrationSql).toContain('project_submittals_lifecycle_metadata_consistent')
  })

  it('forces RLS, denies direct clients, and protects approved records', () => {
    expect(migrationSql).toContain('alter table public.project_submittals force row level security')
    expect(migrationSql).toContain('revoke all privileges on table public.project_submittals from public, anon, authenticated')
    expect(migrationSql).toContain('project_submittals_deny_direct_client_access')
    expect(migrationSql).toContain('prevent_approved_project_submittal_update')
    expect(migrationSql).toContain('audit_project_submittals')
  })

  it('contains no destructive operation and is transactional', () => {
    expect(migrationSql).not.toMatch(/\bdrop\s+(table|column|type)\b/)
    expect(migrationSql.startsWith('begin;')).toBe(true)
    expect(migrationSql.endsWith('commit;')).toBe(true)
  })
})
