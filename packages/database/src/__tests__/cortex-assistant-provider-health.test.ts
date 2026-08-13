import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderAttempts,
  cortexAssistantProviderPolicies,
} from '../schema/cortex-assistant-provider-budget'

const migration = readFileSync(
  resolve(
    process.cwd(),
    '../../supabase/migrations/20260808130000_cortex_assistant_provider_health.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex assistant provider health schema', () => {
  it('adds bounded circuit policy without enabling a provider', () => {
    expect(migration).toContain(
      'add column circuit_failure_threshold smallint not null default 3'
    )
    expect(migration).toContain(
      'add column circuit_failure_window_seconds integer not null default 300'
    )
    expect(migration).toContain(
      'add column circuit_cooldown_seconds integer not null default 900'
    )
    expect(migration).toContain(
      'cortex_asst_provider_policies_circuit_bounds'
    )
    expect(migration).not.toContain('insert into')
  })

  it('indexes terminal attempts by exact tenant and policy scope', () => {
    expect(migration).toMatch(
      /create index idx_cortex_asst_provider_attempt_terminal[\s\S]*tenant_id,[\s\S]*policy_id,[\s\S]*terminal_at,[\s\S]*id[\s\S]*where status = 'settled'/
    )
  })

  it('keeps Drizzle policy and attempt query support aligned', () => {
    expect(
      cortexAssistantProviderPolicies.circuit_failure_threshold.name
    ).toBe('circuit_failure_threshold')
    expect(
      cortexAssistantProviderPolicies.circuit_failure_window_seconds.name
    ).toBe('circuit_failure_window_seconds')
    expect(
      cortexAssistantProviderPolicies.circuit_cooldown_seconds.name
    ).toBe('circuit_cooldown_seconds')
    expect(cortexAssistantProviderAttempts.terminal_at.name).toBe(
      'terminal_at'
    )
  })
})
