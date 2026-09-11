// Browser integration fixture: real Next/Core/Postgres, loopback Auth provider.
// Never point this fixture at a hosted database or use it as provider proof.
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(webRoot, '../..')
const apiEntry = resolve(root, 'apps/api/dist/main.js')
if (!existsSync(apiEntry)) throw new Error('Build the Core API before running this browser fixture')
const postgres = require(resolve(root, 'packages/database/node_modules/postgres'))
const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const connection = postgres(databaseUrl, { max: 4 })
const webOrigin = 'http://127.0.0.1:4417'
const authOrigin = 'http://127.0.0.1:4418'
const apiOrigin = 'http://127.0.0.1:4419'
const anonKey = 'platform-local-anon-fixture-key'
const serviceKey = 'platform-local-service-fixture-key'
const ownerId = randomUUID()
const adminId = randomUUID()
const viewerId = randomUUID()
const tenantId = randomUUID()
const customerId = randomUUID()
const projectId = randomUUID()
const reportProjectId = randomUUID()
const reportOpportunityId = randomUUID()
const otherReportOpportunityId = randomUUID()
const operationalDocumentId = randomUUID()
const otherOperationalDocumentId = randomUUID()
const operationalJobId = randomUUID()
const weeklyReportId = randomUUID()
const fixtureTime = '2026-09-04T00:00:00.000Z'
const identities = [
  { id: ownerId, email: 'kurt@thirdcodesolutions.com', name: 'Fixture Platform Owner', role: 'owner' },
  { id: adminId, email: 'platform-admin-fixture@example.invalid', name: 'Fixture Tenant Admin', role: 'admin' },
  { id: viewerId, email: 'platform-viewer-fixture@example.invalid', name: 'Fixture Read Only', role: 'viewer' },
].map((identity) => ({
  ...identity,
  token: [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: identity.id, role: 'authenticated', aud: 'authenticated', exp: 4102444800, amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] })).toString('base64url'), 'local-platform-fixture-signature'].join('.'),
  user: { id: identity.id, email: identity.email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: fixtureTime, confirmed_at: fixtureTime, created_at: fixtureTime, updated_at: fixtureTime, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], is_anonymous: false },
}))
let webChild
let apiChild
let stopping = false
let seeded = false
let reportsSeeded = false
let operationsSeeded = false
let weeklyReportSeeded = false

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': webOrigin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version', 'access-control-allow-methods': 'GET,POST,OPTIONS' })
  response.end(JSON.stringify(data))
}

async function seed() {
  await connection.begin(async (tx) => {
    const existing = await tx`select user_id from platform_role_assignments limit 1`
    if (existing.length) throw new Error('Disposable database already has a platform owner; refusing fixture collision')
    await tx`insert into tenants(id,name,slug) values (${tenantId},'Platform browser fixture',${`platform-browser-${tenantId}`}), (${customerId},'Browser customer fixture',${`platform-browser-${customerId}`})`
    for (const identity of identities) {
      await tx`insert into users(id,tenant_id,email,full_name,role) values (${identity.id},${tenantId},${identity.email},${identity.name},${identity.role})`
      await tx`insert into auth.users(id,email,email_confirmed_at) values (${identity.id},${identity.email},now())`
    }
    await tx`insert into platform_role_assignments(user_id,normalized_email,created_by) values (${ownerId},'kurt@thirdcodesolutions.com',${ownerId})`
    await tx`insert into projects(id,tenant_id,name,client,status,created_by) values (${projectId},${tenantId},'Browser selector fixture','Fixture client','active',${ownerId})`
  })
  seeded = true
}

