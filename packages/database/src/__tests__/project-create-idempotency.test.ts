import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { projectCreateRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260804090000_project_create_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('Project creation idempotency foundation', () => {
  it('creates one tenant-scoped replay table with strict state payloads', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.project_create_requests'
    )
    expect(migrationSql).toContain('project_create_request_state')
    expect(migrationSql).toContain(
      'ux_project_create_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'project_create_requests_state_payload'
    )
    expect(migrationSql).toContain(
      'project_create_requests_project_tenant_fk'
    )
  })

  it('keeps replay records server-only and tenant isolated', () => {
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, project_id\)[\s\S]*?references public\.projects \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.project_create_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.project_create_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and foreign keys aligned with migration names', () => {
    expect(
      getTableConfig(projectCreateRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_project_create_requests_tenant_key',
        'idx_project_create_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(projectCreateRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'project_create_requests_project_tenant_fk',
        'project_create_requests_created_by_tenant_fk',
      ])
    )
  })
})
