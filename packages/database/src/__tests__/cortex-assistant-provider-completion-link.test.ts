import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderAttempts,
  cortexAssistantTurnRequests,
} from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260808110000_cortex_assistant_provider_completion_link.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex assistant provider completion authority migration', () => {
  it('binds one official completion to one tenant provider attempt', () => {
    expect(migration).toContain('add column provider_attempt_id uuid')
    expect(migration).toContain(
      'create unique index ux_cortex_asst_turn_requests_provider_attempt'
    )
    expect(migration).toMatch(
      /foreign key \(tenant_id, provider_attempt_id\)[\s\S]*references public\.cortex_assistant_provider_attempts\(tenant_id, id\)/
    )
    expect(migration).toContain('provider completion authority is immutable')
    expect(migration).toContain(
      'before insert or update on public.cortex_assistant_turn_requests'
    )
  })

  it('accepts only a settled successful current attempt with matching model', () => {
    expect(migration).toContain("attempt.status = 'settled'")
    expect(migration).toContain("attempt.outcome_code = 'provider_succeeded'")
    expect(migration).toContain(
      'job.attempt_count = attempt.attempt_number'
    )
    expect(migration).toContain('job.request_id = new.id')
    expect(migration).toContain('policy.model = new.model')
    expect(migration).toContain(
      'provider completion attempt is not settled current authority'
    )
  })

  it('keeps deterministic and provider authority mutually exclusive', () => {
    expect(migration).toMatch(
      /outcome = 'provider_grounded' and provider_attempt_id is not null/
    )
    expect(migration).toMatch(
      /outcome <> 'provider_grounded' and provider_attempt_id is null/
    )
  })

  it('aligns Drizzle authority columns and indexes', () => {
    const attempts = getTableConfig(cortexAssistantProviderAttempts)
    const requests = getTableConfig(cortexAssistantTurnRequests)
    expect(attempts.indexes.map((index) => index.config.name)).toContain(
      'ux_cortex_asst_provider_attempt_tenant_id'
    )
    expect(requests.indexes.map((index) => index.config.name)).toContain(
      'ux_cortex_asst_turn_requests_provider_attempt'
    )
    expect(requests.columns.map((column) => column.name)).toContain(
      'provider_attempt_id'
    )
  })
})
