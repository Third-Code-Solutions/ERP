import assert from 'node:assert/strict'
import test from 'node:test'
import { validateManagedSupabaseParityPlan } from './lib/managed-supabase-parity-plan.mjs'

const source = [
  '20260101000000_baseline.sql',
  '20260102000000_second.sql',
  '20260103000000_third.sql',
]

function plan(overrides = {}) {
  return {
    version: 1,
    snapshot: {
      projectRef: 'abcdefghijklmnopqrst',
      appliedCount: 1,
      sourceCount: 3,
      pendingCount: 2,
      appliedHead: '20260101000000',
      sourceHead: '20260103000000',
      ...overrides.snapshot,
    },
    batches: overrides.batches ?? [
      { id: 'first', migrations: ['20260102000000_second.sql'] },
      { id: 'second', migrations: ['20260103000000_third.sql'] },
    ],
  }
}

test('accepts one exact, ordered pending suffix', () => {
  const result = validateManagedSupabaseParityPlan(plan(), source)
  assert.equal(result.ok, true)
  assert.equal(result.pendingCount, 2)
  assert.equal(result.batchCount, 2)
})

test('rejects missing, duplicate, and reordered migrations', () => {
  const missing = validateManagedSupabaseParityPlan(
    plan({ batches: [{ id: 'only', migrations: [source[1]] }] }),
    source
  )
  assert.equal(missing.ok, false)
  assert(
    missing.errors.includes(
      'planned migration count does not match repository suffix'
    )
  )

  const duplicate = validateManagedSupabaseParityPlan(
    plan({
      batches: [
        { id: 'one', migrations: [source[1]] },
        { id: 'two', migrations: [source[1]] },
      ],
    }),
    source
  )
  assert.equal(duplicate.ok, false)
  assert(duplicate.errors.includes('planned migrations must be unique'))

  const reordered = validateManagedSupabaseParityPlan(
    plan({
      batches: [
        { id: 'one', migrations: [source[2]] },
        { id: 'two', migrations: [source[1]] },
      ],
    }),
    source
  )
  assert.equal(reordered.ok, false)
  assert(
    reordered.errors.includes(
      'planned migrations must remain in strict source order'
    )
  )
})

test('rejects stale counts and heads when repository source changes', () => {
  const stale = validateManagedSupabaseParityPlan(plan(), [
    ...source,
    '20260104000000_fourth.sql',
  ])
  assert.equal(stale.ok, false)
  assert(
    stale.errors.includes(
      'snapshot sourceCount does not match repository migrations'
    )
  )
  assert(
    stale.errors.includes('snapshot sourceHead does not match repository head')
  )
  assert(
    stale.errors.includes(
      'snapshot pendingCount does not match repository suffix'
    )
  )
})

test('rejects a boundary that is not a linear repository prefix', () => {
  const invalid = validateManagedSupabaseParityPlan(
    plan({ snapshot: { appliedHead: '20260109999999' } }),
    source
  )
  assert.equal(invalid.ok, false)
  assert(
    invalid.errors.includes(
      'snapshot appliedHead is absent from repository migrations'
    )
  )
})
