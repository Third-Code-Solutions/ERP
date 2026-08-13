import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { costEntryCreateRequests } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260806100000_cost_entry_create_idempotency.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cost entry creation idempotency foundation', () => {
  it('creates a tenant-scoped replay table with strict state payloads', () => {
    expect(migrationSql).toContain(
      'create table if not exists public.cost_entry_create_requests'
    )
    expect(migrationSql).toContain('cost_entry_create_request_state')
    expect(migrationSql).toContain(
      'ux_cost_entry_create_requests_tenant_key'
    )
    expect(migrationSql).toContain(
      'cost_entry_create_requests_state_payload'
    )
  })

  it('keeps replay records server-only and tenant isolated', () => {
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, cost_entry_id\)[\s\S]*?references public\.cost_entries \(tenant_id, id\)/
    )
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.cost_entry_create_requests force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.cost_entry_create_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and foreign keys aligned with migration names', () => {
    expect(
      getTableConfig(costEntryCreateRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_cost_entry_create_requests_tenant_key',
        'idx_cost_entry_create_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(costEntryCreateRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'cost_entry_create_requests_cost_entry_tenant_fk',
        'cost_entry_create_requests_created_by_tenant_fk',
      ])
    )
  })
})
