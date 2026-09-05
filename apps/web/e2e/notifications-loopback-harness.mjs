import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const AUTH_PORT = 4418
const WEB_PORT = 4417
const PROXY_PORT = 4419
const API_PORT = 4420
const AUTH_ORIGIN = `http://${HOST}:${AUTH_PORT}`
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`
const PROXY_ORIGIN = `http://${HOST}:${PROXY_PORT}`
const API_ORIGIN = `http://${HOST}:${API_PORT}`
const DEFAULT_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const DATABASE_URL =
  process.env.E2E_NOTIFICATIONS_DATABASE_URL ?? DEFAULT_DATABASE_URL
const REDIS_URL =
  process.env.E2E_NOTIFICATIONS_REDIS_URL ?? 'redis://127.0.0.1:6379'
const databaseUrl = new URL(DATABASE_URL)
const redisUrl = new URL(REDIS_URL)
const usesLoopbackDatabase =
  databaseUrl.hostname === '127.0.0.1' || databaseUrl.hostname === 'localhost'
const usesLoopbackRedis =
  redisUrl.hostname === '127.0.0.1' || redisUrl.hostname === 'localhost'
const expectedHostedDatabaseHost =
  process.env.E2E_NOTIFICATIONS_EXPECTED_DATABASE_HOST
const expectedHostedDatabaseUser =
  process.env.E2E_NOTIFICATIONS_EXPECTED_DATABASE_USER

// The default lane is strictly local. A disposable hosted branch database can
// be used only with a deliberate opt-in, never by silently inheriting a shell
// DATABASE_URL that could point at a customer environment.
if (!usesLoopbackDatabase) {
  if (
    process.env.E2E_NOTIFICATIONS_ALLOW_ISOLATED_HOSTED_DATABASE !== 'true'
  ) {
    throw new Error(
      'Refusing a non-loopback notifications E2E database without E2E_NOTIFICATIONS_ALLOW_ISOLATED_HOSTED_DATABASE=true.'
    )
  }

  if (!expectedHostedDatabaseHost || !expectedHostedDatabaseUser) {
    throw new Error(
      'Hosted notifications E2E requires an exact expected database host and user.'
    )
  }

  if (
    databaseUrl.hostname !== expectedHostedDatabaseHost ||
    databaseUrl.username !== expectedHostedDatabaseUser
  ) {
    throw new Error(
      'Hosted notifications E2E database does not match the explicitly approved target.'
    )
  }
}

if (!usesLoopbackRedis) {
  throw new Error('Notifications E2E Redis must be bound to loopback.')
}
const USER_ID = randomUUID()
const TENANT_ID = randomUUID()
const PROJECT_ID = randomUUID()
const BOM_ID = randomUUID()
const VENDOR_ID = randomUUID()
const COST_CODE_ID = randomUUID()
const PURCHASE_ORDER_BOM_ID = randomUUID()
const PURCHASE_ORDER_BOM_LINE_ID = randomUUID()
const WORKFLOW_PM_USER_ID = randomUUID()
const WORKFLOW_COMMERCIAL_USER_ID = randomUUID()
const WORKFLOW_PROCUREMENT_USER_ID = randomUUID()
const DOCUSEAL_SUBMISSION_ID = `submission-${randomUUID()}`
const FOREIGN_TENANT_ID = randomUUID()
const FOREIGN_USER_ID = randomUUID()
const FOREIGN_PROJECT_ID = randomUUID()
const FOREIGN_BOM_ID = randomUUID()
const FOREIGN_BOM_SUBMISSION_ID = `foreign-bom-${randomUUID()}`
const FOREIGN_NOTIFICATION_ID = randomUUID()
const ANON_KEY = 'third-code-local-anon-key'
const SERVICE_ROLE_KEY = 'third-code-local-service-role-key'
const WORKFLOW_FIXTURES_ENABLED =
  process.env.ERP_LOOPBACK_WORKFLOW_FIXTURES === 'true'
const PO_BOM_FIXTURES_ENABLED =
  process.env.ERP_LOOPBACK_PO_BOM_FIXTURES === 'true'
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
  'local-notification-signature',
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
  throw new Error('Build @third-code-erp/api before running loopback browser proof')
}

const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'local-notifications-admin@thirdcode.invalid',
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
  full_name: 'Local Notifications Admin',
}

