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
| Deployment | Next.js is live on Vercel. NestJS is live on Railway with managed Redis and healthy database/queue readiness. Both current production releases are attributed to `kurtgav` |

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
- Tenant-scoped canary selection requiring an exact-disabled-by-default flag
  plus an explicit database-derived tenant allowlist.
- Safe rollback to the legacy write path when either gate does not match.

## Hosted release status

- GitHub source is published to `Third-Code-Solutions/ERP`; the reviewed
  deployment milestone is present on `main`.
- GitHub CLI and Git operations use `kurtgav`. GitHub Actions cannot start
  runners because the organization account has a billing/spending-limit
  block; the failure occurs before any workflow step executes.
- Railway project `a21fd382-80b2-4218-8025-11f420a062e3` runs the NestJS
  service `Third Code ERP API` and a managed Redis service.
- `https://third-code-erp-api-production.up.railway.app/health` returns
  `status=ok`; `/ready` returns `database=ok` and `redis=ok`.
- The current Railway deployment is
  `dffa3105-7db3-4bd2-8ba9-505bf2248aee`, built remotely from commit
  `62d9106f483cf64ceead737b39aeebf618853ca3`. The root `package.json`
  planner aliases matched Railway's API watch patterns even though API source
  did not change; the deployment completed successfully and health/readiness
  remain HTTP 200.