async function cleanup() {
  if (!seeded) return
  // Exact random fixture IDs only, on the hard-coded disposable loopback DB.
  await connection.begin(async (tx) => {
    await tx`set local session_replication_role = 'replica'`
    await tx`delete from platform_audit_events where actor_id = ${ownerId}`
    await tx`delete from platform_support_sessions where actor_id = ${ownerId}`
    await tx`delete from platform_role_assignments where user_id = ${ownerId}`
    await tx`delete from audit_log where tenant_id in (${tenantId},${customerId})`
    // Tenant creation and read-side graph/calendar materialization also create
    // fixture rows. Replica mode suppresses FK cascades, so remove them explicitly.
    await tx`delete from cortex_edges where tenant_id in (${tenantId},${customerId})`
    await tx`delete from cortex_provenance where tenant_id in (${tenantId},${customerId})`
    await tx`delete from cortex_nodes where tenant_id in (${tenantId},${customerId})`
    await tx`delete from business_calendar_holidays where tenant_id in (${tenantId},${customerId})`
    await tx`delete from tenant_memberships where tenant_id in (${tenantId},${customerId})`
    await tx`delete from document_processing_jobs where id=${operationalJobId}`
    await tx`delete from documents where id in (${operationalDocumentId},${otherOperationalDocumentId})`
    await tx`delete from opportunities where id in (${reportOpportunityId},${otherReportOpportunityId})`
    await tx`delete from weekly_reports where id=${weeklyReportId}`
    await tx`delete from projects where id in (${projectId},${reportProjectId})`
    await tx`delete from users where id in (${ownerId},${adminId},${viewerId})`
    await tx`delete from auth.users where id in (${ownerId},${adminId},${viewerId})`
    await tx`delete from tenants where id in (${tenantId},${customerId})`
  })
  seeded = false
}

const authServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', authOrigin)
    if (req.method === 'OPTIONS') return json(res, 200, {})
    if (url.pathname === '/__fixture/ready') return json(res, 200, { ready: true })
    if (url.pathname === '/__fixture/weekly-report' && req.method === 'POST') {
      if (!weeklyReportSeeded) {
        const snapshot = { overall_pct: 25, by_category: { civil_pct: 25, electrical_pct: 0, mep_pct: 0, finishes_pct: 0 }, tasks_completed: [], milestones_reached: [], open_punchlist_count: 0, schedule_variance_days: 0, photos: [], notes: 'Local printable fixture evidence', next_week_focus: 'Continue fixture work' }
        await connection`insert into weekly_reports(id,tenant_id,project_id,week_ending,snapshot,generated_by) values (${weeklyReportId},${tenantId},${projectId},${fixtureTime},${connection.json(snapshot)},${ownerId})`
        weeklyReportSeeded = true
      }
      return json(res, 200, { id: weeklyReportId })
    }
    if (url.pathname === '/__fixture/cleanup' && req.method === 'POST') { await cleanup(); return json(res, 200, { cleaned: true }) }
    if (url.pathname === '/__fixture/reports' && req.method === 'POST') {
      if (!reportsSeeded) {
        await connection.begin(async (tx) => {
          await tx`insert into projects(id,tenant_id,name,client,status) values (${reportProjectId},${customerId},'Other report fixture','Fixture client','active')`
          await tx`insert into opportunities(id,tenant_id,project_id,stage,tcv_cents,gp_cents,weighted_tcv_cents) values
            (${reportOpportunityId},${tenantId},${projectId},'scoping',123456,12345,61728),
            (${otherReportOpportunityId},${customerId},${reportProjectId},'scoping',999999,888888,777777)`
        })
        reportsSeeded = true
      }
      return json(res, 200, { seeded: true })
    }
    if (url.pathname === '/__fixture/settings-audit' && req.method === 'GET') {
      const [row] = await connection`select count(*)::int as count from audit_log where tenant_id=${tenantId} and actor_id=${ownerId} and entity_type='tenant' and action='update'`
      return json(res, 200, row)
    }
    if (url.pathname === '/__fixture/operations' && req.method === 'POST') {
      if (!reportsSeeded) return json(res, 409, { error: 'Seed reports first' })
      if (!operationsSeeded) {
        await connection.begin(async (tx) => {
          await tx`insert into documents(id,tenant_id,project_id,uploaded_by,document_type,file_name,storage_path,mime_type,size_bytes) values
            (${operationalDocumentId},${tenantId},${projectId},${ownerId},'pdf','fixture-a.pdf','fixture/no-object-a','application/pdf',200),
            (${otherOperationalDocumentId},${customerId},${reportProjectId},null,'pdf','fixture-b.pdf','fixture/no-object-b','application/pdf',400)`
          await tx`insert into document_processing_jobs(id,tenant_id,document_id,project_id,created_by,idempotency_key,request_hash,status,failure_code,completed_at)
            values (${operationalJobId},${tenantId},${operationalDocumentId},${projectId},${ownerId},${randomUUID()},${'a'.repeat(64)},'failed','FIXTURE_FAILURE',now())`
        })
        operationsSeeded = true
      }
      return json(res, 200, { seeded: true })
    }
    const identity = identities.find((item) => req.headers.authorization === `Bearer ${item.token}`)
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const credentials = JSON.parse(raw)
      const login = identities.find((item) => item.email === credentials.email)
      if (!login || credentials.password !== 'fixture-password-only') return json(res, 400, { message: 'Invalid fixture credentials' })
      return json(res, 200, { access_token: login.token, refresh_token: `fixture-${login.id}`, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: login.user })
    }
    if (!identity) return json(res, 401, { message: 'Fixture identity required' })
    if (url.pathname === '/auth/v1/user') return json(res, 200, identity.user)
    if (url.pathname === '/rest/v1/rpc/is_platform_owner') {
      const allowed = await connection.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${identity.id}, true)`
        await tx`set local role authenticated`
        return tx`select public.is_platform_owner() as allowed`
      })
      return json(res, 200, allowed[0].allowed)
    }
    if (url.pathname === '/rest/v1/users') {
      const rows = await connection.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${identity.id}, true)`
        await tx`set local role authenticated`
        return tx`select tenant_id,role,email,full_name from users where id = ${identity.id}`
      })
      return json(res, rows.length ? 200 : 406, rows[0] ?? null)
    }
    return json(res, 404, { message: 'Unsupported external-provider fixture operation' })
  } catch {
    return json(res, 500, { message: 'Loopback fixture failed' })
  }
})

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  webChild?.kill('SIGTERM')
  apiChild?.kill('SIGTERM')
  authServer.close()
  try { await cleanup() } finally { await connection.end({ timeout: 5 }) }
  process.exitCode = code
}

