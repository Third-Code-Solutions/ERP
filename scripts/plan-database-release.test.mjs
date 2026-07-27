import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeLedger,
  releaseGatePassed,
  scanSqlRisk,
  sha256,
  stripSqlComments,
} from './lib/database-release-plan.mjs'

test('classifies a current ledger', () => {
  assert.deepEqual(
    analyzeLedger(['1', '2'], ['1', '2']),
    {
      status: 'current',
      isLinearPrefix: true,
      missing: [],
      unexpected: [],
      appliedAfterFirstGap: [],
    }
  )
})

test('classifies a linear missing suffix as review required', () => {
  const result = analyzeLedger(['1', '2', '3'], ['1'])
  assert.equal(result.status, 'review_required')
  assert.equal(result.isLinearPrefix, true)
  assert.deepEqual(result.missing, ['2', '3'])
})

test('blocks non-linear applied history', () => {
  const result = analyzeLedger(
    ['1', '2', '3', '4'],
    ['1', '3', '4']
  )
  assert.equal(result.status, 'blocked_non_linear_history')
  assert.equal(result.isLinearPrefix, false)
  assert.deepEqual(result.missing, ['2'])
  assert.deepEqual(result.appliedAfterFirstGap, ['3', '4'])
})

test('blocks unexpected migration history', () => {
  const result = analyzeLedger(['1', '2'], ['1', '9'])
  assert.equal(result.status, 'blocked_unexpected_history')
  assert.deepEqual(result.unexpected, ['9'])
})

test('ignores comments and flags conservative SQL risks', () => {
  const source = `
    -- DROP TABLE ignored_comment;
    /* DELETE FROM ignored_block_comment; */
    UPDATE public.projects SET name = 'x';
    DROP POLICY project_read ON public.projects;
  `
  assert.equal(stripSqlComments(source).includes('ignored_comment'), false)
  assert.deepEqual(scanSqlRisk(source), [
    'drop-object',
    'rewrite-data',
  ])
})

test('produces stable SHA-256 evidence', () => {
  assert.equal(
    sha256('third-code-erp'),
    '57446bf40cef0234b51bf785d2d539da9405e1501548cd65cfc89172f7a9615c'
  )
})

test('requires both a current ledger and zero release blockers', () => {
  assert.equal(releaseGatePassed('current', []), true)
  assert.equal(
    releaseGatePassed('current', ['target is not PostgreSQL 17']),
    false
  )
  assert.equal(
    releaseGatePassed('blocked_non_linear_history', []),
    false
  )
})
