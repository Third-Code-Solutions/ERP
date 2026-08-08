import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cortexAssistantProviderCircuitAlerts } from '../schema/cortex-assistant-provider-circuit-alert'

const migration = readFileSync(
  resolve(
    process.cwd(),
    '../../supabase/migrations/20260808140000_cortex_assistant_provider_circuit_alerts.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex provider circuit alert schema', () => {
  it('keeps transition evidence service-only and aggregate-only', () => {
    expect(migration).toContain(
      'create table public.cortex_assistant_provider_circuit_alerts'
    )
    expect(migration).toContain(
      'cortex_asst_provider_alert_policy_tenant_fk'
    )
    expect(migration).toContain(
      'cortex_asst_provider_alert_source_tenant_fk'
    )
    expect(migration).toContain(
      'alter table public.cortex_assistant_provider_circuit_alerts force row level security'
    )
    expect(migration).toContain(
      'revoke all privileges on table public.cortex_assistant_provider_circuit_alerts'
    )
    expect(migration).not.toContain('insert into')
    expect(migration).not.toContain('prompt')
    expect(migration).not.toContain('response')
  })

  it('deduplicates transition and recovery source identity per tenant', () => {
    expect(migration).toContain(
      'ux_cortex_asst_provider_alert_event'
    )
    expect(migration).toContain(
      'ux_cortex_asst_provider_alert_source_event'
    )
    expect(
      cortexAssistantProviderCircuitAlerts.event_key.name
    ).toBe('event_key')
    expect(
      cortexAssistantProviderCircuitAlerts.source_event_id.name
    ).toBe('source_event_id')
    expect(cortexAssistantProviderCircuitAlerts.status.name).toBe('status')
  })
})