try {
  await seed()
  await new Promise((resolveListen) => authServer.listen(4418, '127.0.0.1', resolveListen))
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, REDIS_URL: 'redis://127.0.0.1:6379', SUPABASE_URL: authOrigin, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, NEXT_PUBLIC_SUPABASE_URL: authOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, ERP_CORE_API_URL: apiOrigin, ERP_WEB_BASE_URL: webOrigin, ERP_API_CORS_ORIGINS: webOrigin, NEXT_PUBLIC_APP_URL: webOrigin, NEXT_PUBLIC_SITE_URL: webOrigin, ERP_PROJECT_LISTS_READS_ENABLED: 'true', ERP_PROJECT_LISTS_READS_TENANT_IDS: tenantId, OPENAI_API_KEY: '', AI_GATEWAY_API_KEY: '', INNGEST_EVENT_KEY: '', NEXT_TELEMETRY_DISABLED: '1' }
  // Close every optional production workflow in this local fixture.
  for (const key of Object.keys(env)) {
    if (key.startsWith('ERP_') && (key.endsWith('_ENABLED') || key.endsWith('_VIA_API'))) env[key] = 'false'
  }
  apiChild = spawn(process.execPath, [apiEntry], { cwd: root, env: { ...env, PORT: '4419' }, stdio: 'inherit' })
  webChild = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '4417'], { cwd: webRoot, env, stdio: 'inherit' })
  for (const child of [webChild, apiChild]) {
    child.on('exit', (code) => { if (!stopping) void stop(code ?? 1) })
    child.on('error', () => void stop(1))
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
} catch (error) {
  console.error('[platform-browser] startup failed:', error instanceof Error ? error.message : 'unknown error')
  await stop(1)
}
