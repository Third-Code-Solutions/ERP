import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const WEB_PORT = 4395
const AUTH_PORT = 4396
const PROXY_PORT = 4397
const API_PORT = 4398
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`
const AUTH_ORIGIN = `http://${HOST}:${AUTH_PORT}`
const PROXY_ORIGIN = `http://${HOST}:${PROXY_PORT}`
const API_ORIGIN = `http://${HOST}:${API_PORT}`
const DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const USER_ID = randomUUID()
const TENANT_ID = randomUUID()
const CASH_LEDGER_ID = randomUUID()
const PAYABLE_LEDGER_ID = randomUUID()
const CASH_ACCOUNT_ID = randomUUID()
const BUSINESS_ACCOUNT_ID = randomUUID()
const VENDOR_ID = randomUUID()
const PERIOD_ID = randomUUID()
const RECEIPT_ID = randomUUID()
const DISBURSEMENT_ID = randomUUID()
const DRAFT_ID = randomUUID()
const REVERSED_ID = randomUUID()
const RECEIPT_JOURNAL_ID = randomUUID()
const DISBURSEMENT_JOURNAL_ID = randomUUID()
const REVERSED_JOURNAL_ID = randomUUID()
const REVERSAL_JOURNAL_ID = randomUUID()
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
  'local-finance-cash-signature',
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
  throw new Error('Build @third-code-erp/api before running finance cash browser proof')
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'local-finance-cash@thirdcode.invalid',
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
  full_name: 'Local Finance Cash',
}

