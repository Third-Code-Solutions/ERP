import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptDir, '..', '..')
const outputPath = resolve(root, 'docs', 'audit', 'SYSTEM_INVENTORY.md')

const tracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
  cwd: root,
  encoding: 'utf8',
  }
)
  .split('\0')
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right))

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function code(value) {
  return `\`${String(value).replaceAll('`', '\\`')}\``
}

function routeForPage(path) {
  const segments = path
    .replace(/^apps\/web\/src\/app\//, '')
    .replace(/(?:^|\/)page\.tsx$/, '')
    .split('/')
    .filter((segment) => segment && !/^\(.+\)$/.test(segment))
  return `/${segments.join('/')}`.replace(/\/$/, '') || '/'
}

function integrationClass(source) {
  const directDb =
    /@third-code-erp\/database|from ['"]@\/lib\/(?:db|project-queries)/.test(
      source
    )
  const core = /erp-core-client|ERP_CORE_API_URL/.test(source)
  const external =
    /fetch\(|@supabase\/supabase-js|openai|anthropic|docuseal|inngest|resend|semaphore/i.test(
      source
    )
  if (directDb && core) return 'HYBRID CORE + DIRECT DB'
  if (core) return 'CORE API'
  if (directDb) return 'DIRECT DB COMPATIBILITY'
  if (external) return 'EXTERNAL / PLATFORM INTEGRATION'
  return 'UI / LOCAL COMPOSITION'
}

function exportedAsyncFunctions(source) {
  const names = new Set()
  for (const match of source.matchAll(
    /export\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/g
  )) {
    names.add(match[1])
  }
  return [...names].sort()
}

function routeHandlers(source) {
  const methods = new Set()
  for (const match of source.matchAll(
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g
  )) {
    methods.add(match[1])
  }
  return [...methods].sort()
}

function apiRoute(path) {
  const route = path
    .replace(/^apps\/web\/src\/app\/api\//, '')
    .replace(/\/route\.ts$/, '')
  return `/api/${route}`
}

function controllerBase(source) {
  const match = source.match(/@Controller\(\s*['"]([^'"]*)['"]\s*\)/)
  return match?.[1] ?? '(dynamic controller path)'
}

function controllerEndpoints(source) {
  const endpoints = []
  const matcher = /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"]([^'"]*)['"])?\s*\)/g
  for (const match of source.matchAll(matcher)) {
    const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 500)
    const method = tail.match(/(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/)?.[1] ?? '(unresolved method)'
    endpoints.push({ verb: match[1].toUpperCase(), path: match[2] ?? '', method })
  }
  return endpoints
}

function joinRoute(base, child) {
  return `/${[base, child]
    .join('/')
    .replaceAll(/\/+/g, '/')
    .replace(/^\//, '')}`.replace(/\/$/, '') || '/'
}

const pages = tracked
  .filter((path) => /^apps\/web\/src\/app\/(?:.+\/)?page\.tsx$/.test(path))
  .map((path) => {
    const source = read(path)
    const directory = path.replace(/(?:^|\/)page\.tsx$/, '')
    return {
      path,
      route: routeForPage(path),
      boundary: integrationClass(source),
      loading: tracked.includes(`${directory}/loading.tsx`),
      error: tracked.includes(`${directory}/error.tsx`),
      status: 'BUILT / PARTIALLY VERIFIED',
    }
  })

const actionModules = tracked
  .filter(
    (path) =>
      path.startsWith('apps/web/src/app/') &&
      /(?:^|\/)(?:actions|[^/]+-actions)\.ts$/.test(path) &&
      !path.endsWith('.test.ts')
  )
  .map((path) => {
    const source = read(path)
    return {
      path,
      functions: exportedAsyncFunctions(source),
      boundary: integrationClass(source),
      auth:
        /requireUserProfile|getUserProfile|requireUser\(/.test(source)
          ? /\bcan\(|requireCapability|hasRole\(/.test(source)
            ? 'AUTH + CAPABILITY/RBAC MARKER'
            : 'AUTH MARKER; PER-ACTION POLICY REVIEW REQUIRED'
          : 'NO CANONICAL AUTH MARKER FOUND',
      status: 'TYPECHECKED / PARTIALLY VERIFIED',
    }
  })

const nextHandlers = tracked
  .filter(
    (path) =>
      path.startsWith('apps/web/src/app/api/') &&
      path.endsWith('/route.ts')
  )
  .map((path) => {
    const source = read(path)
    return {
      path,
      route: apiRoute(path),
      methods: routeHandlers(source),
      boundary: integrationClass(source),
      auth:
        /getUserProfile|requireUserProfile|supabase\.auth|getUser\(/.test(source)
          ? /\bcan\(|requireCapability|hasRole\(/.test(source)
            ? 'AUTH + CAPABILITY/RBAC MARKER'
            : 'AUTH MARKER; HANDLER POLICY REVIEW REQUIRED'
          : /webhook|cron|inngest|health/i.test(path)
            ? 'NON-SESSION INGRESS; DEDICATED AUTH REVIEW REQUIRED'
            : 'NO CANONICAL AUTH MARKER FOUND',
      status: 'BUILT / PARTIALLY VERIFIED',
    }
  })

const nestEndpoints = []
for (const path of tracked.filter(
  (candidate) =>
    candidate.startsWith('apps/api/src/') && candidate.endsWith('.controller.ts')
)) {
  const source = read(path)
  const base = controllerBase(source)
  const auth = /@Public\(/.test(source)
    ? /@RequireCapabilities\(/.test(source)
      ? 'MIXED PUBLIC + CAPABILITY MARKERS'
      : 'PUBLIC MARKER'
    : /@RequireCapabilities\(/.test(source)
      ? 'GLOBAL JWT + CAPABILITY MARKER'
      : 'GLOBAL JWT; NO CAPABILITY MARKER FOUND'
  for (const endpoint of controllerEndpoints(source)) {
    nestEndpoints.push({
      path,
      route: joinRoute(base, endpoint.path),
      verb: endpoint.verb,
      method: endpoint.method,
      auth,
      status: 'REGISTERED SOURCE / PARTIALLY VERIFIED',
    })
  }
}

const schemaModules = tracked.filter(
  (path) =>
    path.startsWith('packages/database/src/schema/') &&
    path.endsWith('.ts') &&
    !path.endsWith('/index.ts') &&
    !path.endsWith('/enums.ts')
)
const migrations = tracked.filter(
  (path) => path.startsWith('supabase/migrations/') && path.endsWith('.sql')
)
const inngestModules = tracked.filter((path) =>
  /^apps\/web\/src\/inngest\/.+\.ts$/.test(path)
)
const queueModules = tracked.filter(
  (path) =>
    /(?:queue|processor|worker)\.ts$/.test(path) &&
    /apps\/api\/src|apps\/workers/.test(path) &&
    !path.endsWith('.spec.ts') &&
    !path.endsWith('.test.ts')
)
const integrationModules = tracked.filter(
  (path) =>
    !path.endsWith('.test.ts') &&
    !path.endsWith('.spec.ts') &&
    (/apps\/web\/src\/lib\/operations\/integrations\/.+\.ts$/.test(path) ||
      /apps\/api\/src\/.+(?:client|provider|storage|email|integration)\.ts$/.test(
        path
      ))
)

const lines = [
  '# System and Connectivity Inventory',
  '',
  `- Generated from tracked source at baseline/change worktree: ${new Date().toISOString()}.`,
  `- Inventory scope: ${pages.length} Web pages, ${actionModules.length} Server Action modules, ${nextHandlers.length} Next API handlers, ${nestEndpoints.length} Nest endpoint decorators, ${schemaModules.length} schema modules, ${migrations.length} ordered SQL migrations.`,
  '- Evidence boundary: `BUILT`/`TYPECHECKED` proves static registration only. Runtime, browser, provider and database behavior remains `PARTIALLY VERIFIED` unless cited in the main audit evidence.',
  '- Canonical role/capability matrix: `packages/shared-types/src/authorization.ts`; Web consumes it through `packages/auth/src/server.ts`, Core through `apps/api/src/auth/capability.guard.ts`.',
  '',
  '## Web page and route inventory',
  '',
  '| Route | Source | Boundary | Loading | Error | Status |',
  '| --- | --- | --- | --- | --- | --- |',
  ...pages.map(
    (item) =>
      `| ${code(item.route)} | ${code(item.path)} | ${item.boundary} | ${item.loading ? 'YES' : 'NO'} | ${item.error ? 'YES' : 'NO'} | ${item.status} |`
  ),
  '',
  '## Server Action export inventory',
  '',
  '| Source | Exported actions | Boundary | Authorization marker | Status |',
  '| --- | --- | --- | --- | --- |',
  ...actionModules.map(
    (item) =>
      `| ${code(item.path)} | ${item.functions.length ? item.functions.map(code).join('<br>') : 'NO EXPORTED ASYNC FUNCTION FOUND'} | ${item.boundary} | ${item.auth} | ${item.status} |`
  ),
  '',
  '## Next route-handler inventory',
  '',
  '| Route | Methods | Source | Boundary | Authorization marker | Status |',
  '| --- | --- | --- | --- | --- | --- |',
  ...nextHandlers.map(
    (item) =>
      `| ${code(item.route)} | ${item.methods.length ? item.methods.join(', ') : 'NO STATIC METHOD EXPORT FOUND'} | ${code(item.path)} | ${item.boundary} | ${item.auth} | ${item.status} |`
  ),
  '',
  '## Nest Core endpoint inventory',
  '',
  '| Verb | Route | Method | Controller source | Authorization marker | Status |',
  '| --- | --- | --- | --- | --- | --- |',
  ...nestEndpoints
    .sort((left, right) =>
      `${left.route}:${left.verb}`.localeCompare(`${right.route}:${right.verb}`)
    )
    .map(
      (item) =>
        `| ${item.verb} | ${code(item.route)} | ${code(item.method)} | ${code(item.path)} | ${item.auth} | ${item.status} |`
    ),
  '',
  '## Data and migration inventory',
  '',
  '### Drizzle schema modules',
  '',
  ...schemaModules.map((path) => `- ${code(path)} — TYPECHECKED / PARTIALLY VERIFIED`),
  '',
  '### Ordered Supabase migrations',
  '',
  ...migrations.map(
    (path) => `- ${code(path)} — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED`
  ),
  '',
  '## Background execution and external boundaries',
  '',
  '### Inngest modules',
  '',
  ...(inngestModules.length
    ? inngestModules.map((path) => `- ${code(path)} — SOURCE REGISTERED / RUNTIME PARTIAL`)
    : ['- None found.']),
  '',
  '### Queue, processor and worker modules',
  '',
  ...(queueModules.length
    ? queueModules.map((path) => `- ${code(path)} — SOURCE REGISTERED / RUNTIME PARTIAL`)
    : ['- None found.']),
  '',
  '### External integration/provider modules',
  '',
  ...(integrationModules.length
    ? integrationModules.map(
        (path) => `- ${code(path)} — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL`
      )
    : ['- None found.']),
  '',
  '## Role and permission contract',
  '',
  '| Layer | Authority | Evidence/status |',
  '| --- | --- | --- |',
  '| Canonical policy | `packages/shared-types/src/authorization.ts` | 13 roles and capability grants; unit-tested |',
  '| Web server | `packages/auth/src/server.ts` | Supabase identity + `public.users` tenant/role; shared `can()` policy |',
  '| Core API | `apps/api/src/auth/supabase-jwt.guard.ts`, `capability.guard.ts` | Global JWT plus route capability metadata; source/test verified |',
  '| Database | `supabase/migrations/*` RLS policies | Static policy inventory; current provider advisors/disposable replay blocked |',
  '',
  '## Interpretation and limitations',
  '',
  '- Loading/Error columns mean a boundary exists in the page directory itself. Next.js inherits parent boundaries: the root error boundary and dashboard-group loading/error boundaries cover many rows marked `NO`; absence here is not automatically a missing rendered state.',
  '- This inventory classifies every statically discoverable page, Server Action export, Next handler, and Nest endpoint. Dynamic callback behavior inside generic components is covered per file by `REPOSITORY_COVERAGE.md`, not falsely claimed as browser-verified.',
  '- `NO CANONICAL AUTH MARKER FOUND` is a review signal, not automatically a vulnerability: a route may be intentionally public or delegate authentication. Findings require manual evidence in `FULL_REPOSITORY_AUDIT.md`.',
  '- A route can compile while its provider, migration, queue, browser state, or production registration is unavailable. Those distinctions are retained in `TEST_AND_VERIFICATION_EVIDENCE.md` and `PRODUCTION_DEPLOYMENT_REPORT.md`.',
]

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
console.log(
  `Wrote ${relative(root, outputPath)}: ${pages.length} pages, ${actionModules.length} action modules, ${nextHandlers.length} Next handlers, ${nestEndpoints.length} Nest endpoints.`
)
