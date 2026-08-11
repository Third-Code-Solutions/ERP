import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const WEB_PORT = 4387
const AUTH_PORT = 4388
const PROXY_PORT = 4389
const API_PORT = 4390
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`
const AUTH_ORIGIN = `http://${HOST}:${AUTH_PORT}`
const PROXY_ORIGIN = `http://${HOST}:${PROXY_PORT}`
const API_ORIGIN = `http://${HOST}:${API_PORT}`
const DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const USER_ID = randomUUID()
const TENANT_ID = randomUUID()
const ACCOUNT_ID = randomUUID()
const PROJECT_ID = randomUUID()
const PERIOD_ID = randomUUID()
const AR_ACCOUNT_ID = randomUUID()
const RETENTION_ACCOUNT_ID = randomUUID()
const WITHHOLDING_ACCOUNT_ID = randomUUID()
const VAT_ACCOUNT_ID = randomUUID()
const REVENUE_ACCOUNT_ID = randomUUID()
const OVERDUE_INVOICE_ID = randomUUID()
const CURRENT_INVOICE_ID = randomUUID()
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
  'local-finance-receivables-signature',
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
  throw new Error('Build @third-code-erp/api before running finance receivables browser proof')
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'local-finance-receivables@thirdcode.invalid',
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
  full_name: 'Local Finance Receivables',
}

const receivablesRequests = []
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
    values (
      ${TENANT_ID},
      'Local finance receivables browser canary',
      ${`finance-receivables-${TENANT_ID}`},
      'construction'
    )
  `
  await sql`
    insert into users(id, tenant_id, email, full_name, role)
    values (${USER_ID}, ${TENANT_ID}, ${user.email}, ${profile.full_name}, 'finance')
  `
  await sql`
    insert into accounts(id, tenant_id, name, created_by)
    values (${ACCOUNT_ID}, ${TENANT_ID}, 'Loopback customer account', ${USER_ID})
  `
  await sql`
    insert into projects(
      id, tenant_id, account_id, name, client, created_by
    )
    values (
      ${PROJECT_ID}, ${TENANT_ID}, ${ACCOUNT_ID},
      'Loopback receivables project', 'Loopback customer', ${USER_ID}
    )
  `
  await sql`
    insert into fiscal_periods(
      id, tenant_id, name, starts_on, ends_on, status, created_by
    )
    values (
      ${PERIOD_ID}, ${TENANT_ID}, 'FY 2026 loopback receivables',
      '2026-01-01', '2026-12-31', 'open', ${USER_ID}
    )
  `
  await sql`
    insert into ledger_accounts(
      id, tenant_id, code, name, account_type, normal_balance, system_key,
      created_by
    )
    values
      (
        ${AR_ACCOUNT_ID}, ${TENANT_ID}, '1100', 'Accounts receivable',
        'asset', 'debit', 'accounts_receivable', ${USER_ID}
      ),
      (
        ${RETENTION_ACCOUNT_ID}, ${TENANT_ID}, '1110', 'Retention receivable',
        'asset', 'debit', 'retention_receivable', ${USER_ID}
      ),
      (
        ${WITHHOLDING_ACCOUNT_ID}, ${TENANT_ID}, '1120',
        'Withholding tax receivable', 'asset', 'debit',
        'withholding_tax_receivable', ${USER_ID}
      ),
      (
        ${VAT_ACCOUNT_ID}, ${TENANT_ID}, '2100', 'Output VAT payable',
        'liability', 'credit', 'output_vat_payable', ${USER_ID}
      ),
      (
        ${REVENUE_ACCOUNT_ID}, ${TENANT_ID}, '4000', 'Project revenue',
        'income', 'credit', 'revenue', ${USER_ID}
      )
  `
  await sql`
    insert into invoices(
      id, tenant_id, project_id, account_id, created_by, invoice_number,
      billing_percent_bps, retention_bps, subtotal_cents, retention_cents,
      vat_cents, withholding_tax_cents, net_amount_cents, due_date
    )
    values (
      ${OVERDUE_INVOICE_ID}, ${TENANT_ID}, ${PROJECT_ID}, ${ACCOUNT_ID},
      ${USER_ID}, 'INV-LOOPBACK-OVERDUE', 10000, 1000, 100000, 10000,
      10800, 1800, 99000, '2026-07-01T00:00:00.000Z'::timestamptz
    ), (
      ${CURRENT_INVOICE_ID}, ${TENANT_ID}, ${PROJECT_ID}, ${ACCOUNT_ID},
      ${USER_ID}, 'INV-LOOPBACK-CURRENT', 10000, 1000, 50000, 5000,
      5400, 900, 49500, '2026-09-01T00:00:00.000Z'::timestamptz
    )
  `
  await sql`
    select * from public.issue_customer_invoice(
      ${OVERDUE_INVOICE_ID}::uuid,
      ${USER_ID}::uuid,
      '2026-07-01'::date
    )
  `
  await sql`
    select * from public.issue_customer_invoice(
      ${CURRENT_INVOICE_ID}::uuid,
      ${USER_ID}::uuid,
      '2026-08-01'::date
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
      accountId: ACCOUNT_ID,
      projectId: PROJECT_ID,
      overdueInvoiceId: OVERDUE_INVOICE_ID,
      currentInvoiceId: CURRENT_INVOICE_ID,
      receivablesRequests,
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
        message: 'Invalid local finance receivables credentials',
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
  if (request.method === 'GET' && url.pathname === '/v1/finance/receivables') {
    receivablesRequests.push({
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
    console.error('[finance-receivables-loopback] cleanup failed', error)
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
  console.error('[finance-receivables-loopback] fixture startup failed', error)
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
  ERP_FINANCE_RECEIVABLES_READS_ENABLED: 'true',
  ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS: TENANT_ID,
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
  console.error('[finance-receivables-loopback] API process failed', error)
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
      ERP_FINANCE_RECEIVABLES_READS_VIA_API: 'true',
      ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS: TENANT_ID,
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
  console.error('[finance-receivables-loopback] Next process failed', error)
  void stop(1)
})
process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
