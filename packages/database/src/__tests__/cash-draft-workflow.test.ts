import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260803120000_cash_transaction_draft_workflow.sql'
  ),
  'utf8'
)
const deleteTriggerFix = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../../supabase/migrations/20260811180000_cash_draft_delete_trigger_fix.sql'
  ),
  'utf8'
)

describe('cash draft workflow migration', () => {
  it('defines save/delete actions and durable replay state', () => {
    expect(migration).toContain(
      'cash_transaction_draft_request_action'
    )
    expect(migration).toContain(
      "'save',\n    'delete'"
    )
    expect(migration).toContain(
      'create table if not exists public.cash_transaction_draft_requests'
    )
    expect(migration).toContain(
      'ux_cash_transaction_draft_requests_tenant_key'
    )
    expect(migration).toContain(
      'cash_transaction_draft_requests_state_payload'
    )
  })

  it('retains deleted target UUIDs while keeping authority service-only', () => {
    expect(migration).toContain('cash_transaction_id uuid')
    expect(migration).toMatch(
      /cash_transaction_draft_requests_created_by_tenant_fk[\s\S]*?foreign key \(tenant_id, created_by\)[\s\S]*?references public\.users \(tenant_id, id\)/
    )
    expect(migration).toContain(
      'alter table public.cash_transaction_draft_requests force row level security'
    )
    expect(migration).toMatch(
      /revoke all privileges on table public\.cash_transaction_draft_requests[\s\S]*?from public, anon, authenticated/
    )
  })

  it('preserves draft deletion in the before-delete trigger', () => {
    expect(deleteTriggerFix).toContain("if tg_op = 'DELETE' then")
    expect(deleteTriggerFix).toContain('return old;')
    expect(deleteTriggerFix).toMatch(
      /if tg_op = 'DELETE' then[\s\S]*?return old;[\s\S]*?end if;/
    )
  })
})