const coreRequests = []
let sql
let webChild
let apiChild
let proxyServer
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
    values (${TENANT_ID}, 'Local notifications browser canary', ${`notifications-${TENANT_ID}`}, 'construction')
  `
  await sql`
    insert into users(id, tenant_id, email, full_name, role)
    values (${USER_ID}, ${TENANT_ID}, ${user.email}, ${profile.full_name}, 'admin')
  `
  if (WORKFLOW_FIXTURES_ENABLED) {
    await sql`
      insert into users(id, tenant_id, email, full_name, role)
      values
        (${WORKFLOW_PM_USER_ID}, ${TENANT_ID}, 'local-po-pm@thirdcode.invalid', 'Local PO PM', 'pm'),
        (${WORKFLOW_COMMERCIAL_USER_ID}, ${TENANT_ID}, 'local-po-commercial@thirdcode.invalid', 'Local PO Commercial', 'commercial'),
        (${WORKFLOW_PROCUREMENT_USER_ID}, ${TENANT_ID}, 'local-po-procurement@thirdcode.invalid', 'Local PO Procurement', 'procurement')
    `
  }
  await sql`
    insert into projects(id, tenant_id, name, client, status, created_by)
    values (
      ${PROJECT_ID}, ${TENANT_ID}, 'Local document intake project',
      'Local document intake client', 'lead', ${USER_ID}
    )
  `
  await sql`
    insert into vendors(id, tenant_id, name, email)
    values (
      ${VENDOR_ID}, ${TENANT_ID}, 'Local Core PO supplier',
      ${WORKFLOW_FIXTURES_ENABLED ? 'supplier@thirdcode.invalid' : null}
    )
  `
  await sql`
    insert into cost_codes(id, tenant_id, code, name, category, created_by)
    values (
      ${COST_CODE_ID}, ${TENANT_ID}, 'MAT-CORE-PO',
      'Core PO materials', 'material', ${USER_ID}
    )
  `
  await sql`
    insert into boms(
      id, tenant_id, project_id, created_by, label, status,
      total_cost_cents, tcv_cents, gp_cents, gp_margin_bps
    )
    values (
      ${BOM_ID}, ${TENANT_ID}, ${PROJECT_ID}, ${USER_ID},
      'Local Togal BOM', 'draft', 0, 0, 0, 0
    )
  `
  if (PO_BOM_FIXTURES_ENABLED) {
    await sql`
      insert into boms(
        id, tenant_id, project_id, created_by, approved_by, version, label,
        status, total_cost_cents, tcv_cents, gp_cents, gp_margin_bps,
        approved_at
      )
      values (
        ${PURCHASE_ORDER_BOM_ID}, ${TENANT_ID}, ${PROJECT_ID}, ${USER_ID},
        ${USER_ID}, 2, 'Local approved PO source BOM', 'approved',
        30000, 36000, 6000, 1667, now()
      )
    `
    await sql`
      insert into bom_line_items(
        id, tenant_id, bom_id, sort_order, code, description, unit,
        quantity, unit_cost_cents, markup_bps, line_total_cents, notes
      )
      values (
        ${PURCHASE_ORDER_BOM_LINE_ID}, ${TENANT_ID}, ${PURCHASE_ORDER_BOM_ID},
        0, 'MAT-PO-BOM', 'Approved BOM concrete package', 'lot',
        3, 10000, 0, 30000, 'Manual canary source'
      )
    `
  }
  await sql`
    insert into bom_portal_tokens(
      id, tenant_id, bom_id, token_hash, expires_at, docuseal_submission_id
    )
    values (
      ${randomUUID()}, ${TENANT_ID}, ${BOM_ID},
      ${`hash-${DOCUSEAL_SUBMISSION_ID}`}, now() + interval '1 day',
      ${DOCUSEAL_SUBMISSION_ID}
    )
  `
  await sql`
    insert into notifications(
      id, tenant_id, recipient_user_id, channel, subject, body, link_url,
      is_read, created_at
    )
    values
      (
        ${randomUUID()}, ${TENANT_ID}, ${USER_ID}, 'in_app',
        'Core notification authority', 'A tenant-scoped Core notification.',
        '/dashboard', false, now() - interval '1 minute'
      ),
      (
        ${randomUUID()}, ${TENANT_ID}, ${USER_ID}, 'in_app',
        'Unread follow-up', 'A second unread item for the read-state proof.',
        null, false, now() - interval '2 minutes'
      ),
      (
        ${randomUUID()}, ${TENANT_ID}, ${USER_ID}, 'in_app',
        'Already seen', 'This item starts in the read state.',
        null, true, now() - interval '3 minutes'
      )
  `

  await sql`
    insert into tenants(id, name, slug, organization_type)
    values (${FOREIGN_TENANT_ID}, 'Foreign notifications tenant', ${`notifications-foreign-${FOREIGN_TENANT_ID}`}, 'construction')
  `
  await sql`
    insert into users(id, tenant_id, email, full_name, role)
    values (${FOREIGN_USER_ID}, ${FOREIGN_TENANT_ID}, 'foreign-notifications@thirdcode.invalid', 'Foreign Notifications User', 'admin')
  `
  await sql`
    insert into projects(id, tenant_id, name, client, status, created_by)
    values (
      ${FOREIGN_PROJECT_ID}, ${FOREIGN_TENANT_ID}, 'Foreign BOM project',
      'Foreign BOM client', 'lead', ${FOREIGN_USER_ID}
    )
  `
  await sql`
    insert into boms(
      id, tenant_id, project_id, created_by, label, status,
      total_cost_cents, tcv_cents, gp_cents, gp_margin_bps
    )
    values (
      ${FOREIGN_BOM_ID}, ${FOREIGN_TENANT_ID}, ${FOREIGN_PROJECT_ID},
      ${FOREIGN_USER_ID}, 'Foreign BOM', 'draft', 0, 0, 0, 0
    )
  `
  await sql`
    insert into bom_portal_tokens(
      id, tenant_id, bom_id, token_hash, expires_at, docuseal_submission_id
    )
    values (
      ${randomUUID()}, ${TENANT_ID}, ${FOREIGN_BOM_ID},
      ${`hash-${FOREIGN_BOM_SUBMISSION_ID}`}, now() + interval '1 day',
      ${FOREIGN_BOM_SUBMISSION_ID}
    )
  `
  await sql`
    insert into notifications(
      id, tenant_id, recipient_user_id, channel, subject, body, is_read
    )
    values (
      ${FOREIGN_NOTIFICATION_ID}, ${FOREIGN_TENANT_ID}, ${FOREIGN_USER_ID},
      'in_app', 'Foreign unread item', 'Must remain outside the principal tenant.', false
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
    const [notifications, foreign, documents, intakeRequests, boms, bomLines, togalRequests, portalTokens, foreignBom, purchaseOrders, purchaseOrderLines, purchaseOrderCreateRequests, purchaseOrderWorkflowRequests, notificationOutbox, notificationDeliveries, supplierEmailDeliveries, vendorConfirmationSessions, auditEntries] =
      await Promise.all([
      sql`
        select id, subject, is_read, read_at::text
        from notifications
        where tenant_id = ${TENANT_ID}
        order by created_at desc
      `,
      sql`
        select is_read
        from notifications
        where id = ${FOREIGN_NOTIFICATION_ID}
      `,
      sql`
        select id, file_name, storage_path, document_type, size_bytes::int as size_bytes
        from documents
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, project_id, idempotency_key, request_hash, state, result
        from document_intake_requests
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, status, locked_at::text as locked_at,
          total_cost_cents::int as total_cost_cents,
          tcv_cents::int as tcv_cents, gp_cents::int as gp_cents,
          gp_margin_bps
        from boms
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, bom_id, description, quantity,
          unit_cost_cents::int as unit_cost_cents, markup_bps,
          line_total_cents::int as line_total_cents, notes
        from bom_line_items
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, bom_id, idempotency_key, request_hash, state, result
        from togal_bom_commit_requests
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select bom_id, docuseal_submission_id, used_at::text
        from bom_portal_tokens
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, tenant_id, status, locked_at::text
        from boms
        where id = ${FOREIGN_BOM_ID}
      `,
      sql`
        select id, po_number, status, project_id, vendor_id,
          pm_approved_at::text, commercial_approved_at::text,
          scm_issued_at::text,
          subtotal_cents::int as subtotal_cents,
          vat_cents::int as vat_cents,
          withholding_tax_cents::int as withholding_tax_cents,
          total_cents::int as total_cents
        from purchase_orders
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, po_id, description, quantity,
          unit_cost_cents::int as unit_cost_cents,
          line_total_cents::int as line_total_cents, cost_code_id,
          bom_line_item_id
        from po_line_items
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, idempotency_key, state, purchase_order_id, result
        from purchase_order_create_requests
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, purchase_order_id, action, idempotency_key, state, result
        from purchase_order_workflow_requests
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, event_key, event_type, aggregate_type, aggregate_id, payload
        from notification_outbox
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, outbox_id, recipient_user_id, recipient_email, channel, status
        from notification_deliveries
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, outbox_id, purchase_order_id, recipient_email, supplier_name,
          po_number, total_cents::int as total_cents, status
        from purchase_order_supplier_email_deliveries
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select id, purchase_order_id, vendor_id, source_workflow_request_id,
          state, expires_at::text
        from vendor_confirmation_sessions
        where tenant_id = ${TENANT_ID}
        order by created_at asc
      `,
      sql`
        select entity_type, entity_id, action, diff
        from audit_log
        where tenant_id = ${TENANT_ID}
        order by id asc
      `,
      ])
    return json(response, 200, {
      tenantId: TENANT_ID,
      userId: USER_ID,
      projectId: PROJECT_ID,
      vendorId: VENDOR_ID,
      costCodeId: COST_CODE_ID,
      purchaseOrderBomId: PO_BOM_FIXTURES_ENABLED
        ? PURCHASE_ORDER_BOM_ID
        : null,
      purchaseOrderBomLineId: PO_BOM_FIXTURES_ENABLED
        ? PURCHASE_ORDER_BOM_LINE_ID
        : null,
      workflowRecipientIds: {
        pm: WORKFLOW_FIXTURES_ENABLED ? WORKFLOW_PM_USER_ID : null,
        commercial: WORKFLOW_FIXTURES_ENABLED
          ? WORKFLOW_COMMERCIAL_USER_ID
          : null,
        procurement: WORKFLOW_FIXTURES_ENABLED
          ? WORKFLOW_PROCUREMENT_USER_ID
          : null,
      },
      foreignProjectId: FOREIGN_PROJECT_ID,
      foreignBomId: FOREIGN_BOM_ID,
      notifications,
      foreignNotificationIsRead: foreign[0]?.is_read ?? null,
      documents,
      intakeRequests,
      boms,
      bomLines,
      togalRequests,
      portalTokens,
      foreignBom: foreignBom[0] ?? null,
      purchaseOrders,
      purchaseOrderLines,
      purchaseOrderCreateRequests,
      purchaseOrderWorkflowRequests,
      notificationOutbox,
      notificationDeliveries,
      supplierEmailDeliveries,
      vendorConfirmationSessions,
      coreRequests,
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
        message: 'Invalid local notification credentials',
      })
    }
    return json(response, 200, user)
  }

  if (request.method === 'PUT' && url.pathname === '/auth/v1/user') {
    if (bearer(request) !== ACCESS_TOKEN) return json(response, 401, { error: 'Unauthorized' })
    const body = JSON.parse((await requestBody(request)).toString('utf8'))
    const preferences = body.data?.notification_preferences
    if (!preferences || !['all', 'unread'].includes(preferences.view) || typeof preferences.autoRefresh !== 'boolean') {
      return json(response, 400, { error: 'Invalid presentation preferences' })
    }
    user.user_metadata = { ...user.user_metadata, notification_preferences: preferences }
    return json(response, 200, user)
  }

  if (request.method === 'GET' && url.pathname === '/rest/v1/users') {
    const exactProfileQuery =
      url.searchParams.get('select') === 'tenant_id,role,email,full_name' &&
      url.searchParams.get('id') === `eq.${USER_ID}`
    if (
      request.headers.apikey !== ANON_KEY ||
      bearer(request) !== ACCESS_TOKEN ||
      !exactProfileQuery
    ) {
      return json(response, 400, {
        code: 'contract_mismatch',
        message: 'Unexpected local users profile query',
      })
    }
    return json(response, 200, profile)
  }

  return json(response, 404, {
    code: 'unsupported_contract',
    message: `${request.method ?? 'GET'} ${url.pathname} is not supported`,
  })
})

