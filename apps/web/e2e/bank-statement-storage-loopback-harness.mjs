import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const AUTH_PORT = 4348
const WEB_PORT = 4347
const API_PORT = 4350
const AUTH_ORIGIN = `http://${HOST}:${AUTH_PORT}`
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`
const API_ORIGIN = `http://${HOST}:${API_PORT}`
const DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const USER_ID = randomUUID()
const TENANT_ID = randomUUID()
const LEDGER_ACCOUNT_ID = randomUUID()
const CASH_ACCOUNT_ID = randomUUID()
const ANON_KEY = 'third-code-local-anon-key'
const SERVICE_ROLE_KEY = 'third-code-local-service-role-key'
const ACCESS_TOKEN = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      exp: 4_102_444_800,
      role: 'authenticated',
      sub: USER_ID,
    })
  ).toString('base64url'),
  'local-bank-statement-storage-signature',
].join('.')

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const webRoot = resolve(repositoryRoot, 'apps', 'web')
const apiEntry = resolve(repositoryRoot, 'apps', 'api', 'dist', 'main.js')
if (!existsSync(apiEntry)) {
  throw new Error('Build @third-code-erp/api before running bank statement browser proof')
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'local-bank-import-admin@thirdcode.invalid',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: false,
}

const profile = {
  tenant_id: TENANT_ID,
  role: 'admin',
  email: user.email,
  full_name: 'Local Bank Import Admin',
}

const signRequests = []
const uploadRequests = []
const storageReadRequests = []
const removeRequests = []
const foreignRequests = []
const uploadedObjects = new Map()
let sql
let webChild
let apiChild
let stopping = false

function corsHeaders(origin) {
  return {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers':
      'apikey, authorization, content-type, x-client-info, x-upsert',
    'access-control-allow-methods': 'DELETE, GET, POST, PUT, OPTIONS',
  }
}

function json(response, status, body, origin = WEB_ORIGIN) {
  response.writeHead(status, corsHeaders(origin))
  response.end(JSON.stringify(body))
}

function bearer(request) {
  const authorization = request.headers.authorization ?? ''
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''
}

async function requestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

function parseJson(raw) {
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    return null
  }
}

function extractMultipartFile(body, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(
    contentType
  )
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]
  if (!boundary) return body
  const marker = Buffer.from(`--${boundary}`)
  const chunks = []
  let cursor = 0
  while (true) {
    const start = body.indexOf(marker, cursor)
    if (start < 0) break
    const partStart = start + marker.length
    const next = body.indexOf(marker, partStart)
    if (next < 0) break
    const part = body.subarray(partStart, next)
    const separator = part.indexOf(Buffer.from('\r\n\r\n'))
    if (separator >= 0) {
      const payload = part
        .subarray(separator + 4)
        .subarray(0, Math.max(0, part.length - separator - 6))
      if (payload.length > 0) chunks.push(payload)
    }
    cursor = next
  }
  return chunks.at(-1) ?? body
}

function storagePathFromUploadUrl(pathname) {
  const prefix = '/storage/v1/object/upload/sign/documents/'
  return decodeURIComponent(pathname.slice(prefix.length))
}

async function seedDatabase() {
  const require = createRequire(import.meta.url)
  const postgres = require(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/database/node_modules/postgres')
  )
  sql = postgres(DATABASE_URL)
  await sql`
    insert into tenants(id, name, slug, organization_type)
    values (${TENANT_ID}, 'Local bank import browser canary', ${`bank-import-${TENANT_ID}`}, 'construction')
  `
  await sql`
    insert into users(id, tenant_id, email, full_name, role)
    values (${USER_ID}, ${TENANT_ID}, ${user.email}, ${profile.full_name}, 'admin')
  `
  await sql`
    insert into ledger_accounts(
      id, tenant_id, code, name, account_type, normal_balance, created_by
    )
    values (
      ${LEDGER_ACCOUNT_ID}, ${TENANT_ID}, '1010', 'Loopback operating bank',
      'asset', 'debit', ${USER_ID}
    )
  `
  await sql`
    insert into cash_accounts(
      id, tenant_id, ledger_account_id, name, account_kind, currency, created_by
    )
    values (
      ${CASH_ACCOUNT_ID}, ${TENANT_ID}, ${LEDGER_ACCOUNT_ID},
      'Loopback operating bank', 'bank', 'PHP', ${USER_ID}
    )
  `
}

const authServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', AUTH_ORIGIN)

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(WEB_ORIGIN))
    return response.end()
  }

  if (url.pathname === '/__harness__/ready') {
    return json(response, 200, { ready: true })
  }
  if (url.pathname === '/__harness__/session') {
    return json(response, 200, {
      accessToken: ACCESS_TOKEN,
      expiresAt: 4_102_444_800,
      user,
    })
  }
  if (url.pathname === '/__harness__/state') {
    const [
      statementCount,
      lineCount,
      importRequestCount,
      auditCount,
      auditEntries,
    ] = await Promise.all([
      sql`
        select count(*)::int as count
        from bank_statements
        where tenant_id = ${TENANT_ID}
      `,
      sql`
        select count(*)::int as count
        from bank_statement_lines
        where tenant_id = ${TENANT_ID}
      `,
      sql`
        select count(*)::int as count
        from bank_statement_import_requests
        where tenant_id = ${TENANT_ID}
      `,
      sql`
        select count(*)::int as count
        from audit_log
        where tenant_id = ${TENANT_ID}
      `,
      sql`
        select entity_type, entity_id, action, diff
        from audit_log
        where tenant_id = ${TENANT_ID}
        order by id asc
      `,
    ])
    return json(response, 200, {
      userId: USER_ID,
      tenantId: TENANT_ID,
      cashAccountId: CASH_ACCOUNT_ID,
      signRequests,
      uploadRequests,
      storageReadRequests,
      removeRequests,
      foreignRequests,
      bankStatementCount: statementCount[0]?.count ?? 0,
      bankStatementLineCount: lineCount[0]?.count ?? 0,
      importRequestCount: importRequestCount[0]?.count ?? 0,
      auditCount: auditCount[0]?.count ?? 0,
      auditEntries,
    })
  }

  if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
    if (
      request.headers.apikey !== ANON_KEY ||
      bearer(request) !== ACCESS_TOKEN
    ) {
      return json(response, 401, {
        code: 'bad_jwt',
        message: 'Invalid local bank import credentials',
      })
    }
    return json(response, 200, user)
  }

  if (request.method === 'GET' && url.pathname === '/rest/v1/users') {
    const exactProfileQuery =
      url.searchParams.get('select') === 'tenant_id,role,email,full_name' &&
      url.searchParams.get('id') === `eq.${USER_ID}`
    if (
      request.headers.apikey !== SERVICE_ROLE_KEY ||
      bearer(request) !== SERVICE_ROLE_KEY ||
      !exactProfileQuery
    ) {
      return json(response, 400, {
        code: 'contract_mismatch',
        message: 'Unexpected local users profile query',
      })
    }
    return json(response, 200, profile)
  }

  if (
    request.method === 'POST' &&
    url.pathname.startsWith('/storage/v1/object/upload/sign/documents/')
  ) {
    const storagePath = storagePathFromUploadUrl(url.pathname)
    const token = `local-upload-${randomUUID()}`
    signRequests.push({
      storagePath,
      path: url.pathname,
      token,
      headers: {
        apikey: request.headers.apikey ?? '',
        authorization: request.headers.authorization ?? '',
      },
    })
    return json(
      response,
      200,
      {
        // storage-js prefixes its configured `/storage/v1` base URL. The
        // Supabase API therefore returns the object path without that prefix.
        url: `${url.pathname.replace(/^\/storage\/v1/, '')}?token=${encodeURIComponent(token)}`,
      },
      WEB_ORIGIN
    )
  }

  if (
    request.method === 'PUT' &&
    url.pathname.startsWith('/storage/v1/object/upload/sign/documents/')
  ) {
    const storagePath = storagePathFromUploadUrl(url.pathname)
    const body = await requestBody(request)
    uploadedObjects.set(
      storagePath,
      extractMultipartFile(body, String(request.headers['content-type'] ?? ''))
    )
    uploadRequests.push({
      storagePath,
      token: url.searchParams.get('token') ?? '',
      bytes: body.byteLength,
      contentType: request.headers['content-type'] ?? '',
    })
    return json(
      response,
      200,
      { Key: `documents/${storagePath}` },
      WEB_ORIGIN
    )
  }

  if (
    request.method === 'POST' &&
    url.pathname.startsWith('/storage/v1/object/sign/documents/')
  ) {
    const storagePath = decodeURIComponent(
      url.pathname.slice('/storage/v1/object/sign/documents/'.length)
    )
    const token = `local-read-${randomUUID()}`
    storageReadRequests.push({
      storagePath,
      token,
      method: 'sign',
      authorization: request.headers.authorization ?? '',
    })
    return json(
      response,
      200,
      {
        // storage-js applies encodeURI to this path; keep the object path
        // unescaped here so slashes are not double-encoded as %252F.
        signedURL: `/object/sign/documents/${storagePath}?token=${encodeURIComponent(token)}`,
      },
      AUTH_ORIGIN
    )
  }

  if (
    request.method === 'GET' &&
    url.pathname.startsWith('/storage/v1/object/sign/documents/')
  ) {
    const storagePath = decodeURIComponent(
      url.pathname.slice('/storage/v1/object/sign/documents/'.length)
    )
    const body = uploadedObjects.get(storagePath)
    storageReadRequests.push({
      storagePath,
      token: url.searchParams.get('token') ?? '',
      method: 'read',
    })
    if (!body) {
      response.writeHead(404, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      })
      return response.end(JSON.stringify({ error: 'object_not_found' }))
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'text/csv; charset=utf-8',
      'content-length': String(body.byteLength),
    })
    return response.end(body)
  }

  if (
    request.method === 'DELETE' &&
    url.pathname === '/storage/v1/object/documents'
  ) {
    const body = parseJson(await requestBody(request))
    const prefixes = Array.isArray(body?.prefixes) ? body.prefixes : []
    removeRequests.push({
      prefixes,
      authorization: request.headers.authorization ?? '',
    })
    return json(response, 200, [], WEB_ORIGIN)
  }

  foreignRequests.push({
    origin: AUTH_ORIGIN,
    method: request.method ?? 'GET',
    path: url.pathname,
  })
  return json(response, 404, {
    code: 'unsupported_contract',
    message: `${request.method ?? 'GET'} ${url.pathname} is not supported`,
  })
})


