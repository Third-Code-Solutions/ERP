# Current State

Verified from the repository and the configured Supabase target on 2026-07-28.
Application deployments are reported separately and are never inferred from a
successful build.

## Runtime topology

| Area | Verified implementation |
|---|---|
| Frontend | `apps/web`: Next.js 15.5.18 App Router, React 19.2.6, TypeScript 5.9.3 |
| Existing application backend | 47 Next.js Server Action files, 24 Route Handler files, SQL functions/triggers, and Supabase clients |
| New core ERP boundary | `apps/api`: NestJS 11 modular-monolith foundation. Project update is the first feature-flagged transaction slice and is off by default |
| Database | PostgreSQL 17 through Supabase; Drizzle 0.40.1; 44 SQL migrations and 45 Drizzle schema files |
| Authentication | Supabase Auth. Tenant membership and role come from PostgreSQL, not client claims |
| Authorization | RLS plus mixed application checks in the legacy path. The Nest slice has deny-by-default capability metadata and tenant-scoped queries |
| Async work | Inngest is the active legacy job system. Redis 5/BullMQ 5 are wired into the Nest foundation but have no migrated business jobs yet |
| Python | `apps/workers`: FastAPI document/DXF processing service. A legacy path can write `scope_items` directly and must be removed |
| Files | Supabase Storage |
| Deployment | Web is configured for Vercel. NestJS is deployed on Railway with managed Redis and healthy database/queue readiness. The Vercel production alias still serves the prior release because the first current-main deployment was blocked by commit-author membership policy |

## Dependency configuration

- pnpm 10.33.0 is pinned by `packageManager`.
- Root dependency overrides and peer-warning policy now live in
  `pnpm-workspace.yaml`, the configuration source pnpm 10 reads.
- `drizzle-orm` remains pinned to 0.40.1 across API, web, and database
  packages.
- Moving the ignored `package.json#pnpm` settings did not change
  `pnpm-lock.yaml`; its SHA-256 remained
  `A95947EAAF1B9D3801A27D5F551EF29239E1CF930BBD1FF8AAD0DF925E41A2C3`.

## Configured database release status

The authorized Supabase target `aqqrtkmtcsfkbyyqxowv` is PostgreSQL 17 and
matches the repository migration contract:

- Migration ledger: 44 of 44 applied; no missing or unexpected versions.
- Catalog: 86 public tables and 315 RLS policies.
- Verifier: all 30 protected-table groups, constraints, triggers, privileges,
  tenant controls, and finance/inventory authority checks pass.
- A forward-only hardening migration fixes the mutable `jsonb_diff`
  `search_path` and removes browser/service execution from maintenance-only
  helpers.
- Business baselines remained unchanged across the migration: 2 tenants,
  13 users, 25 projects, 13 purchase orders, 4 invoices, 660 audit rows,
  37 Storage objects, PHP 3,786,420.00 in purchase orders, and
  PHP 1,182,006.54 invoice net total.
- `supabase/seed.sql` was intentionally not applied because it is a local/CI
  reset fixture, not production data.

## Where business logic lives

- React/Next server modules: form parsing, permissions, writes, and audit calls.
- Next Route Handlers: integrations, uploads, webhooks, automation, and API
  surfaces.
- PostgreSQL: RLS, constraints, functions, triggers, ledger invariants, and
  audit support.
- Inngest/Edge Functions: scheduled and event-driven legacy jobs.
- Python: parsing and analysis, plus one prohibited direct-write legacy path.
- NestJS: Project update authorization and atomic transaction authority only,
  behind `ERP_PROJECT_WRITES_VIA_API=false`.

## Milestone 1 implementation

`PATCH /v1/projects/:projectId` now provides:

- Supabase bearer-token verification.
- Server-side tenant membership lookup.
- Explicit `project.update` capability enforcement.
- Strict shared Zod command validation.
- Tenant-scoped `SELECT ... FOR UPDATE`.
- Optimistic concurrency through `expectedUpdatedAt`.
- One PostgreSQL transaction for actor attribution and the official write.
- Existing Next Server Action contract and cache refresh behavior.
- Safe rollback to the legacy write path with one disabled-by-default flag.

## Hosted release status

- GitHub source is published to `Third-Code-Solutions/ERP`; `origin/main` is
  `f28af8098de29e8f5627cd383261ef8d1c456df2`.
- GitHub CLI and Git operations use `kurtgav`. GitHub Actions cannot start
  runners because the organization account has a billing/spending-limit
  block; the failure occurs before any workflow step executes.
- Railway project `a21fd382-80b2-4218-8025-11f420a062e3` runs the NestJS
  service `Third Code ERP API` and a managed Redis service.
- `https://third-code-erp-api-production.up.railway.app/health` returns
  `status=ok`; `/ready` returns `database=ok` and `redis=ok`.
