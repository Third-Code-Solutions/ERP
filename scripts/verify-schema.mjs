#!/usr/bin/env node
/**
 * Verify a set of expected tables, indexes, RLS policies, triggers exist
 * after applying a migration. Prints PASS/FAIL per check and exits non-zero
 * on any failure.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(join(repoRoot, '.env.local'))

const pnpmDir = join(repoRoot, 'node_modules/.pnpm')
const entry = readdirSync(pnpmDir).find((d) => /^postgres@\d/.test(d))
const postgres = (await import(pathToFileURL(join(pnpmDir, entry, 'node_modules/postgres/cjs/src/index.js')).href)).default

const url = process.env.DATABASE_URL
const sql = postgres(url, {
  prepare: !(url.includes('pgbouncer=true') || url.includes(':6543')),
  idle_timeout: 5,
  max: 1,
})

let failed = 0
async function check(label, query, predicate = (rows) => rows.length > 0) {
  try {
    const rows = await sql.unsafe(query)
    const ok = predicate(rows)
    console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` (got ${rows.length} rows)`}`)
    if (!ok) failed++
  } catch (err) {
    console.log(`✗ ${label} — ${err.message}`)
    failed++
  }
}

try {
  // Tables
  for (const t of ['accounts', 'contacts', 'account_kyc_artifacts']) {
    await check(`table ${t} exists`, `SELECT 1 FROM information_schema.tables WHERE table_name='${t}' AND table_schema='public'`)
  }

  // Enums
  for (const enumName of ['kyc_status', 'account_industry', 'kyc_artifact_type']) {
    await check(`enum ${enumName} exists`, `SELECT 1 FROM pg_type WHERE typname='${enumName}'`)
  }

  // Role enum has new values
  for (const r of ['commercial', 'design', 'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx']) {
    await check(`role enum has '${r}'`, `SELECT 1 FROM pg_enum WHERE enumlabel='${r}' AND enumtypid = (SELECT oid FROM pg_type WHERE typname='role')`)
  }

  // RLS enabled on new tables
  for (const t of ['accounts', 'contacts', 'account_kyc_artifacts']) {
    await check(`RLS enabled on ${t}`, `SELECT 1 FROM pg_tables WHERE tablename='${t}' AND rowsecurity=true`)
  }

  // 4 policies per new table
  for (const t of ['accounts', 'contacts', 'account_kyc_artifacts']) {
    await check(`${t} has 4 RLS policies`,
      `SELECT 1 FROM pg_policies WHERE tablename='${t}'`,
      (rows) => rows.length === 4)
  }

  // Audit triggers attached
  for (const t of ['accounts', 'contacts', 'account_kyc_artifacts']) {
    await check(`audit trigger on ${t}`,
      `SELECT 1 FROM pg_trigger WHERE tgname='audit_${t}' AND NOT tgisinternal`)
  }

  // account_id columns added
  await check(`opportunities.account_id column exists`,
    `SELECT 1 FROM information_schema.columns WHERE table_name='opportunities' AND column_name='account_id'`)
  await check(`projects.account_id column exists`,
    `SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='account_id'`)

  // CHECK constraint on opportunities
  await check(`opp_account_or_project constraint exists`,
    `SELECT 1 FROM pg_constraint WHERE conname='opp_account_or_project'`)

  // opportunities.project_id is now nullable
  await check(`opportunities.project_id is nullable`,
    `SELECT 1 FROM information_schema.columns WHERE table_name='opportunities' AND column_name='project_id' AND is_nullable='YES'`)

  console.log(`\n${failed === 0 ? '✓ all checks passed' : `✗ ${failed} check(s) failed`}`)
  if (failed > 0) process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
