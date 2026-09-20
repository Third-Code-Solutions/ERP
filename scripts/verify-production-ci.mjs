import { execFileSync } from 'node:child_process'

import { evaluateProductionCiEvidence, REQUIRED_CI_JOBS, selectProductionCiRun } from './lib/production-ci-gate.mjs'

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for production CI verification`)
  return value
}

function ghJson(endpoint) {
  const output = execFileSync(
    'gh',
    ['api', endpoint, '--header', 'Accept: application/vnd.github+json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return JSON.parse(output)
}

const sha = requiredEnvironment('GITHUB_SHA').toLowerCase()
const repository = requiredEnvironment('GITHUB_REPOSITORY')
const workflowRuns = ghJson(
  `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${encodeURIComponent(sha)}&per_page=100`,
)
const candidates = Array.isArray(workflowRuns?.workflow_runs) ? workflowRuns.workflow_runs : []
const selected = selectProductionCiRun({ sha, workflowRuns: candidates })

if (!selected?.id) {
  throw new Error(`No canonical CI push run found for release SHA ${sha}`)
}

const jobsResponse = ghJson(`repos/${repository}/actions/runs/${selected.id}/jobs?per_page=100`)
const result = evaluateProductionCiEvidence({
  sha,
  workflowRuns: candidates,
  jobs: Array.isArray(jobsResponse?.jobs) ? jobsResponse.jobs : [],
})

if (!result.ok) throw new Error(result.message)

console.log(
  `Production CI evidence verified: CI run ${result.runId} (${result.sha}) passed ${REQUIRED_CI_JOBS.length} required jobs before provider mutation`,
)