function listen(server, port) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(port, HOST, () => {
      server.removeListener('error', reject)
      resolveListen()
    })
  })
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'not attempted'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`)
}

async function cleanup() {
  if (!sql) return
  try {
    await sql`delete from audit_log where tenant_id = ${TENANT_ID}`
    await sql`delete from tenants where id = ${TENANT_ID}`
  } catch (error) {
    console.error('[bank-import-loopback] cleanup failed', error)
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined)
  }
}

async function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  if (webChild && !webChild.killed) webChild.kill('SIGTERM')
  if (apiChild && !apiChild.killed) apiChild.kill('SIGTERM')
  await new Promise((resolveClose) => authServer.close(() => resolveClose()))
  await cleanup()
  process.exitCode = exitCode
}

await seedDatabase()
await listen(authServer, AUTH_PORT)

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const apiEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL,
  REDIS_URL: 'redis://127.0.0.1:6379',
  SUPABASE_URL: AUTH_ORIGIN,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  ERP_API_CORS_ORIGINS: WEB_ORIGIN,
  ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED: 'true',
  ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_TENANT_IDS: TENANT_ID,
  OPENAI_API_KEY: '',
  AI_GATEWAY_API_KEY: '',
  AI_PROVIDER_API_KEY: '',
  INNGEST_EVENT_KEY: '',
  NEXT_TELEMETRY_DISABLED: '1',
}
delete apiEnvironment.AI_WORKER_URL
delete apiEnvironment.AI_WORKER_SHARED_SECRET
apiChild = spawn(process.execPath, [apiEntry], {
  cwd: repositoryRoot,
  env: apiEnvironment,
  stdio: 'inherit',
})
apiChild.on('error', (error) => {
  console.error('[bank-import-loopback] API process failed', error)
  void stop(1)
})
apiChild.on('exit', (code) => {
  if (!stopping) void stop(code ?? 1)
})
await waitForHttp(`${API_ORIGIN}/ready`)

webChild = spawn(
  process.execPath,
  [nextBin, 'dev', '--hostname', HOST, '--port', String(WEB_PORT)],
  {
    cwd: webRoot,
    env: {
      ...process.env,
      DATABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: WEB_ORIGIN,
      NEXT_PUBLIC_APP_URL: WEB_ORIGIN,
      ERP_CORE_API_URL: API_ORIGIN,
      ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_VIA_API: 'true',
      ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS: 'true',
      ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS: TENANT_ID,
      ERP_CORTEX_SEARCH_VIA_API: 'false',
      ERP_CORTEX_SEARCH_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_GRAPH_READS_VIA_API: 'false',
      ERP_CORTEX_GRAPH_READS_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_ENTITY_READS_VIA_API: 'false',
      ERP_CORTEX_ENTITY_READS_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API: 'false',
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_LEGACY_EMBED_ENABLED: 'false',
      ERP_CORTEX_LEGACY_EMBED_TENANT_IDS: '',
      AI_WORKER_URL: '',
      AI_WORKER_SHARED_SECRET: '',
      AI_WORKER_TIMEOUT_MS: '',
      OPENAI_API_KEY: '',
      AI_GATEWAY_API_KEY: '',
      INNGEST_EVENT_KEY: '',
      VERCEL: '',
      VERCEL_ENV: '',
      VERCEL_GIT_COMMIT_SHA: '',
      VERCEL_PROJECT_PRODUCTION_URL: '',
      RAILWAY_GIT_COMMIT_SHA: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
  }
)

webChild.on('exit', (code) => void stop(code ?? 1))
webChild.on('error', (error) => {
  console.error('[bank-import-loopback] Next process failed', error)
  void stop(1)
})
process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
