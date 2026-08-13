import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { togalBomCommitRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260806140000_togal_bom_commit_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('Togal BOM commit idempotency foundation', () => {
  it('creates bounded tenant-scoped replay evidence', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.togal_bom_commit_requests'
    )
    expect(migrationSql).toContain(
      'ux_togal_bom_commit_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'togal_bom_commit_requests_state_payload'
    )
  })

  it('enforces composite tenant parents and browser privilege revocation', () => {
    expect(migrationSql).toMatch(
      /togal_bom_commit_requests_bom_tenant_fk[\s\S]*?foreign key \(tenant_id, bom_id\)[\s\S]*?references public\.boms \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /togal_bom_commit_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.togal_bom_commit_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.togal_bom_commit_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and foreign keys aligned with migration names', () => {
    expect(
      getTableConfig(togalBomCommitRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_togal_bom_commit_requests_tenant_key',
        'idx_togal_bom_commit_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(togalBomCommitRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'togal_bom_commit_requests_bom_tenant_fk',
        'togal_bom_commit_requests_created_by_tenant_fk',
      ])
    )
  })
})
