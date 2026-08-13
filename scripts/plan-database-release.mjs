#!/usr/bin/env node

/**
 * Read-only hosted database release planner.
 *
 * It compares the repository migration ledger to the target catalog, detects
 * non-linear history, hashes every missing migration, and conservatively flags
 * SQL requiring explicit review. It never executes migration SQL.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local scripts/plan-database-release.mjs
 *   node scripts/plan-database-release.mjs --json
 *   node scripts/plan-database-release.mjs --require-current --require-wo-02
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyzeLedger,
  analyzeSecurityCatalog,
  releaseGatePassed,
  scanSqlRisk,
  sha256,
} from './lib/database-release-plan.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const migrationDirectory = join(repoRoot, 'supabase', 'migrations')
const jsonOutput = process.argv.includes('--json')
const requireCurrent = process.argv.includes('--require-current')
const requireWo02 = process.argv.includes('--require-wo-02')
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is required for read-only release planning')
  process.exit(1)
}

const filenames = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()

const invalidNames = filenames.filter(
  (name) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(name)
)
if (invalidNames.length > 0) {
  console.error(
    `Invalid migration filenames: ${invalidNames.join(', ')}`
  )
  process.exit(1)
}

const migrations = filenames.map((filename) => {
  const path = join(migrationDirectory, filename)
  const source = readFileSync(path, 'utf8')
  return {
    version: filename.slice(0, 14),
    filename,
    bytes: statSync(path).size,
    sha256: sha256(source),
    sqlRisk: scanSqlRisk(source),
  }
})

const versions = migrations.map((migration) => migration.version)
if (new Set(versions).size !== versions.length) {
  console.error('Repository migration versions are not unique')
  process.exit(1)
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
  const [server] = await sql.unsafe('show server_version_num')
  const appliedRows = await sql.unsafe(
    `select version::text
       from supabase_migrations.schema_migrations
      order by version`
  )
  const applied = appliedRows.map((row) => row.version)
  const ledger = analyzeLedger(versions, applied)
  const [securityRow] = await sql.unsafe(
    `select
       (
         select count(*)::int
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
          where n.nspname = 'public'
            and c.relkind in ('r', 'p')
            and has_table_privilege(
              'anon',
              format('public.%I', c.relname),
              privilege
            )
       ) as anon_table_privilege_count,
       (
         select count(*)::int
           from pg_policies
          where schemaname = 'public'
            and roles @> ARRAY['public']::name[]
       ) as public_policy_count`
  )
  const security = analyzeSecurityCatalog({
    anonTablePrivilegeCount: securityRow?.anon_table_privilege_count,
    publicPolicyCount: securityRow?.public_policy_count,
  })
  const missingSet = new Set(ledger.missing)
  const missingMigrations = migrations.filter((migration) =>
    missingSet.has(migration.version)
  )
  const report = {
    mode: 'read_only',
    generatedAt: new Date().toISOString(),
    database: {
      postgresMajor: Math.floor(
        Number(server?.server_version_num ?? 0) / 10_000
      ),
      appliedCount: applied.length,
      appliedHead: applied.at(-1) ?? null,
      security,
    },
    repository: {
      migrationCount: migrations.length,
      migrationHead: migrations.at(-1)?.version ?? null,
    },
    ledger,
    missingMigrations,
    blockers: [
      ...(ledger.unexpected.length > 0
        ? ['unexpected migration versions exist in the target']
        : []),
      ...(ledger.appliedAfterFirstGap.length > 0
        ? [
            'target history is non-linear; later migrations were applied after the first missing version',
          ]
        : []),
      ...(Number(server?.server_version_num ?? 0) < 170000 ||
      Number(server?.server_version_num ?? 0) >= 180000
        ? ['target is not PostgreSQL 17']
        : []),
      ...security.blockers,
    ],
    wo02: null,
  }

  if (requireWo02) {
    const verifier = spawnSync(
      process.execPath,
      [join(repoRoot, 'scripts', 'verify-wo-02-database.mjs')],
      {
        cwd: repoRoot,
        env: process.env,
        encoding: 'utf8',
      }
    )
    const verifierOutput = [verifier.stdout, verifier.stderr]
      .filter(Boolean)
      .join('\n')
      .trim()
    const verifierPassed = verifier.status === 0
    report.wo02 = {
      passed: verifierPassed,
      exitCode: verifier.status,
      output: verifierOutput,
    }
    if (!verifierPassed) {
      report.blockers.push('WO-02 database acceptance gate failed')
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('ABI OPS database release plan (READ ONLY)')
    console.log(`Status: ${ledger.status}`)
    console.log(
      `PostgreSQL: ${report.database.postgresMajor}; applied: ${applied.length}/${migrations.length}`
    )
    console.log(
      `Applied head: ${report.database.appliedHead ?? 'none'}; repository head: ${report.repository.migrationHead ?? 'none'}`
    )
    console.log(
      `Missing: ${ledger.missing.length}; unexpected: ${ledger.unexpected.length}; applied after first gap: ${ledger.appliedAfterFirstGap.length}`
    )
    console.log(
      `Security: anon table privilege rows: ${security.anonTablePrivilegeCount}; public policies: ${security.publicPolicyCount}`
    )

    if (report.blockers.length > 0) {
      console.log('Blockers:')
      for (const blocker of report.blockers) {
        console.log(`- ${blocker}`)
      }
    }

    if (report.wo02) {
      console.log(`WO-02 database gate: ${report.wo02.passed ? 'PASS' : 'FAIL'}`)
      if (report.wo02.output) console.log(report.wo02.output)
    }

    if (ledger.appliedAfterFirstGap.length > 0) {
      console.log('Out-of-order applied versions:')
      for (const version of ledger.appliedAfterFirstGap) {
        console.log(`- ${version}`)
      }
    }

    if (missingMigrations.length > 0) {
      console.log('Missing migration review set:')
      for (const migration of missingMigrations) {
        console.log(
          `- ${migration.filename} | ${migration.bytes} bytes | sha256:${migration.sha256} | risk:${migration.sqlRisk.join(',') || 'none'}`
        )
      }
    }

    console.log('No migration SQL was executed.')
  }

  if (
    (requireCurrent || requireWo02) &&
    !releaseGatePassed(ledger.status, report.blockers)
  ) {
    process.exitCode = 1
  }
} catch (error) {
  console.error(
    `Database release planning failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 1 })
}
