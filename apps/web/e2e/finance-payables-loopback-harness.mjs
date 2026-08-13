import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const WEB_PORT = 4391
const AUTH_PORT = 4392
const PROXY_PORT = 4393
const API_PORT = 4394
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`
const AUTH_ORIGIN = `http://${HOST}:${AUTH_PORT}`
const PROXY_ORIGIN = `http://${HOST}:${PROXY_PORT}`
const API_ORIGIN = `http://${HOST}:${API_PORT}`
const DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const USER_ID = randomUUID()
const TENANT_ID = randomUUID()
const PROJECT_ID = randomUUID()
const VENDOR_ID = randomUUID()
const COST_CODE_ID = randomUUID()
const PERIOD_ID = randomUUID()
const PAYABLE_ACCOUNT_ID = randomUUID()
const VAT_ACCOUNT_ID = randomUUID()
const WITHHOLDING_ACCOUNT_ID = randomUUID()
const EXPENSE_ACCOUNT_ID = randomUUID()
const OVERDUE_BILL_ID = randomUUID()
const CURRENT_BILL_ID = randomUUID()
const DRAFT_BILL_ID = randomUUID()
const OVERDUE_PO_ID = randomUUID()
const CURRENT_PO_ID = randomUUID()
const DRAFT_PO_ID = randomUUID()
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
  'local-finance-payables-signature',
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
  throw new Error('Build @third-code-erp/api before running finance payables browser proof')
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'local-finance-payables@thirdcode.invalid',
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
  full_name: 'Local Finance Payables',
}

