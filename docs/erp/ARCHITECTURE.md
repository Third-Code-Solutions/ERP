# ERP architecture (agent working map)

Baseline audit, `init` mode, 2026-11-04. Branch `chore/erp-baseline` at `ebd5135a`
(product code = `main` @ `90c48866` plus swarm docs only).

This file is what agents must know to work in the repo without guessing. Facts
cite a file path or a command that was run. "Inferred" marks anything not
verified directly. Measured gate results and defects are in
[`reports/00-baseline.md`](reports/00-baseline.md).

Authority order: `docs/PRD.md` (BUILD OPS PRD v1.5, product "ABI OPS" for
Actuate Builders Inc.) > current source + `supabase/migrations` > this file.
Root `CLAUDE.md` is a historical PRD. Parts of it are stale (it says shadcn/ui,
tRPC and Railway-only Python; none match today's code).

`docs/ARCHITECTURE.md` is partly stale too:
- It says server components read "RLS-scoped". They read through Drizzle, which
  bypasses RLS (see [Tenancy](#tenancy-model)).
- It omits the NestJS Core API.

---

## 1. Stack and versions

| Concern | Choice (resolved version) | Evidence |
|---|---|---|
| Runtime | Node 22.x pinned (`engines`). The audit machine runs Node 24.16, so pnpm needs `--config.engine-strict=false` | `package.json`, `.npmrc` (`engine-strict=true`) |
| Package manager | pnpm 10.33.0 workspaces + Turborepo 2.10 | `package.json` `packageManager`, `pnpm-workspace.yaml`, `turbo.json` |
| Language | TypeScript 5.9.3 (strict via `packages/config/tsconfig.base.json`) | `node_modules/typescript` |
| Web app | Next.js 15.5.27 App Router, React 19, Turbopack dev | `apps/web/package.json` |
| Core API | NestJS 11.2 on Express 5, helmet, global `ValidationPipe` | `apps/api/package.json`, `apps/api/src/main.ts` |
| Queues | BullMQ 5 + ioredis (API). Inngest 4 (web crons/events) | `apps/api/src/app.module.ts`, `apps/web/src/lib/inngest-*.ts` |
| Workers | Python ≥3.11 FastAPI: `apps/workers/dxf-parser` (ezdxf, deployed as the CAD worker) and `apps/workers/ai` | `apps/workers/*/pyproject.toml` |
| ORM / data access | Drizzle ORM 0.45.2 over `postgres` (postgres.js) 3.4. drizzle-kit 0.30 is present, but SQL migrations are the authority | `packages/database/src/client.ts` |
| Database | Supabase Postgres 17 (`major_version = 17`), pgvector. 177 SQL migrations | `supabase/config.toml`, `supabase/migrations/` |
| Auth | Supabase Auth (`@supabase/ssr` 0.6 cookie sessions; JWT bearer to the API) | `packages/auth/src/server.ts`, `apps/api/src/auth/supabase-jwt.guard.ts` |
| Hosting | Web on Vercel (`thirdcode-erp`). API + CAD worker on Railway. DB on Supabase `aqqrtkmtcsfkbyyqxowv` (no PITR) | `docs/erp/RUNBOOK.md`, `docs/DEPLOYMENT.md` |
| UI | Tailwind CSS 4 + hand-written CSS (`app/globals.css`, `app/workspace.css`) and inline styles. No component kit: `components/ui` has 3 files and there are no Radix/shadcn deps. 3,414 `style={{` vs 4,774 `className=` in `.tsx` | `apps/web/src/components/ui/` |
| State / data fetching | React Server Components + Server Actions (`'use server'`, 68 files), `useActionState` in 9 files. No React Query, Zustand or react-hook-form | grep census |
| Validation | Zod 3.25 (182 `z.object` schemas in `packages/shared-types`). The API mostly uses `schema.safeParse(body)` in controllers or `ZodBodyPipe`, with class-validator `ValidationPipe` as the global net | `apps/api/src/common/zod-body.pipe.ts` |
| AI | `ai` SDK 6, `openai` 6.37 (web). `packages/ai` pins `openai` ^4 (4.104), so two majors are installed | `packages/ai/package.json` |
| Tests | Vitest 4.1.11 (all TS packages), Playwright 1.x (`apps/web/e2e`, 20 configs), Python pytest suites (not run by any CI workflow) | `apps/*/vitest.config.ts`, `.github/workflows/ci.yml` |
| Observability | Vercel analytics/speed-insights. OpenTelemetry via Inngest. Structured `console.warn/error` (92 prod call sites) | `apps/web/package.json` |

## 2. Folder structure: where each concern lives

```text
apps/
  web/                    Next.js app (UI + legacy data paths + BFF to Core API)
    src/app/              routes: (auth) (dashboard) (platform) (print) portal/ api/
                          149 page.tsx · 38 api route.ts · 68 'use server' action files
    src/components/       feature folders (bom, pipeline, procurement, cortex, …); ui/ is tiny
    src/lib/              query modules (*-queries.ts), Inngest functions (inngest-*.ts),
                          erp-core-client.ts (10,513 lines: typed HTTP client to the Core API)
    src/server/crm/       server-side workflow services
    src/middleware.ts     Supabase session refresh, CSP nonce, distributed rate limit, security headers
    e2e/                  Playwright specs (+ per-feature playwright.*.config.ts)
  api/                    NestJS "ERP Core" (transaction authority being migrated into)
    src/<domain>/         controller + service + *.spec.ts per command (projects, procurement,
                          finance, inventory, crm, cortex, documents, …). 99 controllers, ~247 routes
    src/auth/             SupabaseJwtGuard + CapabilityGuard (global APP_GUARDs), PlatformOwnerGuard
    integration/          DB-backed integration specs (run only in CI's DB job)
  workers/dxf-parser/     Python FastAPI CAD parser (Railway)
  workers/ai/             Python FastAPI evidence/extraction worker
packages/
  database/               Drizzle schema (src/schema/*.ts, 119 files), db client, cortex read API,
                          src/__tests__ (DB-backed, skip without DATABASE_URL)
  shared-types/           Zod contracts for the web↔API boundary (src/erp-api/*), authorization
                          policy (src/authorization.ts), money helpers (src/common.ts)
  auth/                   Supabase server/browser/admin clients, getUserProfile, requireCapability
  operations/             shared domain logic (signed-BOM award, business calendar, audit)
  ai/                     embeddings / retrieval helpers (no tsconfig, no typecheck script)
  config/                 shared tsconfig bases
supabase/migrations/      177 timestamped SQL migrations: schema, RLS, triggers, functions
supabase/functions/       legacy Edge Functions (sla-checker, permit-staleness-checker, cnps-survey-sender)
scripts/                  ~100 node:test contract/invariant verifiers wired into CI (verify-*.mjs, plan-*.mjs)
```

| Concern | Location |
|---|---|
| Routes / pages | `apps/web/src/app/**/page.tsx`. API: `apps/api/src/**/*.controller.ts` |
| Domain logic | `apps/api/src/<domain>/*.service.ts` (new writes). `apps/web/src/app/**/actions.ts` + `apps/web/src/lib/**` (legacy). `packages/operations` (shared) |
| Data access | Drizzle `db` from `@third-code-erp/database`. 188 non-test web files import it directly. API uses `DatabaseService.client` (`apps/api/src/database/database.service.ts`) |
| Web→API boundary | `apps/web/src/lib/erp-core-client.ts` (bearer = the user's Supabase access token, `Idempotency-Key` header, Zod-parsed responses) |
| Components | `apps/web/src/components/<feature>/` |
| Migrations | `supabase/migrations/*.sql` (authority). Drizzle schema mirrors them by hand |
| Tests | Colocated `*.test.ts(x)` (web, packages), `*.spec.ts` (api), `apps/api/integration`, `packages/database/src/__tests__`, `apps/web/e2e`, `apps/workers/*/tests`, `scripts/*.test.mjs` |

## 3. Canonical commands

CI (`.github/workflows/ci.yml`) is the reference. On this Windows machine,
local `turbo` is broken (corepack pnpm 10.33 vs global pnpm 11), so per-package
commands were run instead. "Verified" means the command was run during this audit.

| Task | Command (CI form) | Local equivalent used | Status |
|---|---|---|---|
| Install | `pnpm install --frozen-lockfile` | `corepack pnpm --config.engine-strict=false install --frozen-lockfile` | Verified: up to date in 1.6 s |
| Dev | `pnpm dev` (`turbo dev --parallel`) | `apps/web`: `next dev --turbopack`. `apps/api`: `nest start --watch` | Not run: needs `.env` (Supabase, `DATABASE_URL`, Redis), and none exists in the worktree |
| Build | `pnpm turbo build` (concurrency 1; web `next build`, api `nest build`) | `node node_modules/@nestjs/cli/bin/nest.js build` (apps/api). `next build` (apps/web) with CI's placeholder env | Verified: api 26 s, web 127 s, both rc 0 |
| Typecheck | `pnpm turbo typecheck` | `node ../../node_modules/typescript/bin/tsc --noEmit -p <tsconfig>` for 13 tsconfigs (web + 7 e2e configs, api, database, operations, shared-types, auth) | Verified, 0 errors |
| Lint | `pnpm lint` (eslint 9 flat config, `--max-warnings=0`) | `corepack pnpm --config.engine-strict=false lint` | Verified, 0/0. Calling `eslint.js` directly fails to resolve `eslint-plugin-react-hooks` (no public hoist). pnpm's `NODE_PATH` is required |
| Unit | `pnpm test` (`turbo test`) + ~40 `node --test scripts/*.test.mjs` | `node node_modules/vitest/vitest.mjs run` per package (api: `run src test`) | Verified (see report) |
| Integration | CI job `database-reproducibility`: `supabase db start && supabase db reset --local`, then `vitest run` in database, `vitest run integration` in api, 3 web `*.integration.test.ts` | needs Supabase CLI 2.109.1 + Docker + Redis | Not runnable here (no Supabase CLI, Docker daemon off). CI green on `main` |
| E2E | CI `claim-document-browser` (15 credential-free Playwright specs) + trusted-PR `e2e` (`smoke-console.spec.ts`, needs secrets) | `pnpm --dir apps/web exec playwright test …` | Not run locally |
| Local DB start/reset | `supabase start` / `supabase db reset --local` (applies migrations + `supabase/seed.sql`) | — | Not runnable here |
| Migrate | New SQL file in `supabase/migrations/` (timestamp prefix). The release gate needs a current linear ledger (`scripts/plan-database-release.mjs --require-current`) | — | Static only |
| Seed | `supabase/seed.sql` (on reset). `pnpm --filter @third-code-erp/database db:seed` (`tsx src/seed.ts`) | — | Not run (needs DB) |
| Prod smoke | `pnpm smoke:prod` / `smoke-prod.yml` | — | Not run (production) |

## 4. Data model summary

214 tables come from replaying the migrations (static scan). 211 of them carry
`tenant_id`. Money is integer minor units (`*_cents` / `*_centavos` as
`bigint`). `numeric(18,4)`/`numeric(10,2)` hold quantities and rates. The only
`real` columns are `cortex_edges.weight/confidence` (not money).

```text
tenants ─┬─ users (1 row per auth user: tenant_id + role + account_status)   tenant_memberships (dormant, ADR-022 Phase 0)
         ├─ accounts ─┬─ contacts, account_kyc_artifacts
         │            └─ opportunities ─┬─ opportunity_kyc_tracks, proposals/site_inspections/pprf, tenders
         │                              └─ projects (via conversion; award_handoffs)
         ├─ projects ─┬─ scope_items, project_locations, documents, design files, change_requests
         │            ├─ boms ── bom_line_items ── dupas / dupa_libraries, grain/location reviews
         │            ├─ project_budgets ── project_budget_lines ── cost_codes; cost_entries
         │            ├─ rfqs ── rfq_quotes; purchase_orders ── po_line_items ── vendors; deliveries
         │            ├─ invoices, progress_claims, billing milestones, supplier_bills ── supplier_bill_lines
         │            ├─ permits, checklists, daily_tasks, weekly progress, schedule, RFIs, submittals, site diary
         │            ├─ quality hold points, punchlist, certificates_of_completion, turnover_packages
         │            └─ warranty tickets, cnps surveys, customer_portal_sessions
         ├─ finance: fiscal_periods, ledger_accounts, journal_entries ── journal_lines, cash_accounts,
         │           cash_transactions ── cash_allocations, bank_statements ── bank_statement_lines
         ├─ inventory: units_of_measure, material_items, warehouses, stock_receipts/movements, stock_ledger_entries
         ├─ cortex_nodes / cortex_edges / cortex_provenance (graph mirror via triggers), embeddings (pgvector)
         ├─ audit_log (append-only, hash-chained, trigger-written)
         └─ *_requests tables (42): idempotency receipts for Core API commands (tenant_id, key, result)
```

Composite tenant FKs are the norm in newer migrations. Examples:
`(tenant_id, project_id) → projects(tenant_id, id)`, backed by
`ux_<table>_tenant_id_id` unique indexes. Soft delete uses `deleted_at` /
`deleted_by` / `deletion_reason` with a check constraint
(`packages/database/src/schema/projects.ts`).

## 5. Tenancy model

Shared database, shared schema, `tenant_id` on every business row. There are
two independent layers (`docs/runbooks/tenant-isolation.md`).

**1. App layer (primary for server code).** The Drizzle pool connects with
`DATABASE_URL`, and every server path uses it: web RSC/actions and the Nest API.
- `packages/database/src/cortex/graph.ts:4`: "The Drizzle client connects as the
  `postgres` role, which BYPASSES RLS".
- `packages/database/src/__tests__/rls-isolation.test.ts:19` says the same.
- So isolation depends on an explicit tenant predicate taken from the session,
  never from input. Web example (`apps/web/src/app/(dashboard)/pipeline/actions.ts:40-48`):

```ts
const [project] = await db.select({ id: projects.id }).from(projects)
  .where(and(eq(projects.id, projectId),
             eq(projects.tenant_id, profile.tenantId),
             isNull(projects.deleted_at)))
```

- API example: `SupabaseJwtGuard` resolves `principal.tenantId` from `users`
  (`apps/api/src/auth/supabase-jwt.guard.ts:53-64`). Services filter on
  `principal.tenantId`.

**2. DB layer (defense in depth).**
- RLS is enabled on 122 tables by explicit `enable row level security`
  statements; 278 `create policy`, 0 `using (true)`. Policies key on
  `auth_tenant_id()`.
- RLS applies to `authenticated`/`anon` (supabase-js, PostgREST, Realtime).
- `force row level security` appears on 96 tables (accounting, payables, cash
  and later). That contradicts the runbook line "no table has FORCE ROW LEVEL
  SECURITY". Drizzle still bypasses RLS only if the runtime role has
  `BYPASSRLS`. Supabase's `postgres` role has it (inferred, not checked against
  the live catalog).
- Some web transactions call `stampActorInTransaction` to set
  `request.jwt.claims` (`apps/web/src/lib/audit.ts`), so DB triggers can attribute the actor.

Static guards:
- `scripts/verify-web-db-boundary.mjs`: no web API route may write directly.
- `scripts/verify-build-ops-invariants.mjs`: migration invariants.
- CI asserts client-role grants after reset.

## 6. Auth / authz model

- **Identity.** Supabase Auth email/password. Web sessions are cookies refreshed
  in `apps/web/src/middleware.ts` (`supabase.auth.getUser()`). Server code calls
  `getUserProfile()` / `requireUserProfile()` (`packages/auth/src/server.ts`). It
  reads `tenant_id, role` from `public.users` under RLS and auto-activates
  verified invited users through `activate_current_invited_user`.
- **Roles.** 13 roles in `public.users.role` (`roleEnum`): owner, admin,
  estimator, pm, sales, commercial, design, sd_pm_pe, finance, procurement,
  safety, cx, viewer. There is one tenant per user.
- **Capabilities.** 91 capability names map to roles in one framework-free policy
  module, `packages/shared-types/src/authorization.ts`, shared by web and API.
- **Where checks happen.**
  - Web server actions: `can(profile.role, '<capability>')` /
    `requireCapability`, or delegation to the Core API. A few use ad hoc role
    checks, e.g. `ensureCanManageAccess` in `projects/[id]/access/actions.ts:38`.
  - API: global `SupabaseJwtGuard` verifies the bearer token and requires an
    active user and tenant. Global `CapabilityGuard` is **default-deny**: a
    route with no `@RequireCapabilities`/`@RequireAnyCapabilities` gets 403
    (`apps/api/src/auth/capability.guard.ts:62-73`). `@Public()` opts out.
    Platform routes use `PlatformOwnerGuard`.
  - DB: RLS for client-role paths only.
  - Public portals (`app/portal/*`) authenticate by hashed token
    (`*_portal_tokens`, `customer_portal_sessions`), not by session.
- **Service role.** `createSupabaseAdminClient()` (`packages/auth/src/admin.ts`)
  bypasses RLS. It is used for storage, auth admin, and Inngest/webhooks.

## 7. Conventions observed

- **Naming.** DB snake_case. Drizzle columns keep snake_case keys
  (`table.tenant_id`). TS camelCase. Files kebab-case. Nest files are
  `<thing>.controller|service|pipe.ts` with colocated `*.spec.ts`.
- **API contract.** Each command has a Zod command + result schema in
  `packages/shared-types/src/erp-api/*`. Mutations carry an `Idempotency-Key`,
  and the API persists a receipt row in a `*_requests` table so retries replay.
  Responses are plain JSON result objects, not an envelope. Errors use Nest
  `HttpException` → `{ statusCode, message }`.
- **Web result shape.** Web calls return a
  `CoreResult<T> = { ok: true, data } | { ok: false, error, status }`. Server
  actions return `{ error?: string, ... }` and call `revalidatePath`. Users see
  only allowlisted domain error strings. Nest's default filter returns a generic
  500 for unknown errors, and no custom exception filters exist.
- **Error handling.**
  - `databaseErrorMessage/Code` unwrap Drizzle `cause` for constraint mapping
    (`apps/api/src/database/database-error.ts`).
  - The web logs `console.warn/error` with tagged prefixes.
  - `.catch(() => null)` appears 206 times; 156 of those parse optional JSON
    error bodies in `erp-core-client.ts`.
- **Forms.** Native `<form action={serverAction}>` + `FormData` (70 files) with
  Zod `safeParse` in 52 of 68 action files. No client form library.
- **Money.**
  - Persist integer minor units (`bigint` `*_cents`/`*_centavos`); Drizzle
    `bigint(..., { mode: 'number' })` in 49 columns.
  - Format with `formatCents` (`packages/shared-types/src/common.ts:16`) and
    `en-PH` `Intl` (234 uses).
  - Peso→cents input parsing is ad hoc: `Math.round(parseFloat(x) * 100)` in
    several forms/actions.
  - Percentages go to basis points (`billingPercentBps`).
- **Dates.** `timestamptz` everywhere. Business day = Manila (`Asia/Manila`, 42
  uses). Helpers live in `apps/web/src/lib/operations/cadence-engine.ts`
  (`manilaDayAt`, `manilaBoundaries`) and `packages/operations/src/business-calendar.ts`.
  `date-fns` is barely used (1 import).
- **i18n.** None. English UI only, PHP-only currency.
- **Audit.**
  - DB triggers hash-chain `audit_log` (`supabase/migrations/20260509164538_audit_triggers.sql`).
  - App-level `writeAuditLogInTransaction` (atomic) vs `writeAuditLog` (separate
    statement, 79 web call sites).
- **Docs/evidence.** Handoffs, changesets and ledgers live under `docs/`. CI
  enforces contract tests per work order (`test:wo-NN-*`).

## 8. Feature flags

There are three mechanisms.

1. **Core API cutover flags (main one).** Env pairs `ERP_<X>_VIA_API=true` +
   `ERP_<X>_VIA_API_TENANT_IDS=<uuid,…>|*`.
   - Evaluated by `tenantEnabledForCoreApi` / `tenantEnabledForExactCoreApi`
     (`apps/web/src/lib/erp-core-client.ts:520-566`).
   - 96 distinct flags. When a flag is off, the web keeps its legacy
     direct-Drizzle path; when on, it calls the Nest API.
   - Vercel env vars snapshot per deployment, so a flag change needs a redeploy
     (`docs/erp/RUNBOOK.md` §1.7).
2. **Boolean env gates.** E.g. `BUSINESS_CALENDAR_DB_ENABLED`,
   `PROCESS_SLA_ENGINE_ENABLED` (`docs/DEPLOYMENT.md` §2).
3. **`tenant_feature_flags` table** (per-tenant `feature_key`/`enabled`). Read
   by `apps/api/src/roadmap/roadmap.service.ts:202`; new, roadmap integrations only.
