const SHA_PATTERN = /^[0-9a-f]{40}$/

function isSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value)
}

function checkHostedIdentity(name, identity, candidateSha, blockers) {
  if (!identity?.releaseId) {
    blockers.push(`${name}: hosted release identity is missing`)
  }
  if (!isSha(identity?.sourceSha)) {
    blockers.push(`${name}: hosted source SHA is missing or invalid`)
  } else if (identity.sourceSha !== candidateSha) {
    blockers.push(`${name}: hosted source SHA does not match candidate SHA`)
  }
}

function checkRollbackIdentity(name, identity, blockers) {
  if (!identity?.releaseId) {
    blockers.push(`${name}: rollback release identity is missing`)
  }
}

export function buildReleaseIdentityPlan({
  candidateSha,
  branch,
  clean,
  hosted,
  rollback,
  spend,
  webConfig,
}) {
  const blockers = []

  if (!isSha(candidateSha)) blockers.push('candidate source SHA is invalid')
  if (!branch) blockers.push('candidate branch is missing')
  if (clean !== true) blockers.push('source working tree is dirty')
  if (webConfig?.git?.deploymentEnabled !== false) {
    blockers.push('Vercel Git deployment guard is not closed')
  }
  if (spend?.status !== 'clear') {
    blockers.push('provider spend guard is not clear')
  }

  checkHostedIdentity('api', hosted?.api, candidateSha, blockers)
  checkHostedIdentity('web', hosted?.web, candidateSha, blockers)
  checkRollbackIdentity('api', rollback?.api, blockers)
  checkRollbackIdentity('web', rollback?.web, blockers)

  return {
    status: blockers.length === 0 ? 'clear' : 'review_required',
    candidate: {
      sha: candidateSha ?? null,
      branch: branch ?? null,
      clean: clean === true,
    },
    hosted: hosted ?? { api: null, web: null },
    rollback: rollback ?? { api: null, web: null },
    spend: spend ?? { status: 'review_required' },
    blockers,
  }
}
