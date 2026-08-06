import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { costEntries, costEntryDeleteRequests } from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260807110000_cost_entry_delete_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('cost entry delete workflow migration', () => {
  it('models a restorable void instead of physical deletion', () => {
    expect(migration).toContain('add column if not exists voided_at')
    expect(migration).toContain('cost_entries_void_state')
    expect(migration).toContain('void_reason is not null')
    expect(migration).toContain('revoke insert, update, delete on table public.cost_entries')
  })

  it('defines tenant-scoped replay and snapshot evidence', () => {
    expect(migration).toContain('cost_entry_delete_request_state')
    expect(migration).toContain(
      'create table if not exists public.cost_entry_delete_requests'
    )
    expect(migration).toContain('snapshot jsonb')
    expect(migration).toContain(
      'cost_entry_delete_requests_state_payload'
    )
    expect(migration).toMatch(
      /foreign key \(tenant_id, cost_entry_id\)[\s\S]*?references public\.cost_entries \(tenant_id, id\)/
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.cost_entry_delete_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle schema aligned with migration names', () => {
    expect(
      getTableConfig(costEntries).indexes.map((index) => index.config.name)
    ).toEqual(expect.arrayContaining(['idx_cost_entries_active_project']))
    expect(
      getTableConfig(costEntryDeleteRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_cost_entry_delete_requests_tenant_key',
        'idx_cost_entry_delete_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(costEntryDeleteRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'cost_entry_delete_requests_cost_entry_tenant_fk',
        'cost_entry_delete_requests_project_tenant_fk',
        'cost_entry_delete_requests_created_by_tenant_fk',
      ])
    )
  })
})
