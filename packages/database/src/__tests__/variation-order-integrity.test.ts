import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/20260910180000_variation_order_integrity.sql', import.meta.url),
  'utf8',
)

describe('variation order integrity migration', () => {
  it('keeps VO references tenant-scoped and the approval state machine database-enforced', () => {
    expect(migration).toContain('variation_orders_project_tenant_fk')
    expect(migration).toContain('variation_orders_time_impact_days_reasonable')
    expect(migration).toContain('guard_variation_order_transition')
    expect(migration).toContain('Finalized variation orders are immutable')
    expect(migration).toContain('alter table public.variation_orders force row level security')
    expect(migration).toContain('audit_variation_orders')
  })
})
