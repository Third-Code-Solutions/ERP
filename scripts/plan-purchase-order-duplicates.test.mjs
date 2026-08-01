import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPurchaseOrderDuplicateBlockers,
  opaqueRef,
  parsePositiveLimit,
  statusCounts,
} from './lib/purchase-order-duplicate-plan.mjs'

test('empty duplicate report is clear on PostgreSQL 17', () => {
  assert.deepEqual(
    buildPurchaseOrderDuplicateBlockers({
      database: { postgresMajor: 17 },
      duplicates: { groups: 0, truncated: false },
    }),
    []
  )
})

test('duplicate report blocks release without exposing business values', () => {
  const report = {
    database: { postgresMajor: 17 },
    duplicates: { groups: 1, truncated: false },
  }
  assert.deepEqual(buildPurchaseOrderDuplicateBlockers(report), [
    'tenant Purchase Order numbers are not unique',
  ])
  assert.equal(opaqueRef('tenant:po-number').length, 12)
  assert.notEqual(opaqueRef('tenant:po-number'), 'po-number')
})

test('truncated duplicate reports remain blocked', () => {
  assert.deepEqual(
    buildPurchaseOrderDuplicateBlockers({
      database: { postgresMajor: 17 },
      duplicates: { groups: 2, truncated: true },
    }),
    [
      'tenant Purchase Order numbers are not unique',
      'duplicate report is truncated',
    ]
  )
})

test('status counts and limits are deterministic', () => {
  assert.deepEqual(
    statusCounts([{ status: 'draft' }, { status: 'issued' }, { status: 'draft' }]),
    { draft: 2, issued: 1 }
  )
  assert.equal(parsePositiveLimit(undefined, 25, '--max-groups'), 25)
  assert.equal(parsePositiveLimit('3', 25, '--max-groups'), 3)
  assert.throws(() => parsePositiveLimit('0', 25, '--max-groups'))
})

