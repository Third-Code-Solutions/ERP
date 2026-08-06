import assert from 'node:assert/strict'
import test from 'node:test'
import { buildControlledReleasePlan } from './lib/controlled-release-plan.mjs'

function clearInputs() {
  return {
    database: {
      status: 'current',
      appliedCount: 58,
      migrationCount: 58,
      missing: [],
      blockers: [],
    },
    duplicates: { status: 'clear', groups: 0, records: 0, blockers: [] },
    audit: {
      status: 'clear',
      rows: 661,
      linkMismatches: 0,
      hashMismatches: 0,
      blockers: [],
    },
    providers: {
      railway: {
        status: 'clear',
        httpStatus: 200,
        url: 'https://api.example.test/ready',
        revision: 'api-sha',
        blockers: [],
      },
      vercel: {
        status: 'clear',
        httpStatus: 200,
        url: 'https://app.example.test/api/ready',
        revision: 'web-sha',
        blockers: [],
      },
    },
    spend: { status: 'clear', blockers: [] },
  }
}

test('returns a clear release only when every component is clear', () => {
  const report = buildControlledReleasePlan(clearInputs())
  assert.equal(report.status, 'clear')
  assert.deepEqual(report.blockers, [])
  assert.equal(report.components.database.appliedCount, 58)
  assert.equal(report.components.audit.rows, 661)
})

test('blocks a non-current database ledger and preserves missing versions', () => {
  const input = clearInputs()
  input.database.status = 'review_required'
  input.database.missing = ['20260801090000']
  input.database.blockers = ['database migration ledger is not current']

  const report = buildControlledReleasePlan(input)
  assert.equal(report.status, 'review_required')
  assert.deepEqual(report.components.database.missing, ['20260801090000'])
  assert.match(report.blockers.join('\n'), /ledger is not current/)
})

test('blocks duplicate data and audit integrity findings together', () => {
  const input = clearInputs()
  input.duplicates = {
    status: 'review_required',
    groups: 1,
    records: 12,
    blockers: ['tenant Purchase Order numbers are not unique'],
  }
  input.audit = {
    status: 'review_required',
    rows: 661,
    linkMismatches: 2,
    hashMismatches: 151,
    blockers: ['tenant audit hashes do not verify'],
  }

  const report = buildControlledReleasePlan(input)
  assert.equal(report.status, 'review_required')
  assert.equal(report.components.duplicates.records, 12)
  assert.equal(report.components.audit.hashMismatches, 151)
  assert.deepEqual(report.blockers, [
    'tenant Purchase Order numbers are not unique',
    'tenant audit hashes do not verify',
  ])
})

test('blocks provider readiness failures without hiding the endpoint identity', () => {
  const input = clearInputs()
  input.providers.vercel = {
    status: 'review_required',
    httpStatus: 302,
    url: 'https://app.example.test/api/ready',
    revision: null,
    blockers: ['readiness endpoint did not return a ready payload'],
  }

  const report = buildControlledReleasePlan(input)
  assert.equal(report.status, 'review_required')
  assert.equal(report.components.providers.vercel.httpStatus, 302)
  assert.match(report.blockers[0] ?? '', /^vercel:/)
})

test('blocks a missing spend guard instead of treating readiness as approval', () => {
  const input = clearInputs()
  input.spend = { status: 'review_required', blockers: [] }

  const report = buildControlledReleasePlan(input)
  assert.equal(report.status, 'review_required')
  assert.deepEqual(report.components.spend, { status: 'review_required' })
  assert.match(report.blockers.join('\n'), /spend: provider spend guard/)
})
