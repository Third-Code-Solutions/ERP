import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '127.0.0.1'
const WEB_PORT = 4327
const AUTH_PORT = 4328
const WORKER_PROXY_PORT = 4329
const API_PORT = 4330
const PYTHON_PORT = 4331
const WEB_ORIGIN = `http://${HOST}:${WEB_PORT}`
const AUTH_ORIGIN = `http://${HOST}:${AUTH_PORT}`
const WORKER_PROXY_ORIGIN = `http://${HOST}:${WORKER_PROXY_PORT}`
const API_ORIGIN = `http://${HOST}:${API_PORT}`
const PYTHON_ORIGIN = `http://${HOST}:${PYTHON_PORT}`
const DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
const REDIS_URL = 'redis://127.0.0.1:6379'
const TENANT_ID = '2b2b039c-b066-412b-af4c-564f2af6097e'
const PROJECT_ID = 'a6778017-a3d3-4ba5-8989-3127d75b458b'
const ANON_KEY = 'third-code-local-anon-key'
const SERVICE_ROLE_KEY = 'third-code-local-service-role-key'
const WORKER_SECRET = 'third-code-local-worker-secret'
const ASSISTANT_SECRET = 'third-code-local-assistant-signing-secret'

const identities = {
  success: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'cortex-success@thirdcode.invalid',
    fullName: 'Cortex Success Admin',
    role: 'admin',
  },
  foreign: {
    id: '10000000-0000-4000-8000-000000000002',
    email: 'cortex-foreign@thirdcode.invalid',
    fullName: 'Cortex Foreign Viewer',
    role: 'viewer',
  },
  focused: {
    id: '10000000-0000-4000-8000-000000000003',
    email: 'cortex-focused@thirdcode.invalid',
    fullName: 'Cortex Focused Admin',
    role: 'admin',
  },
  abort: {
    id: '10000000-0000-4000-8000-000000000004',
    email: 'cortex-abort@thirdcode.invalid',
    fullName: 'Cortex Abort Admin',
    role: 'admin',
  },
  unmount: {
    id: '10000000-0000-4000-8000-000000000005',
    email: 'cortex-unmount@thirdcode.invalid',
    fullName: 'Cortex Unmount Admin',
    role: 'admin',
  },
  timeout: {
    id: '10000000-0000-4000-8000-000000000006',
    email: 'cortex-timeout@thirdcode.invalid',
    fullName: 'Cortex Timeout Admin',
    role: 'admin',
  },
}

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const webRoot = resolve(repositoryRoot, 'apps', 'web')
const apiEntry = resolve(repositoryRoot, 'apps', 'api', 'dist', 'main.js')
const pythonRoot = resolve(repositoryRoot, 'apps', 'workers', 'ai')
const pythonEntry = resolve(pythonRoot, '.venv', 'Scripts', 'python.exe')
if (!existsSync(apiEntry)) {
  throw new Error('Build @third-code-erp/api before running Cortex browser proof')
}
if (!existsSync(pythonEntry)) {
  throw new Error('Local AI worker virtual environment is unavailable')
}

const databaseRequire = createRequire(
  resolve(repositoryRoot, 'packages', 'database', 'package.json')
)
const postgres = databaseRequire('postgres')
const sql = postgres(DATABASE_URL, {
  max: 1,
  idle_timeout: 5,
  onnotice: () => {},
})
const nextRequire = createRequire(resolve(webRoot, 'package.json'))
const nextBin = nextRequire.resolve('next/dist/bin/next')

const tokens = new Map()
const identitiesById = new Map()
for (const [key, identity] of Object.entries(identities)) {
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url'
    ),
    Buffer.from(
      JSON.stringify({
        aud: 'authenticated',
        exp: 4_102_444_800,
        role: 'authenticated',
        sub: identity.id,
      })
    ).toString('base64url'),
    `local-contract-${key}`,
  ].join('.')
  tokens.set(token, { key, identity })
  identitiesById.set(identity.id, identity)
}

const authRequests = []
const workerRequests = []
const unexpectedWorkerRequests = []
const revokedNodeIds = new Set()
const children = []
const childProviderCredentialPresence = []

