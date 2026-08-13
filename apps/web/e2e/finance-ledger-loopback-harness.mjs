import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const WEB_PORT = 4377
const AUTH_PORT = 4378
const PROXY_PORT = 4379
const API_PORT = 4380
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`
const AUTH_ORIGIN = `http://${HOST}:${AUTH_PORT}`
const PROXY_ORIGIN = `http://${HOST}:${PROXY_PORT}`
const API_ORIGIN = `http://${HOST}:${API_PORT}`
const DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const USER_ID = randomUUID()
const TENANT_ID = randomUUID()
const PERIOD_ID = randomUUID()
const DEBIT_ACCOUNT_ID = randomUUID()
const CREDIT_ACCOUNT_ID = randomUUID()
const JOURNAL_ENTRY_ID = randomUUID()
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
  'local-finance-ledger-signature',
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
  throw new Error('Build @third-code-erp/api before running finance ledger browser proof')
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'local-finance-ledger@thirdcode.invalid',
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
  role: 'finance',
  email: user.email,
  full_name: 'Local Finance Ledger',
}

const ledgerRequests = []
const unsupportedRequests = []
let sql
let webChild
let apiChild
let authServer
let proxyServer
let stopping = false

function corsHeaders(origin) {
  return {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers':
      'apikey, authorization, content-type, x-client-info, x-request-id',
    'access-control-allow-methods': 'GET, OPTIONS',
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

async function seedDatabase() {
  const require = createRequire(import.meta.url)
  const postgres = require(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../packages/database/node_modules/postgres'
    )
  )
  sql = postgres(DATABASE_URL)
  await sql`
    insert into tenants(id, name, slug, organization_type)
    values (${TENANT_ID}, 'Local finance ledger browser canary', ${`finance-ledger-${TENANT_ID}`}, 'construction')
  `
  await sql`
    insert into users(id, tenant_id, email, full_name, role)
    values (${USER_ID}, ${TENANT_ID}, ${user.email}, ${profile.full_name}, 'finance')
  `
  await sql`
    insert into fiscal_periods(
      id, tenant_id, name, starts_on, ends_on, status, created_by
    )
    values (
      ${PERIOD_ID}, ${TENANT_ID}, 'FY 2026 loopback ledger',
      '2026-01-01', '2026-12-31', 'open', ${USER_ID}
    )
  `
  await sql`
    insert into ledger_accounts(
      id, tenant_id, code, name, account_type, normal_balance, created_by
    )
    values
      (
        ${DEBIT_ACCOUNT_ID}, ${TENANT_ID}, '1100', 'Loopback debit account',
        'asset', 'debit', ${USER_ID}
      ),
      (
        ${CREDIT_ACCOUNT_ID}, ${TENANT_ID}, '4000', 'Loopback credit account',
        'income', 'credit', ${USER_ID}
      )
  `
  await sql`
    insert into journal_entries(
      id, tenant_id, status, source_type, posting_date, description,
      currency, created_by
    )
    values (
      ${JOURNAL_ENTRY_ID}, ${TENANT_ID}, 'draft', 'manual',
      '2026-08-01', 'Loopback finance ledger browser entry',
      'PHP', ${USER_ID}
    )
  `
  await sql`
    insert into journal_lines(
      tenant_id, journal_entry_id, ledger_account_id, line_number,
      description, debit_cents, credit_cents
    )
    values
      (
        ${TENANT_ID}, ${JOURNAL_ENTRY_ID}, ${DEBIT_ACCOUNT_ID}, 1,
        'Loopback debit line', 10000, 0
      ),
      (
        ${TENANT_ID}, ${JOURNAL_ENTRY_ID}, ${CREDIT_ACCOUNT_ID}, 2,
        'Loopback credit line', 0, 10000
      )
  `
  await sql`
    select * from public.post_journal_entry(
      ${JOURNAL_ENTRY_ID}::uuid,
      ${USER_ID}::uuid
    )
  `
}

authServer = createServer(async (request, response) => {
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
  if (request.method === 'POST' && url.pathname === '/__harness__/cleanup') {
    await cleanup()
    return json(response, 200, { cleaned: true })
  }
  if (url.pathname === '/__harness__/state') {
    return json(response, 200, {
      userId: USER_ID,
      tenantId: TENANT_ID,
      debitAccountId: DEBIT_ACCOUNT_ID,
      creditAccountId: CREDIT_ACCOUNT_ID,
      journalEntryId: JOURNAL_ENTRY_ID,
      ledgerRequests,
      unsupportedRequests,
    })
  }
  if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
    if (
      request.headers.apikey !== ANON_KEY ||
      bearer(request) !== ACCESS_TOKEN
    ) {
      return json(response, 401, {
        code: 'bad_jwt',
        message: 'Invalid local finance ledger credentials',
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

  unsupportedRequests.push({
    method: request.method ?? 'GET',
    path: url.pathname,
  })
  return json(response, 404, {
    code: 'unsupported_contract',
    message: `${request.method ?? 'GET'} ${url.pathname} is not supported`,
  })
})

proxyServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', PROXY_ORIGIN)
  if (request.method === 'GET' && url.pathname === '/v1/finance/ledger') {
    ledgerRequests.push({
      path: `${url.pathname}${url.search}`,
      authorization: request.headers.authorization ?? '',
      requestId: request.headers['x-request-id'] ?? '',
    })
  }

  try {
    const upstream = await fetch(`${API_ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers: {
        authorization: request.headers.authorization ?? '',
        'x-request-id': request.headers['x-request-id'] ?? '',
      },
    })
    const body = Buffer.from(await upstream.arrayBuffer())
    response.writeHead(upstream.status, {
      'cache-control': 'no-store',
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    })
    response.end(body)
  } catch (error) {
    response.writeHead(502, corsHeaders(WEB_ORIGIN))
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      })
    )
  }
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

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

async function cleanup() {
  if (!sql) return
  const connection = sql
  try {
    await connection.begin(async (transaction) => {
      // The fixture deliberately posts an immutable journal. Cleanup is
      // restricted to this random tenant and bypasses test-only triggers so a
      // failed browser run cannot leave local CI data behind.
      await transaction.unsafe("set local session_replication_role = 'replica'")
      const tables = await transaction.unsafe(
        "select c.table_schema, c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE' where c.column_name='tenant_id' and c.table_schema='public' and c.table_name <> 'tenants' order by c.table_name"
      )
      for (const table of tables) {
        const name = `${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`
        await transaction.unsafe(
          `delete from ${name} where tenant_id = $1::uuid`,
          [TENANT_ID]
        )
      }
      await transaction.unsafe('delete from tenants where id = $1::uuid', [TENANT_ID])
    })
  } catch (error) {
    console.error('[finance-ledger-loopback] cleanup failed', error)
  } finally {
    await connection.end({ timeout: 5 }).catch(() => undefined)
    sql = null
  }
}

function closeServer(server) {
  return new Promise((resolveClose) => {
    if (!server?.listening) return resolveClose()
    server.close(() => resolveClose())
  })
}

async function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  if (webChild && !webChild.killed) webChild.kill('SIGTERM')
  if (apiChild && !apiChild.killed) apiChild.kill('SIGTERM')
  await closeServer(authServer)
  await closeServer(proxyServer)
  await cleanup()
  process.exitCode = exitCode
}

try {
  await seedDatabase()
  await listen(authServer, AUTH_PORT)
  await listen(proxyServer, PROXY_PORT)
} catch (error) {
  console.error('[finance-ledger-loopback] fixture startup failed', error)
  await cleanup()
  process.exitCode = 1
}

if (process.exitCode === 1) process.exit()

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
  ERP_FINANCE_LEDGER_READS_ENABLED: 'true',
  ERP_FINANCE_LEDGER_READS_TENANT_IDS: TENANT_ID,
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
  console.error('[finance-ledger-loopback] API process failed', error)
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
      NODE_ENV: 'test',
      DATABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: WEB_ORIGIN,
      NEXT_PUBLIC_APP_URL: WEB_ORIGIN,
      ERP_CORE_API_URL: PROXY_ORIGIN,
      ERP_FINANCE_LEDGER_READS_VIA_API: 'true',
      ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS: TENANT_ID,
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
  console.error('[finance-ledger-loopback] Next process failed', error)
  void stop(1)
})
process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