const payablesRequests = []
const unsupportedRequests = []
let postedInternalNumbers = []
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
      'Local finance payables browser canary',
      ${`finance-payables-${TENANT_ID}`},
      'construction'
    )
  `
  await sql`
    insert into users(id, tenant_id, email, full_name, role)
    values (${USER_ID}, ${TENANT_ID}, ${user.email}, ${profile.full_name}, 'finance')
  `
  await sql`
    insert into projects(id, tenant_id, name, client, created_by)
    values (
      ${PROJECT_ID}, ${TENANT_ID}, 'Loopback payables project',
      'Loopback supplier client', ${USER_ID}
    )
  `
  await sql`
    insert into vendors(id, tenant_id, name)
    values (${VENDOR_ID}, ${TENANT_ID}, 'Loopback supplier vendor')
  `
  await sql`
    insert into cost_codes(
      id, tenant_id, code, name, category, created_by
    )
    values (
      ${COST_CODE_ID}, ${TENANT_ID}, 'MAT-LOOPBACK-PAYABLES',
      'Loopback supplier materials', 'material', ${USER_ID}
    )
  `
  await sql`
    insert into fiscal_periods(
      id, tenant_id, name, starts_on, ends_on, status, created_by
    )
    values (
      ${PERIOD_ID}, ${TENANT_ID}, 'FY 2026 loopback payables',
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
        ${PAYABLE_ACCOUNT_ID}, ${TENANT_ID}, '2000', 'Accounts payable',
        'liability', 'credit', 'accounts_payable', ${USER_ID}
      ),
      (
        ${VAT_ACCOUNT_ID}, ${TENANT_ID}, '1130', 'Input VAT receivable',
        'asset', 'debit', 'input_vat_receivable', ${USER_ID}
      ),
      (
        ${WITHHOLDING_ACCOUNT_ID}, ${TENANT_ID}, '2110',
        'Withholding tax payable', 'liability', 'credit',
        'withholding_tax_payable', ${USER_ID}
      ),
      (
        ${EXPENSE_ACCOUNT_ID}, ${TENANT_ID}, '6100', 'Project materials',
        'expense', 'debit', null, ${USER_ID}
      )
  `

  const specs = [
    {
      key: 'overdue',
      billId: OVERDUE_BILL_ID,
      purchaseOrderId: OVERDUE_PO_ID,
      status: 'posted',
      billDate: '2026-07-01',
      dueDate: '2026-07-01',
      subtotalCents: 100000,
      vatCents: 12000,
      withholdingCents: 2000,
    },
    {
      key: 'current',
      billId: CURRENT_BILL_ID,
      purchaseOrderId: CURRENT_PO_ID,
      status: 'posted',
      billDate: '2026-08-01',
      dueDate: '2026-09-01',
      subtotalCents: 50000,
      vatCents: 6000,
      withholdingCents: 1000,
    },
    {
      key: 'draft',
      billId: DRAFT_BILL_ID,
      purchaseOrderId: DRAFT_PO_ID,
      status: 'draft',
      billDate: '2026-08-05',
      dueDate: '2026-08-15',
      subtotalCents: 30000,
      vatCents: 3600,
      withholdingCents: 600,
    },
  ]

  for (const spec of specs) {
    const purchaseOrderLineId = randomUUID()
    const totalCents =
      spec.subtotalCents + spec.vatCents - spec.withholdingCents
    await sql`
      insert into purchase_orders(
        id, tenant_id, project_id, vendor_id, created_by, po_number, status,
        subtotal_cents, vat_cents, withholding_tax_cents, total_cents
      )
      values (
        ${spec.purchaseOrderId}, ${TENANT_ID}, ${PROJECT_ID}, ${VENDOR_ID},
        ${USER_ID}, ${`PO-LOOPBACK-PAYABLES-${spec.key.toUpperCase()}`},
        'issued', ${spec.subtotalCents}, ${spec.vatCents},
        ${spec.withholdingCents}, ${totalCents}
      )
    `
    await sql`
      insert into po_line_items(
        id, tenant_id, po_id, sort_order, description, cost_code_id,
        quantity, quantity_micros, unit_cost_cents, line_total_cents
      )
      values (
        ${purchaseOrderLineId}, ${TENANT_ID}, ${spec.purchaseOrderId}, 1,
        ${`Loopback supplier materials ${spec.key}`}, ${COST_CODE_ID},
        1, 1000000, ${spec.subtotalCents}, ${spec.subtotalCents}
      )
    `
    await sql`
      insert into supplier_bills(
        id, tenant_id, purchase_order_id, project_id, vendor_id,
        vendor_bill_number, bill_date, due_date, subtotal_cents,
        input_vat_cents, withholding_tax_cents, total_payable_cents, created_by
      )
      values (
        ${spec.billId}, ${TENANT_ID}, ${spec.purchaseOrderId}, ${PROJECT_ID},
        ${VENDOR_ID}, ${`SI-LOOPBACK-PAYABLES-${spec.key.toUpperCase()}`},
        ${spec.billDate}::date, ${spec.dueDate}::date, ${spec.subtotalCents},
        ${spec.vatCents}, ${spec.withholdingCents}, ${totalCents}, ${USER_ID}
      )
    `
    await sql`
      insert into supplier_bill_lines(
        tenant_id, supplier_bill_id, ledger_account_id, project_id,
        po_line_item_id, cost_code_id, line_number, description, amount_cents
      )
      values (
        ${TENANT_ID}, ${spec.billId}, ${EXPENSE_ACCOUNT_ID}, ${PROJECT_ID},
        ${purchaseOrderLineId}, ${COST_CODE_ID}, 1,
        ${`Loopback supplier materials ${spec.key}`}, ${spec.subtotalCents}
      )
    `
    if (spec.status === 'posted') {
      await sql`
        select * from public.post_supplier_bill(
          ${spec.billId}::uuid, ${USER_ID}::uuid, ${spec.billDate}::date
        )
      `
    }
  }

  const posted = await sql`
    select id, internal_number
    from supplier_bills
    where tenant_id = ${TENANT_ID} and status = 'posted'
    order by bill_date desc
  `
  postedInternalNumbers = posted.map((row) => row.internal_number)
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
      projectId: PROJECT_ID,
      vendorId: VENDOR_ID,
      postedInternalNumbers,
      payablesRequests,
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
        message: 'Invalid local finance payables credentials',
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
  if (request.method === 'GET' && url.pathname === '/v1/finance/payables') {
    payablesRequests.push({
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
    console.error('[finance-payables-loopback] cleanup failed', error)
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
  console.error('[finance-payables-loopback] fixture startup failed', error)
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
  ERP_FINANCE_PAYABLES_READS_ENABLED: 'true',
  ERP_FINANCE_PAYABLES_READS_TENANT_IDS: TENANT_ID,
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
  console.error('[finance-payables-loopback] API process failed', error)
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
      ERP_FINANCE_PAYABLES_READS_VIA_API: 'true',
      ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_FINANCE_RECEIVABLES_READS_VIA_API: 'false',
      ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS: '',
      ERP_FINANCE_LEDGER_READS_VIA_API: 'false',
      ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS: '',
      ERP_FINANCE_CASH_READS_VIA_API: 'false',
      ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS: '',
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
  console.error('[finance-payables-loopback] Next process failed', error)
  void stop(1)
})
process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