function user(identity) {
  return {
    id: identity.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: identity.email,
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
}

function json(response, status, body) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
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

async function requestJson(request) {
  const body = await requestBody(request)
  return body.length > 0 ? JSON.parse(body.toString('utf8')) : {}
}

async function provisionUsers() {
  await sql`select 1`
  for (const identity of Object.values(identities)) {
    await sql`
      insert into public.users (
        id,
        tenant_id,
        email,
        full_name,
        role,
        created_at,
        updated_at
      )
      values (
        ${identity.id},
        ${TENANT_ID},
        ${identity.email},
        ${identity.fullName},
        ${identity.role},
        now(),
        now()
      )
      on conflict (id) do update
      set
        tenant_id = excluded.tenant_id,
        email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role,
        updated_at = excluded.updated_at
    `
  }
}

async function restoreHarnessState() {
  for (const identity of Object.values(identities)) {
    await sql`
      update public.users
      set role = ${identity.role}, updated_at = now()
      where id = ${identity.id} and tenant_id = ${TENANT_ID}
    `
  }
  if (revokedNodeIds.size > 0) {
    await sql`
      update public.cortex_nodes
      set valid_to = null
      where tenant_id = ${TENANT_ID}
        and id in ${sql([...revokedNodeIds])}
    `
    revokedNodeIds.clear()
  }
}

async function setIdentityRole(identityKey, role) {
  const identity = identities[identityKey]
  if (!identity || !['admin', 'viewer'].includes(role)) return false
  const rows = await sql`
    update public.users
    set role = ${role}, updated_at = now()
    where id = ${identity.id} and tenant_id = ${TENANT_ID}
    returning id
  `
  return rows.length === 1
}

async function revokeCitation(jobId) {
  const rows = await sql`
    select (message.citations -> 0 ->> 'nodeId')::uuid as node_id
    from public.cortex_assistant_generation_jobs as job
    join public.cortex_assistant_turn_requests as request
      on request.tenant_id = job.tenant_id
     and request.id = job.request_id
    join public.cortex_messages as message
      on message.tenant_id = request.tenant_id
     and message.id = request.assistant_message_id
    where job.id = ${jobId}
      and job.tenant_id = ${TENANT_ID}
      and job.status = 'succeeded'
      and jsonb_array_length(message.citations) > 0
    limit 1
  `
  const nodeId = rows[0]?.node_id
  if (!nodeId) return null
  await sql`
    update public.cortex_nodes
    set valid_to = now()
    where id = ${nodeId} and tenant_id = ${TENANT_ID} and valid_to is null
  `
  revokedNodeIds.add(nodeId)
  return nodeId
}

async function revokeContext(jobId) {
  const rows = await sql`
    select node.id as node_id
    from public.cortex_assistant_generation_jobs as job
    join public.cortex_assistant_turn_requests as request
      on request.tenant_id = job.tenant_id
     and request.id = job.request_id
    join public.cortex_conversations as conversation
      on conversation.tenant_id = request.tenant_id
     and conversation.id = request.conversation_id
    join public.cortex_nodes as node
      on node.tenant_id = conversation.tenant_id
     and node.ref_table = conversation.context_ref_table
     and node.ref_id = conversation.context_ref_id
     and node.valid_to is null
    where job.id = ${jobId}
      and job.tenant_id = ${TENANT_ID}
    order by node.recorded_at desc
    limit 1
  `
  const nodeId = rows[0]?.node_id
  if (!nodeId) return null
  await sql`
    update public.cortex_nodes
    set valid_to = now()
    where id = ${nodeId} and tenant_id = ${TENANT_ID} and valid_to is null
  `
  revokedNodeIds.add(nodeId)
  return nodeId
}

async function ready() {
  try {
    await sql`select 1`
    const signal = AbortSignal.timeout(2_000)
    const [python, api, web] = await Promise.all([
      fetch(`${PYTHON_ORIGIN}/health`, { signal }),
      fetch(`${API_ORIGIN}/ready`, { signal }),
      fetch(`${WEB_ORIGIN}/auth/login`, {
        redirect: 'manual',
        signal,
      }),
    ])
    return python.ok && api.ok && web.status >= 200 && web.status < 400
  } catch {
    return false
  }
}

async function handleAuth(request, response) {
  const url = new URL(request.url ?? '/', AUTH_ORIGIN)
  if (request.method === 'GET' && url.pathname === '/__harness__/ready') {
    const runtimeReady = await ready()
    return json(response, runtimeReady ? 200 : 503, { ready: runtimeReady })
  }
  if (request.method === 'GET' && url.pathname === '/__harness__/session') {
    const identityKey = url.searchParams.get('identity') ?? 'success'
    const entry = [...tokens.entries()].find(
      ([, value]) => value.key === identityKey
    )
    if (!entry) return json(response, 404, { error: 'Unknown identity' })
    const [accessToken, { identity }] = entry
    return json(response, 200, {
      accessToken,
      expiresAt: 4_102_444_800,
      user: user(identity),
    })
  }
  if (request.method === 'GET' && url.pathname === '/__harness__/evidence') {
    return json(response, 200, {
      authRequests,
      workerRequests,
      unexpectedWorkerRequests,
      cloudCredentialsPresent: childProviderCredentialPresence.some(
        (keys) => keys.length > 0
      ),
    })
  }
  if (request.method === 'POST' && url.pathname === '/__harness__/reset') {
    await restoreHarnessState()
    return json(response, 200, { reset: true })
  }
  if (request.method === 'POST' && url.pathname === '/__harness__/role') {
    const body = await requestJson(request)
    const updated = await setIdentityRole(body.identity, body.role)
    return json(response, updated ? 200 : 400, { updated })
  }
  if (
    request.method === 'POST' &&
    url.pathname === '/__harness__/revoke-citation'
  ) {
    const body = await requestJson(request)
    const nodeId = await revokeCitation(body.jobId)
    return json(response, nodeId ? 200 : 409, { nodeId })
  }
  if (
    request.method === 'POST' &&
    url.pathname === '/__harness__/revoke-context'
  ) {
    const body = await requestJson(request)
    const nodeId = await revokeContext(body.jobId)
    return json(response, nodeId ? 200 : 409, { nodeId })
  }

  authRequests.push({
    method: request.method ?? 'GET',
    path: url.pathname,
    query: url.search,
  })

  if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
    if (request.headers.apikey !== ANON_KEY) {
      return json(response, 401, {
        code: 'bad_jwt',
        message: 'Invalid local contract credentials',
      })
    }
    const session = tokens.get(bearer(request))
    return session
      ? json(response, 200, user(session.identity))
      : json(response, 401, {
          code: 'bad_jwt',
          message: 'Invalid local contract credentials',
        })
  }

  if (request.method === 'GET' && url.pathname === '/rest/v1/users') {
    const userId = url.searchParams.get('id')?.replace(/^eq\./, '') ?? ''
    const identity = identitiesById.get(userId)
    const exactProfileQuery =
      url.searchParams.get('select') === 'tenant_id,role,email,full_name' &&
      Boolean(identity)
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
    const rows = await sql`
      select tenant_id, role, email, full_name
      from public.users
      where id = ${userId} and tenant_id = ${TENANT_ID}
      limit 1
    `
    return rows[0]
      ? json(response, 200, rows[0])
      : json(response, 404, { code: 'profile_missing' })
  }

  return json(response, 404, {
    code: 'unsupported_contract',
    message: `${request.method ?? 'GET'} ${url.pathname} is not supported`,
  })
}

