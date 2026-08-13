import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { cortexConversationTurnRequests } from '../schema'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260807170000_cortex_conversation_user_turn_authority.sql'
  ),
  'utf8'
).toLowerCase()

describe('Cortex conversation user-turn authority migration', () => {
  it('defines a forced-RLS service-only replay ledger', () => {
    expect(migration).toContain(
      'create table if not exists public.cortex_conversation_turn_requests'
    )
    expect(migration).toContain(
      'alter table public.cortex_conversation_turn_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.cortex_conversation_turn_requests\s+from public, anon, authenticated/
    )
    expect(migration).toMatch(
      /grant all privileges on table public\.cortex_conversation_turn_requests\s+to service_role/
    )
  })

  it('scopes idempotency by tenant and user', () => {
    expect(migration).toMatch(
      /ux_cortex_conversation_turn_requests_tenant_user_key[\s\S]*tenant_id,[\s\S]*user_id,[\s\S]*idempotency_key/
    )
    expect(
      getTableConfig(cortexConversationTurnRequests).indexes.map(
        (index) => index.config.name
      )
    ).toEqual(
      expect.arrayContaining([
        'ux_cortex_conversation_turn_requests_tenant_user_key',
        'idx_cortex_conversation_turn_requests_tenant_conversation',
      ])
    )
    expect(migration).toContain(
      'foreign key (tenant_id, user_id)\n    references public.users(tenant_id, id)'
    )
    expect(migration).toContain(
      'foreign key (tenant_id, conversation_id)\n    references public.cortex_conversations(tenant_id, id)'
    )
    expect(migration).toContain(
      'foreign key (tenant_id, message_id)\n    references public.cortex_messages(tenant_id, id)'
    )
  })
})
