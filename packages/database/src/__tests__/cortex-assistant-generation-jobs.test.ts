import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  cortexAssistantGenerationJobs,
  cortexAssistantTurnRequests,
} from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260808090000_cortex_assistant_generation_jobs.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex assistant generation job migration', () => {
  it('defines forced-RLS service-only durable job state', () => {
    expect(migration).toContain(
      'create table if not exists public.cortex_assistant_generation_jobs'
    )
    expect(migration).toContain(
      'alter table public.cortex_assistant_generation_jobs force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.cortex_assistant_generation_jobs\s+from public, anon, authenticated/
    )
    expect(migration).toMatch(
      /grant all privileges on table public\.cortex_assistant_generation_jobs\s+to service_role/
    )
  })

  it('binds each job to one tenant-scoped assistant request', () => {
    const requestIndexes = getTableConfig(cortexAssistantTurnRequests).indexes.map(
      (index) => index.config.name
    )
    const jobIndexes = getTableConfig(cortexAssistantGenerationJobs).indexes.map(
      (index) => index.config.name
    )
    expect(requestIndexes).toContain(
      'ux_cortex_assistant_turn_requests_tenant_id_id'
    )
    expect(jobIndexes).toEqual(
      expect.arrayContaining([
        'ux_cortex_assistant_generation_jobs_tenant_id_id',
        'ux_cortex_assistant_generation_jobs_tenant_request',
        'idx_cortex_assistant_generation_jobs_tenant_status',
      ])
    )
    expect(migration).toContain(
      'references public.cortex_assistant_turn_requests(tenant_id, id)'
    )
  })

  it('bounds retries and requires terminal timestamps', () => {
    expect(migration).toContain(
      'constraint cortex_assistant_generation_jobs_attempt_bounds check'
    )
    expect(migration).toMatch(/attempt_count between 0 and 3/)
    expect(migration).toMatch(
      /status in \('failed', 'cancelled'\)[\s\S]*completed_at is not null[\s\S]*failure_code is not null/
    )
  })
})