function workerDelay(question) {
  if (question.includes('proof-timeout')) return 15_000
  if (question.includes('proof-abort')) return 20_000
  if (question.includes('proof-unmount')) return 20_000
  if (question.includes('proof-pending')) return 8_000
  if (question.includes('proof-focused')) return 8_000
  return 0
}

async function handleWorkerProxy(request, response) {
  const url = new URL(request.url ?? '/', WORKER_PROXY_ORIGIN)
  if (request.method === 'GET' && url.pathname === '/health') {
    const upstream = await fetch(`${PYTHON_ORIGIN}/health`)
    response.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    })
    return response.end(Buffer.from(await upstream.arrayBuffer()))
  }
  if (
    request.method !== 'POST' ||
    url.pathname !== '/v1/cortex/grounded-answer'
  ) {
    unexpectedWorkerRequests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
    })
    return json(response, 503, { error: 'Unsupported worker request' })
  }

  const body = await requestBody(request)
  const parsed = JSON.parse(body.toString('utf8'))
  const question = typeof parsed.question === 'string' ? parsed.question : ''
  const delayMs = workerDelay(question)
  workerRequests.push({ path: url.pathname, delayMs })
  if (delayMs > 0) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs))
  }
  const upstream = await fetch(`${PYTHON_ORIGIN}${url.pathname}`, {
    method: 'POST',
    headers: {
      authorization: request.headers.authorization ?? '',
      'content-type': 'application/json',
    },
    body,
  })
  response.writeHead(upstream.status, {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  })
  response.end(Buffer.from(await upstream.arrayBuffer()))
}

function childEnvironment(overrides) {
  const environment = { ...process.env }
  for (const key of [
    'OPENAI_API_KEY',
    'AI_GATEWAY_API_KEY',
    'AI_PROVIDER_API_KEY',
    'INNGEST_EVENT_KEY',
    'DATABASE_URL',
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'AI_WORKER_URL',
    'AI_WORKER_SHARED_SECRET',
    'VERCEL',
    'VERCEL_ENV',
    'VERCEL_GIT_COMMIT_SHA',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'RAILWAY_GIT_COMMIT_SHA',
  ]) {
    delete environment[key]
  }
  const finalEnvironment = { ...environment, ...overrides }
  childProviderCredentialPresence.push(
    [
      'OPENAI_API_KEY',
      'AI_GATEWAY_API_KEY',
      'AI_PROVIDER_API_KEY',
      'INNGEST_EVENT_KEY',
    ].filter((key) => Boolean(finalEnvironment[key]))
  )
  return finalEnvironment
}

