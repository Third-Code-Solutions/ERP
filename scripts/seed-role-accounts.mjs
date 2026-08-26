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
import { createHash, randomBytes } from 'node:crypto'
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

// One demo account for every canonical ERP role, including the three retained
// legacy role values. Each new account is provisioned through the same trusted
// Auth trigger path as the admin console.
// Each email is unique so they don't collide; password is shared
// so demo handoff is easy. (For prod, every user gets their own pw via /admin/users.)
const ACCOUNTS = JSON.parse(
  readFileSync(
    join(repoRoot, 'scripts', 'fixtures', 'role-matrix-accounts.json'),
    'utf8'
  )
)

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
  // since the role-matrix accounts will live early.
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

function createOpaqueInvitationToken() {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
  }
}

function hasErrorCode(error, code) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  )
}

async function createInvitationIntent({ tenantId, email, role, invitedBy }) {
  const { token, tokenHash } = createOpaqueInvitationToken()
  try {
    const rows = await sql`
      INSERT INTO public.tenant_invitation_intents (
        tenant_id,
        invited_email,
        invited_role,
        invited_by,
        created_by,
        token_hash,
        expires_at
      )
      VALUES (
        ${tenantId},
        ${email.trim().toLowerCase()},
        ${role},
        ${invitedBy},
        ${invitedBy},
        ${tokenHash},
        clock_timestamp() + interval '23 hours'
      )
      RETURNING id
    `
    const intent = rows[0]
    if (!intent) throw new Error('Invitation authority was not persisted.')
    return { id: intent.id, token }
  } catch (error) {
    if (hasErrorCode(error, '23505')) {
      throw new Error(
        'A pending invitation already exists for this email. Do not retry until it is reviewed.'
      )
    }
    throw error
  }
}

async function revokeUnusedInvitationIntent(intentId, tenantId, invitedBy) {
  await sql`
    UPDATE public.tenant_invitation_intents
       SET revoked_at = clock_timestamp(),
           revoked_by = ${invitedBy},
           revocation_reason = 'auth_create_rejected'
     WHERE id = ${intentId}
       AND tenant_id = ${tenantId}
       AND consumed_at IS NULL
       AND revoked_at IS NULL
  `
}

async function createOrUpdateAuthUser(email, password, fullName, authority) {
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
  const invitation = await createInvitationIntent({ ...authority, email })
  const { ok, status, body } = await adminFetch('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          provisioning_mode: 'tenant_invitation_v1',
          tenant_invitation_token_v1: invitation.token,
          full_name: fullName,
        },
      }),
    })
  if (!ok) {
    if (status >= 400 && status < 500) {
      await revokeUnusedInvitationIntent(invitation.id, authority.tenantId, authority.invitedBy)
    }
    throw new Error(
      status >= 400 && status < 500
        ? `create auth user rejected for ${email} (HTTP ${status})`
        : `create auth user outcome is unknown for ${email} (HTTP ${status})`
    )
  }
  if (!body?.id) {
    throw new Error(`create auth user outcome is unknown for ${email}`)
  }
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

async function findSeedInviter(tenantId) {
  const rows = await sql`
    SELECT id
      FROM users
     WHERE tenant_id = ${tenantId}
       AND role IN ('owner', 'admin')
     ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at
     LIMIT 1
  `
  const inviter = rows[0]
  if (!inviter) {
    throw new Error(
      'The selected demo tenant must already contain an owner or admin inviter.',
    )
  }
  return inviter.id
}

async function verifyProvisionedProfile(authUserId, tenantId, role) {
  const rows = await sql`
    SELECT tenant_id, role::text AS role
      FROM users
     WHERE id = ${authUserId}
     LIMIT 1
  `
  const profile = rows[0]
  if (!profile) {
    throw new Error('Auth account has no application profile; refusing direct repair.')
  }
  if (profile.tenant_id !== tenantId || profile.role !== role) {
    throw new Error(
      `Existing profile does not match the selected tenant/role; refusing cross-tenant or unaudited role mutation.`,
    )
  }
}

const results = []

try {
  const tenant = await findOrPickTenant()
  const invitedBy = await findSeedInviter(tenant.id)
  console.log(`[seed] Using tenant: ${tenant.name} (${tenant.slug}) [${tenant.id}]`)
  console.log()

  for (const acct of ACCOUNTS) {
    try {
      const auth = await createOrUpdateAuthUser(
        acct.email,
        SHARED_PASSWORD,
        acct.full_name,
        {
          tenantId: tenant.id,
          role: acct.role,
          invitedBy,
        },
      )
      await verifyProvisionedProfile(auth.id, tenant.id, acct.role)
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