- Vercel project `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb` is disconnected from
  Git. The canonical alias still serves READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`. Vercel recorded zero deployments after
  source commits `ae373ce6`, `277e0348`, `e681bc2c`, and `62d9106f`.
- Vercel Web Analytics is enabled. Its production script returns JavaScript
  with HTTP 200 and the final desktop browser console is clean.
- A live no-write Supabase Auth proof covers missing/invalid bearer tokens,
  insufficient capability, cross-tenant lookup, malformed identifiers, and
  stale concurrency. All target Project fields and the 660-row audit baseline
  remained unchanged.
- Web-generated UUID correlation IDs now cross the Next-to-Nest boundary.
  Project command attempts return the same `x-request-id` and emit one
  structured outcome containing only operation, method, status, outcome, and
  duration. A deployed pre-guard 401 was matched to its Railway log.
- `ERP_CORE_API_URL` is configured for the Railway API. The production and
  preview Project-write migration flag remains disabled; no provider
  environment value was changed during this milestone.

## Current quality classification

| Classification | Evidence |
|---|---|
| Implemented | Broad construction ERP UI, Supabase schema/RLS, server actions, route handlers, audit infrastructure, Inngest jobs, first Nest transaction slice |
| Incomplete | Nest migration, Redis/BullMQ business jobs, uniform capability checks, uniform transactional audit, Python write removal, production-write activation evidence, clean CI, and provider-level rollback |
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
14. The migrated Project-write flag must remain disabled until clean CI and a
    provider-level enable/rollback drill are complete. Controlled hosted
    transaction, audit-attribution, and restoration evidence is complete.
15. Database test harnesses now require an explicitly injected
    `DATABASE_URL`; normal unit-test commands cannot auto-load a hosted
    application `.env.local`.
16. Local Docker cannot run until firmware virtualization and Windows Virtual
    Machine Platform are enabled. The current host reports
    `HCS_E_HYPERV_NOT_INSTALLED`. An isolated WSL1 lane now provides disposable
    PostgreSQL 17.10, pgvector 0.6.2, and Redis 8.0.4 evidence without touching
    production. This supplements, but does not replace, exact Supabase
    PostgreSQL/Redis container parity in CI.
17. The CI Actionlint bootstrap previously downloaded a mutable script from
    upstream `main`. It is now pinned to Actionlint 1.7.12 and verifies the
    Linux release archive SHA-256 before execution.

## Verification coverage

- Seventeen Nest unit/HTTP tests cover identity, database-derived tenancy,
  capability policy, atomic update, cross-tenant denial, stale-write conflict,
  strict request validation, legacy UUID compatibility, and malformed UUID
  rejection, request correlation, outcome classification, and log
  sanitization.
- Nest HTTP tests cover the preserved success contract and strict rejection of
  attacker-controlled fields. Four HTTP tests include real
  `ProjectsModule` middleware registration.
- Sixty-seven Web unit tests include exact feature-flag selection,
  tenant-allowlist fail-closed behavior, database-derived tenant routing,
  legacy write/audit rollback behavior, Nest-only routing when enabled, and
  Next-to-Nest correlation forwarding.
- API and web TypeScript checks pass for the new slice.
- API production compilation passes.
- The built API starts independently: `/health` returns 200, an unauthenticated
  Project write returns 401, and `/ready` returns 503 when its deliberately
  absent database and Redis dependencies are unavailable.
- Fresh uncached workspace tests pass with 244 executed tests; 128 database
  cases are skipped unless a disposable database URL and capability flags are
  explicitly injected.
- The dedicated fail-closed database lane rebuilds from all 48 migrations and
  seed data, then executes all 212 database tests with zero skips.
- A disposable-database Nest integration test now covers 401, 403, cross-tenant
  404, stale 409, successful update, trigger audit actor, and final rollback.
  It passes locally against the isolated PostgreSQL/Redis lane and remains
  wired into the exact clean-container CI job.
- Fresh replay exposed and fixed three database-function defects: a missing
  trigger return, PL/pgSQL record/table-alias resolution, and workflow guard
  ordering for bank reversal and Project Budget revision approval.
- The migration/catalog verifier passes with the optional platform
  `rls_auto_enable()` helper both absent and present-but-locked.
- Supabase project `aqqrtkmtcsfkbyyqxowv` is current at 48/48 migrations.
  Hosted and clean-local definitions for all five repaired functions have
  identical MD5 fingerprints; affected business/audit row counts were
  unchanged across the release.
- Source commit `42010b9adce6ae89286449edfc1e27c9ffe1eda7` is published
  to both release refs as `kurtgav <kurtgavin.design@gmail.com>`. Vercel
  production and preview are READY; Railway deployed the exact SHA
  successfully and reports database/Redis readiness.
- Release-tool source commit `d4ef08151fa60e62e239c0f049b08b1f83820789`
  pins the Actionlint artifact and is synchronized to both release refs.
  Vercel production and preview are READY on that exact frontend/source SHA.
  Railway recorded a watched-path skip and correctly retains the healthy API
  runtime from `42010b9adce6ae89286449edfc1e27c9ffe1eda7`.
- The production database catalog and migration ledger were verified.
- The deployed Railway API passed live `/health` and `/ready` checks against
  the configured PostgreSQL and Redis dependencies.
- A deployed unauthenticated Project PATCH returned 401 and echoed its safe
  UUID correlation header. Railway recorded the same ID as
  `erp.command.outcome`, operation `project.update`, outcome `rejected`, with
  no bearer token, payload, query, tenant, user, or Project identifier.
- A controlled authorized demo Project update and exact-value restoration both
  returned 200 through the deployed Nest API. Railway correlated both UUIDs
  as successful `project.update` commands.
- Supabase independently confirmed the original business values were restored,
  exactly two append-only Project audit rows were added, both rows identify
  the authorized same-tenant owner, both diffs contain only `notes` and
  `updated_at`, the marker round trip is exact, and the tenant hash chain is
  continuous.
- The temporary Supabase Auth refresh session was revoked after the proof. Its
  one-hour access JWT and all locally held credentials were cleared from the
  in-memory execution kernel.
- One-time admin-generated Supabase magic links were consumed without password
  resets to prove live identity resolution. Missing/invalid tokens returned
  401, a Viewer returned 403, a cross-tenant Project returned 404, a malformed
  identifier returned 400, and an authorized stale command returned 409.
- The live proof made no business writes: both target Project snapshots and
  the audit count/latest timestamp were unchanged at 660 rows.
- Production data exposed one valid non-v4 Project UUID. The API now accepts
  any syntactically valid UUID while retaining malformed-ID rejection; tenant
  scope remains the resource authority.
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
- Actionlint 1.7.12 passes against the workflow in the isolated Linux lane,
  the pinned archive digest matches the upstream release asset, and all
  GitHub Action tag-to-commit references resolve.
- Vercel production build is READY on the reviewed SHA. Live checks pass for
  landing, login, protected-dashboard redirect, robots, sitemap, canonical
  metadata, desktop/mobile overflow, images, analytics, and release identity.
- Live source/DOM scans contain no former-product or prohibited external ERP
  branding.
- Production `/dashboard` previously failed with digest `862076041` because
  the hosted `purchase_order_status` enum omitted the application-contract
  value `partial_delivered`.
- Forward migration `20260728005112_fix_purchase_order_status_catalog.sql`
  adds the missing enum label. The hosted ledger and a clean PostgreSQL 17
  replay are both current at 48/48.
- Hosted pre/post reconciliation is unchanged: 13 purchase orders,
  `378642000` total cents, 662 audit rows, and identical status counts. The
  repair changed only the enum catalog.
- The reproducibility verifier now checks the exact ordered purchase-order
  status catalog, preventing the same schema/application drift from passing
  release validation.
- Post-repair authenticated production proof now passes on Vercel deployment
  `dpl_5a132nUPMyqNHUMT4JwA8EpBqgHr`: `/dashboard` survives a hard reload,
  identifies the authorized Admin, renders KPI and Risk Signals regions, and
  records zero browser-console errors.
- Vercel records authenticated `/dashboard` 200 responses on the repaired
  deployment and no `/dashboard` runtime errors in the proof window.
- GitHub-hosted Actions remain blocked before job startup by the organization
  billing/spending-limit state. Latest blocked run `30379589707`, attempt 3,
  check `90353729857`, executed zero steps.
- A no-cost manual workflow now targets a repository-scoped short-lived Windows
  runner. It is private-repository only, dispatchable by `kurtgav`, read-only
  to repository contents, carries no production secrets, and uploads no
  artifacts.
- The runner delegates database verification to the isolated
  `ThirdCodeERP-Test` WSL1 distribution: PostgreSQL 17 plus checksum-pinned
  Redis 7.4.9, a dedicated `erp_self_hosted_ci` database, minimal test-only
  Supabase system fixtures, and no hosted credentials.
- Local proof passes: Actionlint 1.7.12, pinned action references, lint,
  typecheck, unit/release-planner tests, production build with 77 pages,
  48-migration clean replay, 212/212 database tests with zero skips, Nest
  database integration, unchanged before/after schema fingerprint
  `963464C47A8C3B2F771ABB940A0DC106C103FD5DF2410707884B736110A58D26`,
  native Nest health/readiness/401 smoke, and Gitleaks 8.30.1.
- GitHub accepted runner registration but deleted `--ephemeral` registrations
  before the listener could open a session. The bootstrap therefore uses a
  one-workflow transient runner with explicit stop, deregistration, and local
  erasure.
- Remote self-hosted GitHub workflow proof is complete. Production routing
  remains disabled: `ERP_PROJECT_WRITES_VIA_API=false`; the tenant allowlist
  remains empty.
- Self-hosted run `30419341799` proved GitHub billing does not block the free
  runner. It exposed Windows CRLF conversion in migration SQL and stopped at
  the fail-closed definition marker before build.
- Self-hosted run `30419757852` used LF checkout and passed the 48-migration
  replay, 212/212 database tests, Nest integration, production build, and
  native Nest smoke. Its final Gitleaks step classified the deterministic
  `pg_dump --restrict-key` delimiter as a generic API key. A path-and-value
  specific allowlist is prepared locally.
- Vercel Git integration was disconnected from `Third-Code-Solutions/ERP`.
  Existing production deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` stayed
  READY; landing, health, and readiness remained HTTP 200.
