import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAuditRecoveryBlockers,
  isUuid,
  opaqueRef,
} from './lib/audit-recovery-plan.mjs'

function clearReport() {
  return {
    database: { postgresMajor: 17 },
    target: { tenantExists: true },
    audit: { rows: 4, linkMismatches: 0, hashMismatches: 0 },
    controls: {
      auditFunctionHardened: true,
      auditFunctionNotPublic: true,
    },
  }
}

test('accepts canonical tenant UUIDs only', () => {
  assert.equal(
    isUuid('123e4567-e89b-42d3-a456-426614174000'),
    true
  )
  assert.equal(isUuid('not-a-uuid'), false)
  assert.equal(
    isUuid('123e4567-e89b-02d3-a456-426614174000'),
    false
  )
})

test('keeps tenant references opaque and stable', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000'
  assert.equal(opaqueRef(uuid), opaqueRef(uuid))
  assert.equal(opaqueRef(uuid).length, 12)
  assert.equal(opaqueRef(uuid).includes(uuid), false)
})

test('returns no blockers for a clear audit target', () => {
  assert.deepEqual(buildAuditRecoveryBlockers(clearReport()), [])
})

test('blocks every historical or control failure', () => {
  const report = clearReport()
  report.database.postgresMajor = 16
  report.target.tenantExists = false
  report.audit.rows = 0
  report.audit.linkMismatches = 2
  report.audit.hashMismatches = 151
  report.controls.auditFunctionHardened = false
  report.controls.auditFunctionNotPublic = false

  assert.deepEqual(buildAuditRecoveryBlockers(report), [
    'target is not PostgreSQL 17',
    'tenant does not exist',
    'tenant has no audit root',
    'tenant audit predecessor chain is discontinuous',
    'tenant audit hashes do not verify',
    'audit trigger function is not hardened',
    'audit trigger function is executable by public API roles',
  ])
})

