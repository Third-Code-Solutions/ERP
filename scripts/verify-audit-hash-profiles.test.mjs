import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyAuditHash,
  databaseAuditHash,
  legacyJsonAuditHash,
} from './lib/audit-recovery-plan.mjs'

const base = {
  prevHash: 'genesis',
  entityType: 'projects',
  entityId: '123e4567-e89b-42d3-a456-426614174000',
  action: 'create',
  diff: { status: { before: null, after: 'active' } },
  createdAtIso: '2026-08-01T10:06:26.123Z',
  createdAtText: '2026-08-01 10:06:26.123+00',
}

test('classifies the current database formula', () => {
  assert.equal(
    classifyAuditHash({ ...base, hash: databaseAuditHash(base) }),
    'database'
  )
})

test('classifies the legacy JSON formula', () => {
  assert.equal(
    classifyAuditHash({ ...base, hash: legacyJsonAuditHash(base) }),
    'legacy_json'
  )
})

test('does not classify an unknown hash as a reviewed profile', () => {
  assert.equal(
    classifyAuditHash({ ...base, hash: 'deadbeef'.repeat(8) }),
    'unknown'
  )
})