- The successful Railway deployment is
  `8ccba547-8dde-4c37-8bcb-3f3834c18358`, built remotely from the reviewed
  Dockerfile and `railway.toml`.
- Vercel project `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb` is reconnected to
  `Third-Code-Solutions/ERP`. Its first current-main deployment
  `dpl_5Sdged8VSEc1if2UTAxWgPxYQ43P` was blocked before build because the
  historical commit mapped to GitHub user `thirdcodekurt`, who is not a member
  of the Vercel team.
- `ERP_CORE_API_URL` is configured for the Railway API. The production and
  preview Project-write migration flag was returned to disabled pending live
  authorization and rollback evidence.

## Current quality classification

| Classification | Evidence |
|---|---|
| Implemented | Broad construction ERP UI, Supabase schema/RLS, server actions, route handlers, audit infrastructure, Inngest jobs, first Nest transaction slice |
| Incomplete | Nest migration, Redis/BullMQ business jobs, uniform capability checks, uniform transactional audit, Python write removal, live Supabase Auth/cross-tenant verification, and current Vercel frontend release |
| Mock/demo | Repository and live application contain demo-oriented data and optional-provider fallbacks |
| Duplicated | Business rules and authorization are split across server actions, handlers, SQL, and worker code |
| Broken/risky | Python direct database write; optional Python shared secret; process-local rate limiting; elevated server credentials can bypass RLS; several audit writes are not in the same transaction as the mutation |

## Critical production risks

1. Any server path using an elevated database URL must include a verified
   `tenant_id` predicate; RLS may not protect that connection.
2. Sensitive legacy actions do not yet use one consistent capability policy.
3. Some legacy mutation and application-audit writes can commit separately.
4. Python can currently finalize a business-table write, contrary to the
   target authority boundary.
5. Python authentication can be optional and its CORS policy can be broad.
6. Rate limiting is process-local and cannot coordinate multiple instances.
7. Storage accepts a larger object than one documented application limit.
8. A clean local database reset requires Docker, which was unavailable during
   this milestone; clean-schema migration reproduction remains a CI gate.
9. Live-looking secrets exist in ignored local environment files. They were
   not copied into source or logs and should be rotated.
10. The existing worktree contains extensive pre-existing changes. Migration
    work must remain narrowly staged and reviewed.
11. The repository's current `lint` tasks are TypeScript checks, not a
    configured ESLint rule set.
12. Remaining Supabase advisor warnings include an extension in `public`,
    intentional RLS helper execution, and dashboard-level leaked-password
    protection; these require separate reviewed changes.
13. GitHub Actions is blocked before runner startup by the organization
    account's failed-payment/spending-limit state. Local green gates do not
    substitute for the skipped disposable PostgreSQL/Redis CI lane.
14. The current Vercel frontend release is blocked until a commit attributable
    to the authorized `kurtgav` Vercel team member is deployed.
15. Database test harnesses now require an explicitly injected
    `DATABASE_URL`; normal unit-test commands cannot auto-load a hosted
    application `.env.local`.

## Verification coverage

- Twelve Nest unit/HTTP tests cover identity, database-derived tenancy,
  capability policy, atomic update, cross-tenant denial, stale-write conflict,
  and strict request validation.
- Nest HTTP tests cover the preserved success contract and strict rejection of
  attacker-controlled fields.
- API and web TypeScript checks pass for the new slice.
- API production compilation passes.
- The built API starts independently: `/health` returns 200, an unauthenticated
  Project write returns 401, and `/ready` returns 503 when its deliberately
  absent database and Redis dependencies are unavailable.
- Fresh uncached workspace tests pass with 235 executed tests; 128 database
  cases are skipped unless a disposable database URL and capability flags are
  explicitly injected.
- A disposable-database Nest integration test now covers 401, 403, cross-tenant
  404, stale 409, successful update, trigger audit actor, and final rollback.
  It is wired into the clean PostgreSQL 17 CI job but has not run locally
  because Docker is unavailable.
- The production database catalog and migration ledger were verified.
- The deployed Railway API passed live `/health` and `/ready` checks against
  the configured PostgreSQL and Redis dependencies. Supabase Auth,
  cross-tenant denial, and official production transaction writes were not
  exercised; the migrated write flag remains disabled.
- Seven release-planner tests pass for current, linear-gap, non-linear,
  unexpected-history, SQL-risk, hash, and release-blocker behavior.
- Nest HTTP contract tests use an explicit 15-second harness timeout after a
  concurrent uncached build/test stress run exceeded Vitest's 5-second
  default. The unchanged suite passes in isolation and in a fresh uncached
  workspace test run.
- A frozen pnpm install passes without the prior ignored-configuration
  warning, keeps the lockfile byte-identical, and resolves
  `drizzle-orm@0.40.1` in all three consumers.
- Fresh uncached Nest and Next production builds pass; Next generated all
  77 pages.
- Gitleaks 8.30.1 reports zero findings for the exact staged change set.
