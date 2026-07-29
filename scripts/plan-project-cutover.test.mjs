import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProjectCutoverBlockers,
  evidenceDigest,
  isUuid,
  opaqueRef,
} from './lib/project-cutover-plan.mjs'

function readyReport() {
  return {
    database: { postgresMajor: 17 },
    target: {
      tenantExists: true,
      projectExists: true,
      actorExists: true,
      actorRole: 'admin',
      authIdentityExists: true,
    },
    audit: {
      rows: 2,
      linkMismatches: 0,
      hashMismatches: 0,
      projectRows: 1,
    },
    controls: {
      projectAuditTrigger: true,
      auditFunctionHardened: true,
      auditFunctionNotPublic: true,
    },
  }
}

test('accepts canonical UUIDs and rejects malformed selectors', () => {
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

test('creates stable opaque references without exposing the UUID', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000'
  const reference = opaqueRef(uuid)
  assert.equal(reference.length, 12)
  assert.equal(reference.includes(uuid), false)
  assert.equal(reference, opaqueRef(uuid))
})

test('creates an order-independent evidence digest', () => {
  assert.equal(
    evidenceDigest({ status: 'lead', nested: { a: 1, b: 2 } }),
    evidenceDigest({ nested: { b: 2, a: 1 }, status: 'lead' })
  )
})

test('passes only when every cutover control is ready', () => {
  assert.deepEqual(buildProjectCutoverBlockers(readyReport()), [])
})

test('blocks historical audit integrity failures', () => {
  const report = readyReport()
  report.audit.linkMismatches = 2
  report.audit.hashMismatches = 151

  assert.deepEqual(buildProjectCutoverBlockers(report), [
    'tenant audit predecessor chain is discontinuous',
    'tenant audit hashes do not verify',
  ])
})

test('blocks a clean tenant without an authorized operator', () => {
  const report = readyReport()
  report.target.actorExists = false
  report.target.actorRole = null
  report.target.authIdentityExists = false

  assert.deepEqual(buildProjectCutoverBlockers(report), [
    'actor does not exist in the designated tenant',
    'actor has no Supabase Auth identity',
  ])
})
