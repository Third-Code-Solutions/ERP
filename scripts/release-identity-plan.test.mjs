import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReleaseIdentityPlan } from './lib/release-identity-plan.mjs'

const candidateSha = 'a'.repeat(40)

function clearInputs() {
  return {
    candidateSha,
    branch: 'agent-02/third-code-erp-landing',
    clean: true,
    webConfig: { git: { deploymentEnabled: false } },
    spend: { status: 'clear', blockers: [] },
    hosted: {
      api: {
        releaseId: 'railway-release-1',
        sourceSha: candidateSha,
        url: 'https://api.example.test',
      },
      web: {
        releaseId: 'vercel-release-1',
        sourceSha: candidateSha,
        url: 'https://app.example.test',
      },
    },
    rollback: {
      api: { releaseId: 'railway-release-0' },
      web: { releaseId: 'vercel-release-0' },
    },
  }
}

test('clears only when both hosted identities and rollback targets match', () => {
  const report = buildReleaseIdentityPlan(clearInputs())
  assert.equal(report.status, 'clear')
  assert.deepEqual(report.blockers, [])
})

test('blocks dirty source even when hosted metadata is complete', () => {
  const input = clearInputs()
  input.clean = false
  const report = buildReleaseIdentityPlan(input)
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /working tree is dirty/)
})

test('blocks missing hosted identities and rollback targets', () => {
  const input = clearInputs()
  input.hosted.api.releaseId = null
  input.hosted.web.sourceSha = null
  input.rollback.api.releaseId = null
  input.rollback.web.releaseId = null
  const report = buildReleaseIdentityPlan(input)
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /api: hosted release identity is missing/)
  assert.match(report.blockers.join('\n'), /web: hosted source SHA is missing/)
  assert.match(report.blockers.join('\n'), /api: rollback release identity is missing/)
})

test('blocks a hosted source SHA that differs from candidate', () => {
  const input = clearInputs()
  input.hosted.web.sourceSha = 'b'.repeat(40)
  const report = buildReleaseIdentityPlan(input)
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /web: hosted source SHA does not match/)
})

test('blocks enabled Vercel Git and non-clear spend guard', () => {
  const input = clearInputs()
  input.webConfig.git.deploymentEnabled = true
  input.spend = { status: 'review_required', blockers: ['budget'] }
  const report = buildReleaseIdentityPlan(input)
  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /Vercel Git deployment guard/)
  assert.match(report.blockers.join('\n'), /provider spend guard/)
})
