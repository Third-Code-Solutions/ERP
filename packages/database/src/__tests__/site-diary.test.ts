import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260910120000_site_diary.sql'),
  'utf8',
)

describe('site diary migration authority', () => {
  it('creates a tenant/project/day spine with uniqueness and version constraints', () => {
    expect(migration).toContain('create table if not exists public.site_diary_entries')
    expect(migration).toContain('foreign key (tenant_id, project_id)')
    expect(migration).toContain('ux_site_diary_entries_tenant_project_date')
    expect(migration).toContain('ux_site_diary_entries_tenant_client_request')
    expect(migration).toContain('site_diary_entries_version_positive')
    expect(migration).toContain('site_diary_entries_submit_metadata_consistent')
  })

  it('denies direct client table access and forces RLS', () => {
    expect(migration).toContain('alter table public.site_diary_entries force row level security')
    expect(migration).toContain('revoke all privileges on table public.site_diary_entries from public, anon, authenticated')
    expect(migration).toContain('site_diary_entries_deny_direct_client_access')
  })

  it('makes submitted entries immutable and audits mutations', () => {
    expect(migration).toContain('prevent_submitted_site_diary_update')
    expect(migration).toContain('Submitted site diary entries are immutable')
    expect(migration).toContain('audit_site_diary_entries')
    expect(migration).toContain('public.audit_log_trigger()')
  })

  it('contains no destructive migration operation', () => {
    expect(migration.toLowerCase()).not.toMatch(/\bdrop\s+(table|column|type)\b/)
  })
})
