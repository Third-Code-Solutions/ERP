import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildVercelSpendGuardReport,
  verifyVercelSpendGuard,
} from './verify-vercel-spend-guard.mjs'

test('repository keeps Vercel Git deployments disabled', () => {
  const report = verifyVercelSpendGuard()
  assert.equal(report.status, 'clear')
  assert.deepEqual(report.blockers, [])
})

test('guard blocks an enabled Git deployment', () => {
  const report = buildVercelSpendGuardReport({
    config: { git: { deploymentEnabled: true } },
    automationText: '',
  })
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /deploymentEnabled=false/)
})

test('guard blocks deploy commands in repository automation', () => {
  const report = buildVercelSpendGuardReport({
    config: { git: { deploymentEnabled: false } },
    automationText: 'npx vercel deploy --prod',
  })
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /deploy command/)
})
