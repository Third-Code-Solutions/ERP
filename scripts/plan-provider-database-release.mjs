#!/usr/bin/env node

/**
 * Read-only database release plan for the provider-linked source.
 *
 * The Supabase project is linked to Git ref `main`, so this planner reads
 * migrations from local `origin/main` instead of assuming the current dirty
 * workspace is the provider source. It never applies SQL or changes Git.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { analyzeLedger, scanSqlRisk, sha256 } from './lib/database-release-plan.mjs'
import { summarizeProviderSource } from './lib/provider-source-plan.mjs'

const repoRoot = process.cwd()
const jsonOutput = process.argv.includes('--json')
const requireReady = process.argv.includes('--require-ready')
const databaseUrl = process.env.DATABASE_URL?.trim()

if (!databaseUrl) {
  console.error('DATABASE_URL is required for read-only provider-source planning')
  process.exit(2)
}

function git(args, { trim = true } = {}) {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return trim ? output.trim() : output
}

function loadProviderMigrations() {
  const paths = git([
    'ls-tree',
    '-r',
    '--name-only',
    'origin/main',
    '--',
    'supabase/migrations',
  ])
    .split(/\r?\n/)
    .filter((path) => path.endsWith('.sql'))
    .sort()

  return paths.map((path) => {
    const filename = path.slice(path.lastIndexOf('/') + 1)
    const match = filename.match(/^(\d{14})_[a-z0-9_]+\.sql$/)
    if (!match) throw new Error(`Invalid provider migration filename: ${filename}`)
    const source = git(['show', `origin/main:${path}`], { trim: false })
    return {
      version: match[1],
      filename,
      bytes: Buffer.byteLength(source),
      sha256: sha256(source),
      sqlRisk: scanSqlRisk(source),
    }
  })
}

const requireFromDatabasePackage = createRequire(
  join(repoRoot, 'packages', 'database', 'package.json')
)
const postgres = requireFromDatabasePackage('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})

try {
  const migrations = loadProviderMigrations()
  const [server] = await sql.unsafe('show server_version_num')
  const appliedRows = await sql.unsafe(
    `select version::text
       from supabase_migrations.schema_migrations
      order by version`
  )
  const duplicateRows = await sql.unsafe(
    `select tenant_id::text as tenant_id,
            po_number,
            count(*)::int as row_count
       from public.purchase_orders
      where po_number is not null
      group by tenant_id, po_number
      having count(*) > 1
      order by row_count desc, tenant_id, po_number`
  )
  const appliedVersions = appliedRows.map((row) => row.version)
  const ledger = analyzeLedger(
    migrations.map((migration) => migration.version),
    appliedVersions
  )
  const duplicatePurchaseOrderGroups = duplicateRows.map((row, index) => ({
    group: index + 1,
    tenantId: row.tenant_id,
    poNumber: row.po_number,
    rowCount: Number(row.row_count),
  }))
  const report = summarizeProviderSource({
    migrations,
    appliedVersions,
    duplicatePurchaseOrderGroups,
  })
  report.ledger = ledger
  report.database = {
    postgresMajor: Math.floor(Number(server?.server_version_num ?? 0) / 10_000),
  }
  report.sourceCommit = git(['rev-parse', 'origin/main'])
  report.blockers = [
    ...(ledger.unexpected.length > 0
      ? ['unexpected migration versions exist in the target']
      : []),
    ...(ledger.appliedAfterFirstGap.length > 0
      ? ['target history is non-linear']
      : []),
    ...(ledger.missing.length > 0
      ? [`${ledger.missing.length} provider migrations are not applied`]
      : []),
    ...(duplicatePurchaseOrderGroups.length > 0
      ? [
          `${duplicatePurchaseOrderGroups.length} duplicate tenant Purchase Order number group(s) block the first pending migration`,
        ]
      : []),
    ...(report.database.postgresMajor !== 17
      ? ['target is not PostgreSQL 17']
      : []),
  ]
  report.ready = report.blockers.length === 0

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('ABI OPS provider-source database plan (READ ONLY)')
    console.log(`Provider source commit: ${report.sourceCommit}`)
    console.log(
      `PostgreSQL: ${report.database.postgresMajor}; applied: ${report.appliedCount}/${report.sourceCount}`
    )
    console.log(
      `Applied head: ${report.appliedHead ?? 'none'}; source head: ${report.sourceHead ?? 'none'}`
    )
    console.log(`Pending provider migrations: ${report.pendingCount}`)
    console.log(`First pending: ${report.firstPending ?? 'none'}`)
    console.log(
      `Duplicate PO groups: ${report.duplicatePurchaseOrderGroups.length}`
    )
    console.log(`Status: ${report.ready ? 'READY' : 'BLOCKED'}`)
    if (Object.keys(report.riskCounts).length > 0) {
      console.log(`Pending SQL risk counts: ${JSON.stringify(report.riskCounts)}`)
    }
    for (const group of report.duplicatePurchaseOrderGroups) {
      console.log(
        `- duplicate PO group ${group.tenantId}/${group.poNumber}: ${group.rowCount} rows`
      )
    }
    for (const blocker of report.blockers) console.log(`- ${blocker}`)
    console.log('No migration SQL was executed.')
  }

  if (requireReady && !report.ready) process.exitCode = 1
} catch (error) {
  console.error(
    `Provider-source release planning failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}
