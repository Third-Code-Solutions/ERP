import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { costEntryRestoreRequests } from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260807120000_cost_entry_restore_workflow.sql'
  ),
  'utf8'
).toLowerCase()

describe('cost entry restore workflow migration', () => {
  it('defines a closed-by-default restore replay ledger', () => {
    expect(migration).toContain('cost_entry_restore_request_state')
    expect(migration).toContain(
      'create table if not exists public.cost_entry_restore_requests'
    )
    expect(migration).toContain(
      'cost_entry_restore_requests_state_payload'
    )
    expect(migration).toMatch(
      /foreign key \(tenant_id, cost_entry_id\)[\s\S]*?references public\.cost_entries \(tenant_id, id\)/
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.cost_entry_restore_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle indexes and tenant FKs aligned', () => {
    expect(
      getTableConfig(costEntryRestoreRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_cost_entry_restore_requests_tenant_key',
        'idx_cost_entry_restore_requests_tenant_state',
      ])
    )
    expect(
      getTableConfig(costEntryRestoreRequests).foreignKeys.map((foreignKey) =>
        foreignKey.getName()
      )
    ).toEqual(
      expect.arrayContaining([
        'cost_entry_restore_requests_cost_entry_tenant_fk',
        'cost_entry_restore_requests_project_tenant_fk',
        'cost_entry_restore_requests_created_by_tenant_fk',
      ])
    )
  })
})