function startChild(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: 'inherit',
  })
  children.push(child)
  child.on('error', (error) => {
    console.error(error)
    void stop(1)
  })
  child.on('exit', (code) => {
    if (!stopping) void stop(code ?? 1)
  })
  return child
}

let stopping = false
async function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  await Promise.allSettled([
    restoreHarnessState(),
    sql.end({ timeout: 2 }),
    new Promise((resolveClose) => authServer.close(resolveClose)),
    new Promise((resolveClose) => workerProxy.close(resolveClose)),
  ])
  process.exit(exitCode)
}

await provisionUsers()

const authServer = createServer((request, response) => {
  void handleAuth(request, response).catch((error) => {
    console.error(error)
    if (!response.headersSent) json(response, 500, { error: 'Harness failure' })
    else response.end()
  })
})
const workerProxy = createServer((request, response) => {
  void handleWorkerProxy(request, response).catch((error) => {
    console.error(error)
    if (!response.headersSent) json(response, 500, { error: 'Worker proxy failure' })
    else response.end()
  })
})
await Promise.all([
  new Promise((resolveListen) => authServer.listen(AUTH_PORT, HOST, resolveListen)),
  new Promise((resolveListen) =>
    workerProxy.listen(WORKER_PROXY_PORT, HOST, resolveListen)
  ),
])

startChild(
  pythonEntry,
  ['-m', 'uvicorn', 'src.main:app', '--host', HOST, '--port', String(PYTHON_PORT)],
  {
    cwd: pythonRoot,
    env: childEnvironment({
      AI_WORKER_SHARED_SECRET: WORKER_SECRET,
      AI_PROVIDER_API_KEY: '',
    }),
  }
)
startChild(process.execPath, [apiEntry], {
  cwd: repositoryRoot,
  env: childEnvironment({
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    DATABASE_URL,
    REDIS_URL,
    SUPABASE_URL: AUTH_ORIGIN,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    ERP_API_CORS_ORIGINS: WEB_ORIGIN,
    AI_WORKER_URL: WORKER_PROXY_ORIGIN,
    AI_WORKER_SHARED_SECRET: WORKER_SECRET,
    ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED: 'true',
    ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS: TENANT_ID,
    ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED: 'true',
    ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS: TENANT_ID,
    ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: ASSISTANT_SECRET,
    ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: 'true',
    ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS: TENANT_ID,
    ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED: 'true',
    ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS: TENANT_ID,
    ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED: 'false',
    ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS: '',
  }),
})
startChild(
  process.execPath,
  [nextBin, 'dev', '--hostname', HOST, '--port', String(WEB_PORT)],
  {
    cwd: webRoot,
    env: childEnvironment({
      NODE_ENV: 'development',
      DATABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: AUTH_ORIGIN,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SITE_URL: WEB_ORIGIN,
      NEXT_PUBLIC_APP_URL: WEB_ORIGIN,
      ERP_CORE_API_URL: API_ORIGIN,
      ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API: 'true',
      ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API: 'true',
      ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API_TENANT_IDS:
        TENANT_ID,
      ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: ASSISTANT_SECRET,
      ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API: 'true',
      ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API_TENANT_IDS: TENANT_ID,
      ERP_CORTEX_SEARCH_VIA_API: 'false',
      ERP_CORTEX_SEARCH_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_GRAPH_READS_VIA_API: 'false',
      ERP_CORTEX_GRAPH_READS_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_ENTITY_READS_VIA_API: 'false',
      ERP_CORTEX_ENTITY_READS_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_CONVERSATION_READS_VIA_API: 'false',
      ERP_CORTEX_CONVERSATION_READS_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API: 'false',
      ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS: '',
      ERP_CORTEX_LEGACY_EMBED_ENABLED: 'false',
      ERP_CORTEX_LEGACY_EMBED_TENANT_IDS: '',
      AI_WORKER_URL: '',
      AI_WORKER_SHARED_SECRET: '',
    }),
  }
)

process.on('SIGINT', () => void stop(0))
process.on('SIGTERM', () => void stop(0))

console.log(
  `Cortex generation loopback ready target: ${WEB_ORIGIN}; tenant: ${TENANT_ID}; project: ${PROJECT_ID}`
)
