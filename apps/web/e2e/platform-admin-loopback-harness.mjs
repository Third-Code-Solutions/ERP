// Browser integration fixture: real Next/Core/Postgres, loopback Auth provider.
// Never point this fixture at a hosted database or use it as provider proof.
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(webRoot, '../..')
const apiEntry = resolve(root, 'apps/api/dist/main.js')
if (!existsSync(apiEntry)) throw new Error('Build the Core API before running this browser fixture')
const productionWeb = process.env.PLATFORM_BROWSER_PRODUCTION === '1'
if (productionWeb && !existsSync(resolve(webRoot, '.next/BUILD_ID'))) throw new Error('Build Web with the loopback fixture public URLs before production browser verification')
const postgres = require(resolve(root, 'packages/database/node_modules/postgres'))
const databaseUrl = process.env.PLATFORM_BROWSER_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const databaseTarget = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseTarget.hostname) ||
    !/^\/(?:erp_(?:turnover_audit|self_hosted_ci|readiness)(?:_[a-z0-9]+)*|test_[a-z0-9_]+)$/.test(databaseTarget.pathname)) {
  throw new Error('Platform browser fixture requires a disposable loopback database')
}
const connection = postgres(databaseUrl, { max: 4 })
const webOrigin = 'http://127.0.0.1:4417'
const authOrigin = 'http://127.0.0.1:4418'
const apiOrigin = 'http://127.0.0.1:4419'
const browserAuthOrigin = productionWeb ? webOrigin : authOrigin
const webCoreOrigin = productionWeb ? webOrigin : apiOrigin
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
const uploadFixtureName = 'browser-controlled-upload.dxf'
const storageObjects = new Map()
const storageWrites = []
const identities = [
  { id: ownerId, email: 'owner@independent.example.invalid', name: 'Fixture Platform Owner', role: 'owner' },
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

async function requestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function storagePath(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null
  return pathname
    .slice(prefix.length)
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/')
}

function serviceStorageRequest(request) {
  return request.headers.apikey === serviceKey &&
    request.headers.authorization === `Bearer ${serviceKey}`
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
    await tx`select erp_private.bootstrap_platform_owner(${ownerId},'owner@independent.example.invalid','Disposable browser proof')`
    await tx`insert into projects(id,tenant_id,name,client,status,created_by) values (${projectId},${tenantId},'Browser selector fixture','Fixture client','active',${ownerId})`
  })
  seeded = true
}

async function cleanup() {
  if (!seeded) return
  // Exact random fixture IDs only, on the validated disposable loopback DB.
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
    await tx`delete from cad_evidence_commit_requests where tenant_id=${tenantId} and project_id=${projectId} and created_by=${ownerId}`
    await tx`delete from document_intake_requests where tenant_id=${tenantId} and project_id=${projectId} and created_by=${ownerId}`
    await tx`delete from scope_items where tenant_id=${tenantId} and project_id=${projectId} and created_by=${ownerId}`
    await tx`delete from document_upload_reservations where tenant_id=${tenantId} and project_id=${projectId} and actor_id=${ownerId}`
    await tx`delete from document_processing_jobs where id=${operationalJobId}`
    await tx`delete from documents where tenant_id=${tenantId} and project_id=${projectId} and uploaded_by=${ownerId} and file_name=${uploadFixtureName}`
    await tx`delete from documents where id in (${operationalDocumentId},${otherOperationalDocumentId})`
    await tx`delete from opportunities where id in (${reportOpportunityId},${otherReportOpportunityId})`
    await tx`delete from weekly_reports where id=${weeklyReportId}`
    await tx`delete from projects where id in (${projectId},${reportProjectId})`
    await tx`delete from users where id in (${ownerId},${adminId},${viewerId})`
    await tx`delete from auth.users where id in (${ownerId},${adminId},${viewerId})`
    await tx`delete from tenants where id in (${tenantId},${customerId})`
  })
  storageObjects.clear()
  storageWrites.length = 0
  seeded = false
}

const authServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', authOrigin)
    if (req.method === 'OPTIONS') return json(res, 200, {})
    if (url.pathname === '/__fixture/ready') {
      const checks = await Promise.allSettled([`${apiOrigin}/ready`, `${webOrigin}/auth/login`].map(async (target) => {
        const response = await fetch(target, { signal: AbortSignal.timeout(2_000) })
        await response.body?.cancel()
        return response.ok
      }))
      const ready = checks.every((check) => check.status === 'fulfilled' && check.value)
      return json(res, ready ? 200 : 503, { ready })
    }
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
    if (url.pathname === '/__fixture/document-upload-state' && req.method === 'GET') {
      const [reservation] = await connection`select id,state,document_id,storage_path,declared_size_bytes::int as declared_size_bytes from document_upload_reservations where tenant_id=${tenantId} and project_id=${projectId} and actor_id=${ownerId} and original_file_name=${uploadFixtureName} order by created_at desc limit 1`
      const [document] = await connection`select id,file_name,storage_path,size_bytes::int as size_bytes from documents where tenant_id=${tenantId} and project_id=${projectId} and uploaded_by=${ownerId} and file_name=${uploadFixtureName} order by created_at desc limit 1`
      const [audit] = await connection`select count(*)::int as count from audit_log where tenant_id=${tenantId} and actor_id=${ownerId} and entity_type in ('document_upload','document') and action in ('create','update')`
      return json(res, 200, {
        reservation: reservation ?? null,
        document: document ?? null,
        auditCount: audit?.count ?? 0,
        storageWrites,
      })
    }
    if (url.pathname === '/__fixture/document-upload-quota' && req.method === 'POST') {
      const [usage] = await connection`select coalesce(sum(size_bytes),0)::bigint as bytes from documents where tenant_id=${tenantId} and project_id=${projectId}`
      let remaining = 500 * 1024 * 1024 - Number(usage?.bytes ?? 0)
      let part = 0
      while (remaining > 0) {
        const size = Math.min(100 * 1024 * 1024, remaining)
        const id = randomUUID()
        await connection`insert into document_upload_reservations(id,tenant_id,project_id,actor_id,storage_path,original_file_name,declared_size_bytes,declared_content_type,idempotency_key,request_hash,state,expires_at,core_controlled) values (${id},${tenantId},${projectId},${ownerId},${`${tenantId}/${projectId}/${id}-quota.fixture`},${`quota-${part}.fixture`},${size},'application/octet-stream',${`browser-quota-fixture-${part}`},${'f'.repeat(64)},'active',now()+interval '2 hours',true)`
        remaining -= size
        part += 1
      }
      return json(res, 200, { reserved: true, reservations: part })
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
    const objectPath = storagePath(url.pathname, '/storage/v1/object/documents/')
    const infoPath = storagePath(url.pathname, '/storage/v1/object/info/documents/')
    if (req.method === 'POST' && objectPath && serviceStorageRequest(req)) {
      const body = await requestBody(req)
      if (storageObjects.has(objectPath)) return json(res, 409, { message: 'Object already exists' })
      storageObjects.set(objectPath, body)
      storageWrites.push({ storagePath: objectPath, bytes: body.byteLength })
      return json(res, 200, { Key: `documents/${objectPath}` })
    }
    if (req.method === 'GET' && infoPath && serviceStorageRequest(req)) {
      const body = storageObjects.get(infoPath)
      if (!body) return json(res, 404, { statusCode: '404', message: 'Object not found' })
      return json(res, 200, { name: infoPath.split('/').at(-1), size: body.byteLength })
    }
    if (req.method === 'GET' && objectPath && serviceStorageRequest(req)) {
      const body = storageObjects.get(objectPath)
      if (!body) return json(res, 404, { statusCode: '404', message: 'Object not found' })
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': String(body.byteLength),
        'cache-control': 'no-store',
      })
      return res.end(body)
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

// Production CSP permits same-origin Auth. Keep the mock behind this local-only
// proxy instead of weakening CSP or production cookie settings for the browser.
const webProxy = productionWeb ? createServer((req, res) => {
  const providerRequest = /^\/(?:auth|rest|storage)\/v1\//.test(req.url ?? '')
  const coreRequest = /^\/v1\//.test(req.url ?? '')
  const upstream = httpRequest({
    hostname: '127.0.0.1', port: providerRequest ? 4418 : coreRequest ? 4419 : 4420,
    method: req.method, path: req.url, headers: req.headers,
  }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers)
    response.pipe(res)
  })
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.on('aborted', () => upstream.destroy())
  req.pipe(upstream)
}) : null

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  webChild?.kill('SIGTERM')
  apiChild?.kill('SIGTERM')
  authServer.close()
  webProxy?.close()
  try { await cleanup() } finally { await connection.end({ timeout: 5 }) }
  process.exitCode = code
}

try {
  await seed()
  await new Promise((resolveListen) => authServer.listen(4418, '127.0.0.1', resolveListen))
  if (webProxy) await new Promise((resolveListen) => webProxy.listen(4417, '127.0.0.1', resolveListen))
  const env = { ...process.env, NODE_ENV: productionWeb ? 'production' : 'test', DATABASE_URL: databaseUrl, REDIS_URL: 'redis://127.0.0.1:6379', SUPABASE_URL: authOrigin, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, NEXT_PUBLIC_SUPABASE_URL: browserAuthOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, ERP_CORE_API_URL: webCoreOrigin, ERP_WEB_BASE_URL: webOrigin, ERP_API_CORS_ORIGINS: webOrigin, NEXT_PUBLIC_APP_URL: webOrigin, NEXT_PUBLIC_SITE_URL: webOrigin, ERP_PROJECT_LISTS_READS_ENABLED: 'true', ERP_PROJECT_LISTS_READS_TENANT_IDS: tenantId, OPENAI_API_KEY: '', AI_GATEWAY_API_KEY: '', INNGEST_EVENT_KEY: '', NEXT_TELEMETRY_DISABLED: '1' }
  // Close every optional production workflow in this local fixture.
  for (const key of Object.keys(env)) {
    if (key.startsWith('ERP_') && (key.endsWith('_ENABLED') || key.endsWith('_VIA_API'))) env[key] = 'false'
  }
  env.ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED = 'true'
  env.ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS = tenantId
  apiChild = spawn(process.execPath, [apiEntry], { cwd: root, env: { ...env, PORT: '4419' }, stdio: 'inherit' })
  webChild = spawn(process.execPath, [require.resolve('next/dist/bin/next'), productionWeb ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', productionWeb ? '4420' : '4417'], { cwd: webRoot, env, stdio: 'inherit' })
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
