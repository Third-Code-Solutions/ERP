import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  evaluateProductionCiEvidence,
  REQUIRED_CI_JOBS,
} from './lib/production-ci-gate.mjs'

const SHA = 'a'.repeat(40)

function run(overrides = {}) {
  return {
    id: 123,
    head_sha: SHA,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    run_number: 42,
    created_at: '2026-09-20T12:00:00Z',
    ...overrides,
  }
}

function jobs(overrides = {}) {
  return REQUIRED_CI_JOBS.map((name) => ({
    name,
    status: 'completed',
    conclusion: 'success',
    ...overrides[name],
  }))
}

test('accepts exact successful main push CI evidence', () => {
  const result = evaluateProductionCiEvidence({
    sha: SHA,
    workflowRuns: [run()],
    jobs: jobs(),
  })

  assert.equal(result.ok, true)
  assert.equal(result.runId, 123)
  assert.deepEqual(result.jobs, REQUIRED_CI_JOBS)
})

test('uses newest rerun evidence when a release has multiple CI attempts', () => {
  const result = evaluateProductionCiEvidence({
    sha: SHA,
    workflowRuns: [
      run({ id: 123, run_attempt: 1, run_number: 42 }),
      run({ id: 456, run_attempt: 2, run_number: 42 }),
    ],
    jobs: jobs(),
  })

  assert.equal(result.ok, true)
  assert.equal(result.runId, 456)
})

test('rejects missing, mismatched, or non-push release runs', () => {
  const result = evaluateProductionCiEvidence({
    sha: SHA,
    workflowRuns: [
      run({ head_sha: 'b'.repeat(40) }),
      run({ event: 'pull_request' }),
      run({ head_branch: 'release' }),
    ],
    jobs: jobs(),
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'MISSING_RUN')
})

test('rejects pending or failed canonical run before provider mutation', () => {
  const result = evaluateProductionCiEvidence({
    sha: SHA,
    workflowRuns: [run({ status: 'in_progress', conclusion: null })],
    jobs: jobs(),
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'RUN_NOT_GREEN')
})

test('rejects missing or non-green database/browser jobs', () => {
  const missingJobs = jobs()
  missingJobs.splice(missingJobs.findIndex((job) => job.name === 'Database Reproducibility (Postgres 17)'), 1)
  const missing = evaluateProductionCiEvidence({ sha: SHA, workflowRuns: [run()], jobs: missingJobs })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'MISSING_JOBS')

  const failed = evaluateProductionCiEvidence({
    sha: SHA,
    workflowRuns: [run()],
    jobs: jobs({
      'Claim Document Browser Interaction': { conclusion: 'failure' },
    }),
  })
  assert.equal(failed.ok, false)
  assert.equal(failed.code, 'JOB_NOT_GREEN')
})

test('rejects duplicate required job evidence instead of guessing', () => {
  const duplicate = [...jobs(), { ...jobs()[0] }]
  const result = evaluateProductionCiEvidence({ sha: SHA, workflowRuns: [run()], jobs: duplicate })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'DUPLICATE_JOBS')
})

test('production workflow wires exact-SHA gate before provider mutation', async () => {
  const workflow = await readFile(resolve(process.cwd(), '.github/workflows/deploy-production.yml'), 'utf8')
  const gatePosition = workflow.indexOf('Verify hosted CI for exact release SHA')
  const providerMutationPosition = workflow.indexOf('Deploy Nest API to exact Railway service')

  assert.match(workflow, /permissions:[\s\S]*?actions:\s+read/)
  assert.match(workflow, /permissions:[\s\S]*?checks:\s+read/)
  assert.match(workflow, /GITHUB_SHA:\s+\$\{\{ github\.sha \}\}/)
  assert.match(workflow, /pnpm test:production-ci/)
  assert.ok(gatePosition >= 0, 'workflow must mount exact-SHA CI gate')
  assert.ok(providerMutationPosition > gatePosition, 'provider mutation must follow CI gate')
})
