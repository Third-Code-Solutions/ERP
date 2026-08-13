import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeManagedSupabaseParityReplay,
  describeLocalReplayTarget,
} from './lib/managed-supabase-parity-replay.mjs'

const expectedVersions = ['20260801090000', '20260807150000']

function validInput() {
  return {
    expectedVersions,
    appliedVersions: expectedVersions,
    snapshotAppliedCount: 1,
    snapshotPendingCount: 1,
    postgresMajor: 17,
    duplicatePurchaseOrderGroupCount: 0,
    tenantTablesWithoutRls: 0,
    requiredTables: {
      customer_invoice_draft_create_requests: true,
      user_role_assignment_requests: true,
    },
    managedSurfaces: {
      auth_users: false,
      storage_objects: false,
      vector_type: false,
    },
    anonAuthTenantExecute: false,
    mappingMode: 'synthetic_clone_only',
  }
}

test('accepts an exact PostgreSQL 17 localhost replay', () => {
  const report = analyzeManagedSupabaseParityReplay(validInput())

  assert.equal(report.ok, true)
  assert.equal(report.replayedSuffixCount, 1)
  assert.equal(report.syntheticCloneMapping, true)
  assert.equal(report.ownerMappingApproved, false)
  assert.equal(report.status, 'suffix_replay_verified')
  assert.equal(report.fullManagedParity, false)
  assert.equal(report.releaseReady, false)
  assert.match(report.remainingReleaseBlockers.join('\n'), /auth_users/)
})

test('rejects reordered or incomplete migration history', () => {
  const report = analyzeManagedSupabaseParityReplay({
    ...validInput(),
    appliedVersions: [...expectedVersions].reverse(),
  })

  assert.equal(report.ok, false)
  assert.match(report.errors.join('\n'), /migration 1/)
})

test('rejects undeclared mapping mode and unsafe catalog facts', () => {
  const report = analyzeManagedSupabaseParityReplay({
    ...validInput(),
    mappingMode: undefined,
    duplicatePurchaseOrderGroupCount: 1,
    tenantTablesWithoutRls: 2,
    anonAuthTenantExecute: true,
  })

  assert.equal(report.ok, false)
  assert.match(report.errors.join('\n'), /synthetic_clone_only/)
  assert.match(report.errors.join('\n'), /duplicate Purchase Order/)
  assert.match(report.errors.join('\n'), /without RLS/)
  assert.match(report.errors.join('\n'), /anon can still execute/)
})

test('accepts localhost and rejects remote replay targets', () => {
  assert.equal(
    describeLocalReplayTarget(
      'postgresql://postgres@127.0.0.1:55432/postgres'
    ).ok,
    true
  )
  assert.equal(
    describeLocalReplayTarget('postgresql://postgres@[::1]:55432/postgres').ok,
    true
  )
  const remote = describeLocalReplayTarget(
    'postgresql://postgres@db.example.com:5432/postgres'
  )
  assert.equal(remote.ok, false)
  assert.match(remote.error, /localhost/)
})
