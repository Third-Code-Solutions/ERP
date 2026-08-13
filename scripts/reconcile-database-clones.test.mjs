import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalize,
  diffRecords,
  hasDrift,
  recordKey,
  summarizeDiff,
} from './lib/database-reconciliation.mjs'

test('canonicalize makes object keys and set-like arrays deterministic', () => {
  assert.equal(
    JSON.stringify(canonicalize({ roles: ['authenticated', 'anon'], a: 1 })),
    JSON.stringify({ a: 1, roles: ['anon', 'authenticated'] })
  )
})

test('diffRecords separates missing, extra, and changed records', () => {
  const diff = diffRecords(
    [
      { id: 'same', value: 1 },
      { id: 'changed', value: 1 },
      { id: 'missing', value: 1 },
    ],
    [
      { id: 'same', value: 1 },
      { id: 'changed', value: 2 },
      { id: 'extra', value: 1 },
    ],
    ['id']
  )
  assert.deepEqual(diff.missingInRight, [{ id: 'missing', value: 1 }])
  assert.deepEqual(diff.extraInRight, [{ id: 'extra', value: 1 }])
  assert.equal(diff.changed.length, 1)
  assert.equal(hasDrift(summarizeDiff(diff)), true)
  assert.equal(recordKey({ id: 'same', value: 1 }, ['id']), 'same')
})

test('summarizeDiff caps samples without hiding counts', () => {
  const diff = diffRecords(
    Array.from({ length: 3 }, (_, index) => ({ id: String(index) })),
    [],
    ['id']
  )
  const summary = summarizeDiff(diff, 2)
  assert.equal(summary.missingInRight, 3)
  assert.equal(summary.samples.missingInRight.length, 2)
})
