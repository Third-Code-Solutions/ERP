import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { cortexSemanticIndexJobs } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260807160000_cortex_semantic_index_jobs.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex semantic index job foundation', () => {
  it('enforces one active tenant job and immutable spend ceilings', () => {
    expect(migrationSql).toContain(
      'create unique index ux_cortex_semantic_index_jobs_one_active_tenant'
    )
    expect(migrationSql).toMatch(
      /where status in \('queued', 'processing'\)/
    )
    expect(migrationSql).toContain('max_nodes = 64')
    expect(migrationSql).toContain('provider_call_count between 0 and 1')
    expect(migrationSql).toContain('attempt_count between 0 and 3')
  })

  it('keeps jobs server-only and tenant-linked to their requester', () => {
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, requested_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'alter table public.cortex_semantic_index_jobs force row level security'
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table public\.cortex_semantic_index_jobs[\s\S]*?from public, anon, authenticated/
    )
  })

  it('keeps Drizzle index and tenant-FK names aligned with SQL', () => {
    const config = getTableConfig(cortexSemanticIndexJobs)
    expect(config.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'ux_cortex_semantic_index_jobs_tenant_idempotency',
        'ux_cortex_semantic_index_jobs_one_active_tenant',
        'idx_cortex_semantic_index_jobs_tenant_status',
      ])
    )
    expect(config.foreignKeys.map((key) => key.getName())).toContain(
      'cortex_semantic_index_jobs_requested_by_tenant_fk'
    )
  })
})