- Guard commit `ae373ce6f399e0d4bc5c7ef23537cc4f9b842837` is synchronized to
  `main` and `agent-02/third-code-erp-landing`. Vercel recorded zero
  deployments after that push.
- Self-hosted run `30422175962` is green on exact source SHA
  `277e03484c00b6c9c6e27bae7d708302bb6d2e88`: locked install, workflow
  validation, lint, typecheck, unit tests, 48 migrations, 212/212 database
  tests, Nest integration, production build, native smoke, Gitleaks, and
  cleanup all passed in 5m33s without dependency-cache or artifact upload.
- GitHub runner registration and runner-process counts are zero. All retained
  Windows runner directories are credential-free; Windows still holds their
  non-secret work files open, so physical directory deletion remains an
  operator cleanup item.
- The connected Supabase ERP project is `ACTIVE_HEALTHY` on PostgreSQL 17.6.
  A read-only M1 candidate scan found no existing tenant that satisfies every
  Project-cutover entry gate. The primary demo tenant has an authorized Admin
  and reversible E2E Projects, but its append-only history contains two
  predecessor-link mismatches and 151 hashes generated by historical formulas
  that do not verify under the current formula. The other QA tenant has a clean
  one-row chain but no application user or Auth identity.
- `scripts/plan-project-cutover.mjs` now produces a redacted, repeatable-read,
  read-only target report. It checks tenant/Project/actor scope, capability,
  Auth identity, PostgreSQL major, Project audit trigger, hardened function
  privileges, full predecessor continuity, hash verification, and Project
  history. It prints no UUIDs, business values, emails, or credentials.
- No database row, Auth identity, provider variable, deployment, or production
  route changed during this preflight. The canary remains blocked until a
  dedicated clean tenant is created through an approved supported onboarding
  path and the planner returns `ready`.
