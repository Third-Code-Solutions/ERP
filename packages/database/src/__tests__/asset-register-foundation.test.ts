import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { assets } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260806110000_asset_register_foundation.sql'
  ),
  'utf8'
).toLowerCase()

describe('Operational asset register foundation', () => {
  it('defines a bounded tenant-scoped operational register', () => {
    expect(migrationSql).toContain('create table if not exists public.assets')
    expect(migrationSql).toContain('create type public.asset_kind')
    expect(migrationSql).toContain('create type public.asset_status')
    expect(migrationSql).toContain('assets_asset_tag_nonempty')
    expect(migrationSql).toContain('assets_retired_state')
    expect(migrationSql).toContain('assets_date_order')
  })

  it('keeps assignment and creator references tenant-safe', () => {
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, assigned_project_id\)[\s\S]*?references public\.projects \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(
      getTableConfig(assets).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'assets_assigned_project_tenant_fk',
        'assets_created_by_tenant_fk',
      ])
    )
  })

  it('is service-role-only and audited until an API contract is enabled', () => {
    expect(migrationSql).toContain(
      'create trigger audit_assets'
    )
    expect(migrationSql).toContain(
      'alter table public.assets force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.assets[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toContain(
      'grant all privileges on table public.assets to service_role'
    )
  })

  it('keeps Drizzle indexes aligned with migration names', () => {
    expect(getTableConfig(assets).indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'ux_assets_tenant_id_id',
        'ux_assets_tenant_tag',
        'ux_assets_tenant_serial',
        'idx_assets_tenant_status',
        'idx_assets_tenant_project',
      ])
    )
  })
})
