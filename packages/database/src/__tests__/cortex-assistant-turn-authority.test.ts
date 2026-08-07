import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { cortexAssistantTurnRequests } from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260807190000_cortex_assistant_turn_authority.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex assistant-turn authority migration', () => {
  it('defines a forced-RLS service-only generation ledger', () => {
    expect(migration).toContain(
      'create table if not exists public.cortex_assistant_turn_requests'
    )
    expect(migration).toContain(
      'alter table public.cortex_assistant_turn_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.cortex_assistant_turn_requests\s+from public, anon, authenticated/
    )
    expect(migration).toMatch(
      /grant all privileges on table public\.cortex_assistant_turn_requests\s+to service_role/
    )
  })

  it('binds one durable generation to one tenant user message', () => {
    const indexes = getTableConfig(cortexAssistantTurnRequests).indexes.map(
      (index) => index.config.name
    )
    expect(indexes).toEqual(
      expect.arrayContaining([
        'ux_cortex_assistant_turn_requests_tenant_user_key',
        'ux_cortex_assistant_turn_requests_tenant_user_message',
        'idx_cortex_assistant_turn_requests_tenant_conversation',
        'idx_cortex_assistant_turn_requests_tenant_assistant_message',
      ])
    )
    expect(migration).toContain(
      'foreign key (tenant_id, user_message_id)\n    references public.cortex_messages(tenant_id, id)'
    )
    expect(migration).toContain(
      'foreign key (tenant_id, assistant_message_id)\n    references public.cortex_messages(tenant_id, id)'
    )
    expect(migration).toMatch(
      /ux_cortex_assistant_turn_requests_tenant_user_message[\s\S]*tenant_id,[\s\S]*user_message_id/
    )
  })

  it('requires a lease while processing and a durable result on success', () => {
    expect(migration).toContain(
      'constraint cortex_assistant_turn_requests_state_payload check'
    )
    expect(migration).toMatch(
      /state = 'processing'[\s\S]*completion_hash is null[\s\S]*claim_token_hash is not null[\s\S]*lease_expires_at is not null/
    )
    expect(migration).toMatch(
      /state = 'succeeded'[\s\S]*completion_hash is not null[\s\S]*assistant_message_id is not null[\s\S]*result is not null/
    )
  })
})
