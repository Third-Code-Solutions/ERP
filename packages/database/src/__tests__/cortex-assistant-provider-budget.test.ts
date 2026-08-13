import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderAttempts,
  cortexAssistantProviderPolicies,
} from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260808100000_cortex_assistant_provider_budget.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex assistant provider budget migration', () => {
  it('defines exact request and daily money ceilings with no seed policy', () => {
    expect(migration).toContain('request_limit_micros bigint not null')
    expect(migration).toContain('daily_limit_micros bigint not null')
    expect(migration).toMatch(
      /daily_limit_micros between request_limit_micros and 999999999999/
    )
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.cortex_assistant_provider_policies/
    )
  })

  it('binds one immutable reservation to tenant, job, and attempt', () => {
    expect(migration).toContain(
      'create unique index ux_cortex_asst_provider_attempt_job_attempt'
    )
    expect(migration).toMatch(
      /foreign key \(tenant_id, job_id\)[\s\S]*references public\.cortex_assistant_generation_jobs\(tenant_id, id\)/
    )
    expect(migration).toContain(
      'provider attempt identity and reservation are immutable'
    )
    expect(migration).toContain(
      'provider policy identity and time are immutable'
    )
    expect(migration).toContain(
      "pg_catalog.timezone('utc', transaction_timestamp())::date"
    )
  })

  it('permits only reserve-dispatch-settle or reserve-release transitions', () => {
    expect(migration).toContain(
      "old.status = 'reserved' and new.status in ('dispatched', 'released')"
    )
    expect(migration).toContain(
      "old.status = 'dispatched' and new.status = 'settled'"
    )
    expect(migration).toContain('same-state provider attempt mutation is forbidden')
    expect(migration).toContain('invalid provider attempt state transition')
  })

  it('keeps both money tables forced-RLS and service-only', () => {
    expect(migration).toContain(
      'create trigger audit_cortex_assistant_provider_policies'
    )
    for (const table of [
      'cortex_assistant_provider_policies',
      'cortex_assistant_provider_attempts',
    ]) {
      expect(migration).toContain(
        `alter table public.${table} force row level security`
      )
      expect(migration).toMatch(
        new RegExp(
          `revoke all privileges on table public\\.${table}\\s+from public, anon, authenticated`
        )
      )
    }
  })

  it('aligns Drizzle indexes and composite foreign keys with SQL', () => {
    const policy = getTableConfig(cortexAssistantProviderPolicies)
    const attempt = getTableConfig(cortexAssistantProviderAttempts)
    expect(policy.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'ux_cortex_asst_provider_policy_tenant_id',
        'ux_cortex_asst_provider_policy_scope',
      ])
    )
    expect(attempt.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'ux_cortex_asst_provider_attempt_job_attempt',
        'idx_cortex_asst_provider_attempt_daily',
      ])
    )
    expect(attempt.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        'cortex_asst_provider_attempts_tenant_job_fk',
        'cortex_asst_provider_attempts_tenant_policy_fk',
      ])
    )
  })
})
