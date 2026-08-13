import assert from 'node:assert/strict'
import test from 'node:test'
import {
  requiredTestEnv,
  verifyTurboTestEnv,
} from './verify-turbo-test-cache.mjs'

test('Turbo test task hashes every runtime database and Redis gate', () => {
  const report = verifyTurboTestEnv()
  assert.equal(report.status, 'clear')
  assert.deepEqual(report.missing, [])
  assert.equal(requiredTestEnv.includes('DATABASE_URL'), true)
  assert.equal(requiredTestEnv.includes('REDIS_URL'), true)
})

test('the cache contract reports missing runtime inputs', () => {
  const report = verifyTurboTestEnv({
    tasks: {},
  })
  assert.equal(report.status, 'review_required')
})