proxyServer = createServer(async (request, response) => {
  const body = await requestBody(request)
  const url = new URL(request.url ?? '/', PROXY_ORIGIN)
  if (
    url.pathname === '/v1/notifications' ||
    url.pathname === '/v1/documents' ||
    url.pathname === '/v1/procurement/boms/togal-commit' ||
    url.pathname === '/v1/procurement/purchase-orders' ||
    url.pathname === '/v1/procurement/purchase-orders/from-bom' ||
    (url.pathname.startsWith('/v1/procurement/purchase-orders/') &&
      url.pathname.endsWith('/workflow')) ||
    url.pathname === '/v1/webhooks/docuseal'
  ) {
    coreRequests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      authorization: request.headers.authorization ?? '',
      requestId: request.headers['x-request-id'] ?? '',
      idempotencyKey: request.headers['idempotency-key'] ?? '',
      internalTokenPresent: Boolean(request.headers['x-erp-core-webhook-token']),
      body: body.toString('utf8'),
    })
  }

  try {
    const upstream = await fetch(`${API_ORIGIN}${url.pathname}${url.search}`, {
      method: request.method,
      headers: {
        authorization: request.headers.authorization ?? '',
        'x-request-id': request.headers['x-request-id'] ?? '',
        'idempotency-key': request.headers['idempotency-key'] ?? '',
        'x-erp-core-webhook-token': request.headers['x-erp-core-webhook-token'] ?? '',
        'content-type': request.headers['content-type'] ?? 'application/json',
        accept: request.headers.accept ?? 'application/json',
      },
      body: body.length ? body : undefined,
    })
    const upstreamBody = Buffer.from(await upstream.arrayBuffer())
    response.writeHead(upstream.status, {
      'cache-control': 'no-store',
      'content-type':
        upstream.headers.get('content-type') ?? 'application/json',
    })
    response.end(upstreamBody)
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

async function cleanup() {
  if (!sql) return
  // Audit rows are intentionally immutable. Deleting a tenant cascades into
  // audit_log and is correctly rejected, so this harness never bypasses the
  // control. Run it against a resettable local database or a disposable branch
  // database, then reclaim that whole environment after the test lane.
  await sql.end({ timeout: 5 }).catch(() => undefined)
}

async function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  if (webChild && !webChild.killed) webChild.kill('SIGTERM')
  if (apiChild && !apiChild.killed) apiChild.kill('SIGTERM')
  await new Promise((resolveClose) => authServer.close(() => resolveClose()))
  await new Promise((resolveClose) => proxyServer?.close(() => resolveClose()))
  await cleanup()
  process.exitCode = exitCode
}

