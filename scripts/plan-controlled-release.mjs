#!/usr/bin/env node

/**
 * Read-only controlled release gate.
 *
 * It composes the existing database, duplicate, and audit planners with
 * liveness/readiness checks. It never applies SQL, changes flags, or creates
 * a provider deployment. `--require-clear` exits non-zero unless every gate
 * is green.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildControlledReleasePlan } from './lib/controlled-release-plan.mjs'

const execFileAsync = promisify(execFile)
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const jsonOutput = process.argv.includes('--json')
const requireClear = process.argv.includes('--require-clear')
const skipProviders = process.argv.includes('--skip-providers')
const railwayReadyUrl =
  process.env.RAILWAY_READY_URL ??
  'https://third-code-erp-api-production.up.railway.app/ready'
const vercelReadyUrl =
  process.env.VERCEL_READY_URL ?? 'https://thirdcode-erp.vercel.app/api/ready'

function plannerFailure(name, error) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    status: 'review_required',
    blockers: [`${name} failed to produce a read-only report`],
    error: message.slice(0, 240),
  }
}

async function runPlanner(name, script) {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [join(repoRoot, 'scripts', script), '--json'],
      {
        cwd: repoRoot,
        env: process.env,
        maxBuffer: 4 * 1024 * 1024,
      }
    )
    return JSON.parse(stdout)
  } catch (error) {
    return plannerFailure(name, error)
  }
}

async function providerReady(name, url) {
  const base = { url, revision: null }
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: 'application/json' },
    })
    const payload = await response.json().catch(() => null)
    const ready =
      response.ok &&
      ((name === 'railway' &&
        payload?.status === 'ready' &&
        payload?.database === 'ok' &&
        payload?.redis === 'ok') ||
        (name === 'vercel' &&
          payload?.ok === true &&
          payload?.database === 'up'))
    return {
      ...base,
      status: ready ? 'clear' : 'review_required',
      httpStatus: response.status,
      revision:
        typeof payload?.revision === 'string' ? payload.revision : null,
      blockers: ready
        ? []
        : ['readiness endpoint did not return a ready payload'],
    }
  } catch (error) {
    return {
      ...base,
      status: 'review_required',
      httpStatus: null,
      blockers: ['readiness request failed'],
      error: (error instanceof Error ? error.message : String(error)).slice(
        0,
        240
      ),
    }
  }
}

const databaseReport = await runPlanner(
  'database release planner',
  'plan-database-release.mjs'
)
const duplicateReport = await runPlanner(
  'Purchase Order duplicate planner',
  'plan-purchase-order-duplicates.mjs'
)

let auditReport
if (!process.env.AUDIT_RECOVERY_TENANT_ID) {
  auditReport = {
    status: 'review_required',
    blockers: [
      'AUDIT_RECOVERY_TENANT_ID is required for the controlled release gate',
    ],
    rows: 0,
    linkMismatches: 0,
    hashMismatches: 0,
  }
} else {
  auditReport = await runPlanner(
    'audit recovery planner',
    'plan-audit-recovery.mjs'
  )
}

const providers = skipProviders
  ? {
      railway: {
        status: 'review_required',
        url: railwayReadyUrl,
        httpStatus: null,
        blockers: ['provider checks were explicitly skipped'],
      },
      vercel: {
        status: 'review_required',
        url: vercelReadyUrl,
        httpStatus: null,
        blockers: ['provider checks were explicitly skipped'],
      },
    }
  : Object.fromEntries(
      await Promise.all([
        providerReady('railway', railwayReadyUrl).then((report) => [
          'railway',
          report,
        ]),
        providerReady('vercel', vercelReadyUrl).then((report) => [
          'vercel',
          report,
        ]),
      ])
    )

const report = buildControlledReleasePlan({
  database: {
    status:
      databaseReport.ledger?.status === 'current'
        ? 'current'
        : 'review_required',
    appliedCount: databaseReport.database?.appliedCount,
    migrationCount: databaseReport.repository?.migrationCount,
    missing: databaseReport.ledger?.missing,
    blockers: databaseReport.blockers,
  },
  duplicates: {
    status: duplicateReport.status,
    groups: duplicateReport.duplicates?.groups,
    records: duplicateReport.duplicates?.records,
    blockers: duplicateReport.blockers,
  },
  audit: {
    status: auditReport.status,
    rows: auditReport.audit?.rows ?? auditReport.rows,
    linkMismatches:
      auditReport.audit?.linkMismatches ?? auditReport.linkMismatches,
    hashMismatches:
      auditReport.audit?.hashMismatches ?? auditReport.hashMismatches,
    blockers: auditReport.blockers,
  },
  providers,
})

const output = {
  mode: 'read_only',
  generatedAt: new Date().toISOString(),
  ...report,
}

if (jsonOutput) {
  console.log(JSON.stringify(output, null, 2))
} else {
  console.log('Third Code ERP controlled release plan (READ ONLY)')
  console.log(`Status: ${output.status}`)
  for (const [name, component] of Object.entries(output.components)) {
    if (name === 'providers') continue
    console.log(`${name}: ${component.status}`)
  }
  for (const [name, provider] of Object.entries(output.components.providers)) {
    console.log(`${name}: ${provider.status} (${provider.httpStatus ?? 'no response'})`)
  }
  if (output.blockers.length > 0) {
    console.log('Blockers:')
    for (const blocker of output.blockers) console.log(`- ${blocker}`)
  }
  console.log('No SQL, feature flag, provider setting, or deployment was changed.')
}

if (requireClear && output.status !== 'clear') process.exitCode = 2