const cashRequests = []
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
    'access-control-allow-methods': 'GET, OPTIONS, POST',
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
    values (
      ${TENANT_ID},
      'Local finance cash browser canary',
      ${`finance-cash-${TENANT_ID}`},
      'construction'
    )
  `
  await sql`
    insert into users(id, tenant_id, email, full_name, role)
    values (${USER_ID}, ${TENANT_ID}, ${user.email}, ${profile.full_name}, 'finance')
  `
  await sql`
    insert into ledger_accounts(
      id, tenant_id, code, name, account_type, normal_balance, system_key,
      created_by
    )
    values
      (
        ${CASH_LEDGER_ID}, ${TENANT_ID}, '1000', 'Loopback cash ledger',
        'asset', 'debit', 'cash', ${USER_ID}
      ),
      (
        ${PAYABLE_LEDGER_ID}, ${TENANT_ID}, '2000', 'Loopback payable ledger',
        'liability', 'credit', 'accounts_payable', ${USER_ID}
      )
  `
  await sql`
    insert into cash_accounts(
      id, tenant_id, ledger_account_id, name, account_kind, currency, created_by
    )
    values (
      ${CASH_ACCOUNT_ID}, ${TENANT_ID}, ${CASH_LEDGER_ID},
      'Loopback operating cash', 'bank', 'PHP', ${USER_ID}
    )
  `
  await sql`
    insert into accounts(id, tenant_id, name, created_by)
    values (${BUSINESS_ACCOUNT_ID}, ${TENANT_ID}, 'Loopback customer account', ${USER_ID})
  `
  await sql`
    insert into vendors(id, tenant_id, name)
    values (${VENDOR_ID}, ${TENANT_ID}, 'Loopback cash vendor')
  `
  await sql`
    insert into fiscal_periods(
      id, tenant_id, name, starts_on, ends_on, status, created_by
    )
    values (
      ${PERIOD_ID}, ${TENANT_ID}, 'FY 2026 loopback cash',
      '2026-01-01', '2026-12-31', 'open', ${USER_ID}
    )
  `
  await sql`
    insert into journal_entries(
      id, tenant_id, fiscal_period_id, entry_number, status, source_type,
      posting_date, description, currency, reverses_entry_id, created_by,
      posted_by, posted_at
    )
    values
      (
        ${RECEIPT_JOURNAL_ID}, ${TENANT_ID}, ${PERIOD_ID}, 'JE-LOOPBACK-CASH-001',
        'posted', 'system', '2026-08-01', 'Loopback receipt journal',
        'PHP', null, ${USER_ID}, ${USER_ID}, '2026-08-01T03:00:00Z'
      ),
      (
        ${DISBURSEMENT_JOURNAL_ID}, ${TENANT_ID}, ${PERIOD_ID}, 'JE-LOOPBACK-CASH-002',
        'posted', 'system', '2026-08-02', 'Loopback disbursement journal',
        'PHP', null, ${USER_ID}, ${USER_ID}, '2026-08-02T03:00:00Z'
      ),
      (
        ${REVERSED_JOURNAL_ID}, ${TENANT_ID}, ${PERIOD_ID}, 'JE-LOOPBACK-CASH-003',
        'posted', 'system', '2026-08-04', 'Loopback reversed journal',
        'PHP', null, ${USER_ID}, ${USER_ID}, '2026-08-04T03:00:00Z'
      ),
      (
        ${REVERSAL_JOURNAL_ID}, ${TENANT_ID}, ${PERIOD_ID}, 'JE-LOOPBACK-CASH-004',
        'posted', 'reversal', '2026-08-04', 'Loopback reversal journal',
        'PHP', ${REVERSED_JOURNAL_ID}, ${USER_ID}, ${USER_ID}, '2026-08-04T04:00:00Z'
      )
  `
  await sql`
    insert into cash_transactions(
      id, tenant_id, cash_account_id, direction, business_account_id, vendor_id,
      reference_number, internal_number, status, transaction_date, currency,
      amount_cents, posting_journal_entry_id, posted_by, posted_at,
      reversal_journal_entry_id, reversed_by, reversed_at, reversal_reason,
      created_by
    )
    values
      (
        ${RECEIPT_ID}, ${TENANT_ID}, ${CASH_ACCOUNT_ID}, 'receipt',
        ${BUSINESS_ACCOUNT_ID}, null, 'RCT-LOOPBACK-CASH-001',
        'CT-LOOPBACK-CASH-RECEIPT', 'posted', '2026-08-01', 'PHP', 12500,
        ${RECEIPT_JOURNAL_ID}, ${USER_ID}, '2026-08-01T03:00:00Z',
        null, null, null, null, ${USER_ID}
      ),
      (
        ${DISBURSEMENT_ID}, ${TENANT_ID}, ${CASH_ACCOUNT_ID}, 'disbursement',
        null, ${VENDOR_ID}, 'DSP-LOOPBACK-CASH-001',
        'CT-LOOPBACK-CASH-DISBURSEMENT', 'posted', '2026-08-02', 'PHP', 85000,
        ${DISBURSEMENT_JOURNAL_ID}, ${USER_ID}, '2026-08-02T03:00:00Z',
        null, null, null, null, ${USER_ID}
      ),
      (
        ${DRAFT_ID}, ${TENANT_ID}, ${CASH_ACCOUNT_ID}, 'receipt',
        ${BUSINESS_ACCOUNT_ID}, null, 'RCT-LOOPBACK-CASH-DRAFT',
        null, 'draft', '2026-08-03', 'PHP', 3000,
        null, null, null, null, null, null, null, ${USER_ID}
      ),
      (
        ${REVERSED_ID}, ${TENANT_ID}, ${CASH_ACCOUNT_ID}, 'disbursement',
        null, ${VENDOR_ID}, 'DSP-LOOPBACK-CASH-REVERSED',
        'CT-LOOPBACK-CASH-REVERSED', 'reversed', '2026-08-04', 'PHP', 4200,
        ${REVERSED_JOURNAL_ID}, ${USER_ID}, '2026-08-04T03:00:00Z',
        ${REVERSAL_JOURNAL_ID}, ${USER_ID}, '2026-08-04T04:00:00Z',
        'Duplicate cash evidence', ${USER_ID}
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
      cashAccountId: CASH_ACCOUNT_ID,
      cashRequests,
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
        message: 'Invalid local finance cash credentials',
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
  if (request.method === 'GET' && url.pathname === '/v1/finance/cash-transactions') {
    cashRequests.push({
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
    console.error('[finance-cash-loopback] cleanup failed', error)
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
  console.error('[finance-cash-loopback] fixture startup failed', error)
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
  ERP_FINANCE_CASH_READS_ENABLED: 'true',
  ERP_FINANCE_CASH_READS_TENANT_IDS: TENANT_ID,
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
  console.error('[finance-cash-loopback] API process failed', error)
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
      ERP_FINANCE_CASH_READS_VIA_API: 'true',
      ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_FINANCE_PAYABLES_READS_VIA_API: 'false',
      ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS: '',
      ERP_FINANCE_RECEIVABLES_READS_VIA_API: 'false',
      ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS: '',
      ERP_FINANCE_LEDGER_READS_VIA_API: 'false',
      ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS: '',
      ERP_FINANCE_RECONCILIATION_READS_VIA_API: 'false',
      ERP_FINANCE_RECONCILIATION_READS_VIA_API_TENANT_IDS: '',
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
  console.error('[finance-cash-loopback] Next process failed', error)
  void stop(1)
})
process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
