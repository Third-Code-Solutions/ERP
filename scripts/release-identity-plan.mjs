#!/usr/bin/env node

/**
 * Read-only release identity and rollback gate.
 *
 * It records local candidate identity and verifies that hosted API/Web
 * release IDs, matching source SHAs, and rollback targets were explicitly
 * supplied. It never calls a provider, changes flags, runs SQL, or deploys.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReleaseIdentityPlan } from './lib/release-identity-plan.mjs'
import { verifyVercelSpendGuard } from './verify-vercel-spend-guard.mjs'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const jsonOutput = process.argv.includes('--json')
const requireClear = process.argv.includes('--require-clear')

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function envValue(name) {
  const value = process.env[name]?.trim()
  return value || null
}

const candidateSha = git(['rev-parse', 'HEAD'])
const branch = git(['branch', '--show-current'])
const clean = git(['status', '--porcelain']) === ''
const webConfig = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/web/vercel.json'), 'utf8')
)
const spend = verifyVercelSpendGuard(repoRoot)

const hosted = {
  api: {
    releaseId: envValue('THIRD_CODE_API_RELEASE_ID'),
    sourceSha: envValue('THIRD_CODE_API_RELEASE_SHA'),
    url:
      envValue('THIRD_CODE_API_RELEASE_URL') ??
      'https://third-code-erp-api-production.up.railway.app',
  },
  web: {
    releaseId: envValue('THIRD_CODE_WEB_RELEASE_ID'),
    sourceSha: envValue('THIRD_CODE_WEB_RELEASE_SHA'),
    url: envValue('THIRD_CODE_WEB_RELEASE_URL') ?? 'https://thirdcode-erp.vercel.app',
  },
}
const rollback = {
  api: {
    releaseId: envValue('THIRD_CODE_API_ROLLBACK_ID'),
    sourceSha: envValue('THIRD_CODE_API_ROLLBACK_SHA'),
  },
  web: {
    releaseId: envValue('THIRD_CODE_WEB_ROLLBACK_ID'),
    sourceSha: envValue('THIRD_CODE_WEB_ROLLBACK_SHA'),
  },
}

const report = {
  mode: 'read_only',
  generatedAt: new Date().toISOString(),
  ...buildReleaseIdentityPlan({
    candidateSha,
    branch,
    clean,
    hosted,
    rollback,
    spend,
    webConfig,
  }),
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('Third Code ERP release identity plan (READ ONLY)')
  console.log(`Status: ${report.status}`)
  console.log(`Candidate: ${report.candidate.sha}`)
  console.log(`Branch: ${report.candidate.branch}`)
  console.log(`Clean: ${report.candidate.clean}`)
  console.log(`API release: ${report.hosted.api.releaseId ?? 'missing'}`)
  console.log(`Web release: ${report.hosted.web.releaseId ?? 'missing'}`)
  console.log(`API rollback: ${report.rollback.api.releaseId ?? 'missing'}`)
  console.log(`Web rollback: ${report.rollback.web.releaseId ?? 'missing'}`)
  if (report.blockers.length > 0) {
    console.log('Blockers:')
    for (const blocker of report.blockers) console.log(`- ${blocker}`)
  }
  console.log('No provider, SQL, flag, or deployment action was performed.')
}

if (requireClear && report.status !== 'clear') process.exitCode = 2
