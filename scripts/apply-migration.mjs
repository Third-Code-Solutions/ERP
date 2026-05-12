#!/usr/bin/env node
/**
 * Apply a Supabase migration SQL file directly via postgres-js.
 *
 * Why this instead of `supabase db push`:
 *   `supabase db push` requires either a linked project (interactive password
 *   prompt) or Docker for the local stack. We have neither in autonomous
 *   sessions. Drizzle's postgres-js package is already a workspace dep, so
 *   we use it directly.
 *
 * Usage:
 *   node scripts/apply-migration.mjs supabase/migrations/<file>.sql
 *
 * Reads DATABASE_URL from the root .env.local (or .env) file.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(join(repoRoot, '.env.local'))
loadEnvFile(join(repoRoot, '.env'))

// Resolve postgres-js from pnpm's flat store (it isn't hoisted to root).
function resolvePostgres() {
  const pnpmDir = join(repoRoot, 'node_modules/.pnpm')
  if (!existsSync(pnpmDir)) return 'postgres'
  const entry = readdirSync(pnpmDir).find((d) => /^postgres@\d/.test(d))
  if (!entry) return 'postgres'
  return join(pnpmDir, entry, 'node_modules/postgres/cjs/src/index.js')
}

const postgresPath = resolvePostgres()
const postgresMod = await import(pathToFileURL(postgresPath).href)
const postgres = postgresMod.default ?? postgresMod

const migrationArg = process.argv[2]
if (!migrationArg) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>')
  process.exit(1)
}

const migrationPath = resolve(repoRoot, migrationArg)
if (!existsSync(migrationPath)) {
  console.error(`Migration not found: ${migrationPath}`)
  process.exit(1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL not set. Add it to .env.local at repo root.')
  process.exit(1)
}

const isPooler = databaseUrl.includes('pgbouncer=true') || databaseUrl.includes(':6543')
const sql = postgres(databaseUrl, {
  prepare: !isPooler,
  idle_timeout: 5,
  max: 1,
})

const migrationSql = readFileSync(migrationPath, 'utf8')

console.log(`[migrate] applying ${migrationArg} (${migrationSql.length} bytes)`)
console.log(`[migrate] target: ${databaseUrl.replace(/(:\/\/[^:]+):[^@]+@/, '$1:***@')}`)

try {
  await sql.unsafe(migrationSql)
  console.log('[migrate] ✓ migration applied successfully')
} catch (err) {
  console.error('[migrate] ✗ migration FAILED')
  console.error(err)
  process.exitCode = 2
} finally {
  await sql.end({ timeout: 5 })
}