await seedDatabase()
await listen(authServer, AUTH_PORT)
await listen(proxyServer, PROXY_PORT)

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const apiEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL,
  REDIS_URL,
  SUPABASE_URL: AUTH_ORIGIN,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  ERP_API_CORS_ORIGINS: WEB_ORIGIN,
  ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED: 'true',
  ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS: TENANT_ID,
  ERP_PO_CREATE_WRITES_ENABLED: 'true',
  ERP_PO_CREATE_WRITES_TENANT_IDS: TENANT_ID,
  ERP_PO_BOM_CREATE_WRITES_ENABLED: 'true',
  ERP_PO_BOM_CREATE_WRITES_TENANT_IDS: TENANT_ID,
  ERP_PO_WORKFLOW_WRITES_ENABLED: 'true',
  ERP_PO_WORKFLOW_WRITES_TENANT_IDS: TENANT_ID,
  ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED: 'true',
  ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS: TENANT_ID,
  ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED: 'true',
  ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS: TENANT_ID,
  ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET: 'local-vendor-confirmation-secret-2026-with-32-plus-bytes',
  ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS: '24',
  ERP_CORE_WEBHOOK_TOKEN: 'local-docuseal-core-webhook-token-2026',
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
  console.error('[notifications-loopback] API process failed', error)
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
      SUPABASE_URL: AUTH_ORIGIN,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: WEB_ORIGIN,
      NEXT_PUBLIC_APP_URL: WEB_ORIGIN,
      ERP_CORE_API_URL: PROXY_ORIGIN,
      ERP_BOM_TOGAL_COMMIT_VIA_API: 'true',
      ERP_BOM_TOGAL_COMMIT_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_PO_CREATE_WRITES_VIA_API: 'true',
      ERP_PO_CREATE_WRITES_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_PO_BOM_CREATE_WRITES_VIA_API: 'true',
      ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_PO_WORKFLOW_WRITES_VIA_API: 'true',
      ERP_PO_WORKFLOW_WRITES_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_CORE_WEBHOOK_TOKEN: 'local-docuseal-core-webhook-token-2026',
      DOCUSEAL_WEBHOOK_SECRET: 'local-docuseal-provider-secret',
      RESEND_API_KEY: '',
      EMAIL_FROM: '',
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
  console.error('[notifications-loopback] Next process failed', error)
  void stop(1)
})
process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))
