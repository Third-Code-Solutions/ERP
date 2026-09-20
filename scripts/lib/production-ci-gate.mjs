export const REQUIRED_CI_JOBS = Object.freeze([
  'Actionlint',
  'BUILD OPS Invariants',
  'Type Check',
  'Lint',
  'Unit Tests',
  'Database Reproducibility (Postgres 17)',
  'Build',
  'Claim Document Browser Interaction',
  'Security Scan',
])

function normalizeSha(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function runSortKey(run) {
  const attempt = Number.isInteger(run?.run_attempt) ? run.run_attempt : 0
  const runNumber = Number.isInteger(run?.run_number) ? run.run_number : 0
  const createdAt = typeof run?.created_at === 'string' ? run.created_at : ''
  return `${String(attempt).padStart(8, '0')}:${String(runNumber).padStart(12, '0')}:${createdAt}`
}

function failure(code, message, details = {}) {
  return { ok: false, code, message, ...details }
}

/**
 * Evaluate the read-only GitHub Actions evidence required before production
 * provider mutation. This deliberately accepts only a successful push run for
 * the exact main-branch release SHA and every required job conclusion.
 */
export function evaluateProductionCiEvidence({ sha, workflowRuns, jobs }) {
  const expectedSha = normalizeSha(sha)
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
    return failure('INVALID_SHA', 'Release SHA must be a 40-character hexadecimal commit SHA')
  }

  const candidates = (Array.isArray(workflowRuns) ? workflowRuns : [])
    .filter((run) => normalizeSha(run?.head_sha) === expectedSha)
    .filter((run) => run?.head_branch === 'main' && run?.event === 'push')
    .sort((left, right) => runSortKey(right).localeCompare(runSortKey(left)))

  if (candidates.length === 0) {
    return failure(
      'MISSING_RUN',
      `No canonical CI push run found for release SHA ${expectedSha}`,
    )
  }

  const run = candidates[0]
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    return failure(
      'RUN_NOT_GREEN',
      `Canonical CI run ${run.id ?? 'unknown'} is ${run.status ?? 'unknown'}/${run.conclusion ?? 'unknown'}`,
      { run },
    )
  }

  const jobRows = Array.isArray(jobs) ? jobs : []
  const missing = REQUIRED_CI_JOBS.filter(
    (name) => !jobRows.some((job) => job?.name === name),
  )
  if (missing.length > 0) {
    return failure(
      'MISSING_JOBS',
      `Canonical CI run is missing required jobs: ${missing.join(', ')}`,
      { run, missing },
    )
  }

  const invalid = REQUIRED_CI_JOBS.flatMap((name) =>
    jobRows
      .filter((job) => job?.name === name)
      .filter((job) => job?.status !== 'completed' || job?.conclusion !== 'success')
      .map((job) => ({ name, status: job?.status ?? 'unknown', conclusion: job?.conclusion ?? 'unknown' })),
  )
  if (invalid.length > 0) {
    return failure(
      'JOB_NOT_GREEN',
      `Required CI jobs are not green: ${invalid.map((job) => `${job.name}=${job.status}/${job.conclusion}`).join(', ')}`,
      { run, invalid },
    )
  }

  const duplicateNames = REQUIRED_CI_JOBS.filter(
    (name) => jobRows.filter((job) => job?.name === name).length !== 1,
  )
  if (duplicateNames.length > 0) {
    return failure(
      'DUPLICATE_JOBS',
      `Canonical CI run has duplicate required jobs: ${duplicateNames.join(', ')}`,
      { run, duplicateNames },
    )
  }

  return {
    ok: true,
    runId: run.id,
    runUrl: run.html_url ?? null,
    sha: expectedSha,
    jobs: REQUIRED_CI_JOBS,
  }
}
