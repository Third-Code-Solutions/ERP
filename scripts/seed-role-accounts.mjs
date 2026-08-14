#!/usr/bin/env node
/**
 * Seed one demo account per ABI OPS role into the existing tenant.
 *
 * Reads from the repo-root .env.local:
 *   DATABASE_URL
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: re-running won't error on accounts that already exist.
 * It will (re-)set the password on every run so the printed credentials
 * are always known-good.
 *
 * Output: a markdown-style table at the end with email + password + role.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  getConfiguredDemoTenantSlug,
  selectDemoTenant,
} from './lib/demo-tenant.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

function loadEnvFile(p) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnvFile(join(repoRoot, '.env.local'))
loadEnvFile(join(repoRoot, '.env'))

if (
  !process.argv.includes('--apply') ||
  process.env.DEMO_SEED_ALLOW_MUTATION !== '1'
) {
  console.error(
    'Refusing to mutate demo accounts. Use --apply and DEMO_SEED_ALLOW_MUTATION=1 after confirming the dedicated demo tenant.',
  )
  process.exit(2)
}

// Resolve postgres-js from pnpm flat store.
function resolvePostgres() {
  const dir = join(repoRoot, 'node_modules/.pnpm')
  const entry = readdirSync(dir).find((d) => /^postgres@\d/.test(d))
  return join(dir, entry, 'node_modules/postgres/cjs/src/index.js')
}
const postgres = (await import(pathToFileURL(resolvePostgres()).href)).default

const url = process.env.DATABASE_URL
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !supaUrl || !serviceKey) {
  console.error('Missing DATABASE_URL or NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const isPooler = url.includes('pgbouncer=true') || url.includes(':6543')
const sql = postgres(url, { prepare: !isPooler, idle_timeout: 5, max: 1 })

const SHARED_PASSWORD = process.env.DEMO_SHARED_PASSWORD
if (!SHARED_PASSWORD || SHARED_PASSWORD.length < 14) {
  console.error('DEMO_SHARED_PASSWORD must be set and contain at least 14 characters')
  process.exit(1)
}

// 11 demo accounts — the 10 ABI OPS canonical roles + legacy owner.
// Each email is unique so they don't collide; password is shared
// so demo handoff is easy. (For prod, every user gets their own pw via /admin/users.)
const ACCOUNTS = [
  { email: 'admin@abi-ops.test',       full_name: 'Demo Admin',       role: 'admin' },
  { email: 'owner@abi-ops.test',       full_name: 'Demo Owner',       role: 'owner' },
  { email: 'sales@abi-ops.test',       full_name: 'Demo Sales',       role: 'sales' },
  { email: 'commercial@abi-ops.test',  full_name: 'Demo Commercial',  role: 'commercial' },
  { email: 'design@abi-ops.test',      full_name: 'Demo Designer',    role: 'design' },
  { email: 'sd@abi-ops.test',          full_name: 'Demo SD / PM / PE', role: 'sd_pm_pe' },
  { email: 'finance@abi-ops.test',     full_name: 'Demo Finance',     role: 'finance' },
  { email: 'procurement@abi-ops.test', full_name: 'Demo Procurement', role: 'procurement' },
  { email: 'safety@abi-ops.test',      full_name: 'Demo Safety',      role: 'safety' },
  { email: 'cx@abi-ops.test',          full_name: 'Demo CX',          role: 'cx' },
  { email: 'viewer@abi-ops.test',      full_name: 'Demo Viewer',      role: 'viewer' },
]

async function adminFetch(path, init = {}) {
  const res = await fetch(`${supaUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: res.ok, status: res.status, body }
}

async function findAuthUserByEmail(email) {
  // Supabase admin: list users with filter via the /admin/users endpoint.
  // The native API doesn't expose ?email=, so we iterate the first page (50)
  // since 11 demo accounts will live early.
  let page = 1
  while (page < 20) {
    const { ok, body } = await adminFetch(`/auth/v1/admin/users?page=${page}&per_page=200`)
    if (!ok) return null
    const list = (body?.users ?? body) || []
    const hit = list.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (!list.length || list.length < 200) return null
    page++
  }
  return null
}

async function createOrUpdateAuthUser(email, password, fullName) {
  const existing = await findAuthUserByEmail(email)
  if (existing) {
    // Reset password for known-good demo state.
    const { ok, body } = await adminFetch(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    })
    if (!ok) throw new Error(`reset password failed for ${email}: ${JSON.stringify(body)}`)
    return { id: existing.id, created: false }
  }
  const { ok, body } = await adminFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  })
  if (!ok) throw new Error(`create auth user failed for ${email}: ${JSON.stringify(body)}`)
  return { id: body.id, created: true }
}

async function findOrPickTenant() {
  const demoTenantSlug = getConfiguredDemoTenantSlug()
  const rows = await sql`
    SELECT id, name, slug, created_at
    FROM tenants
    WHERE slug = ${demoTenantSlug}
    LIMIT 1
  `
  return selectDemoTenant(rows, demoTenantSlug)
}

async function upsertPublicUser(authUserId, tenantId, email, fullName, role) {
  // Drizzle schema requires id to match the auth user id (FK from auth.users).
  // We do an INSERT … ON CONFLICT (id) DO UPDATE so re-runs land cleanly.
  await sql`
    INSERT INTO users (id, tenant_id, email, full_name, role, created_at, updated_at)
    VALUES (${authUserId}, ${tenantId}, ${email}, ${fullName}, ${role}::role, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          email = EXCLUDED.email,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          updated_at = NOW()
  `
}

const results = []

try {
  const tenant = await findOrPickTenant()
  console.log(`[seed] Using tenant: ${tenant.name} (${tenant.slug}) [${tenant.id}]`)
  console.log()

  for (const acct of ACCOUNTS) {
    try {
      const auth = await createOrUpdateAuthUser(acct.email, SHARED_PASSWORD, acct.full_name)
      await upsertPublicUser(auth.id, tenant.id, acct.email, acct.full_name, acct.role)
      results.push({ ...acct, status: auth.created ? 'created' : 'reset', user_id: auth.id })
      console.log(
        `  ${auth.created ? '✓ created' : '↻ reset  '}  ${acct.email.padEnd(28)}  ${acct.role}`
      )
    } catch (err) {
      results.push({ ...acct, status: 'error', error: err.message })
      console.log(`  ✗ FAILED  ${acct.email.padEnd(28)}  ${err.message}`)
    }
  }

  console.log()
  console.log('=== DEMO ACCOUNTS ===')
  console.log()
  console.log('| Role          | Email                       | Status  |')
  console.log('|---------------|-----------------------------|---------|')
  for (const r of results) {
    if (r.status === 'error') continue
    console.log(`| ${r.role.padEnd(13)} | ${r.email.padEnd(27)} | ${r.status.padEnd(7)} |`)
  }
  console.log()
  console.log('Login URL: set NEXT_PUBLIC_SITE_URL and append /auth/login')
  console.log('Password source: DEMO_SHARED_PASSWORD (not printed)')
} catch (err) {
  console.error('[seed] FATAL:', err.message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
