# Current State

Verified from the repository and the configured Supabase target on 2026-07-29.
Application deployments are reported separately and are never inferred from a
successful build.

## Runtime topology

| Area | Verified implementation |
|---|---|
| Frontend | `apps/web`: Next.js 15.5.18 App Router, React 19.2.6, TypeScript 5.9.3 |
| Existing application backend | 47 Next.js Server Action files, 24 Route Handler files, SQL functions/triggers, and Supabase clients |
| New core ERP boundary | `apps/api`: NestJS 11 modular-monolith foundation. Project update is the first feature-flagged transaction slice and is off by default |
| Database | PostgreSQL 17 through Supabase; Drizzle 0.40.1; 51 SQL migrations and 45 Drizzle schema files |
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

- Migration ledger: 51 of 51 applied; no missing or unexpected versions.
- Catalog: 86 public tables and 315 RLS policies.
- Verifier: all 30 protected-table groups, constraints, triggers, privileges,
  tenant controls, and finance/inventory authority checks pass.
- A forward-only hardening migration fixes the mutable `jsonb_diff`
  `search_path` and removes browser/service execution from maintenance-only
  helpers.
- Migration `20260729051205_harden_signup_provisioning.sql` hardens the Auth
  signup trigger with an empty `search_path`, fully qualified relations and
  built-ins, bounded display metadata, and a deterministic bounded tenant
  slug. Only `service_role` can execute the function directly.
- The signup hardening changed no business or identity rows: hosted counts
  remained 13 Auth users, 13 application profiles, and 2 tenants.
- Migration
  `20260729054456_persist_signup_organization_type.sql` adds the constrained
  non-authoritative tenant organization profile field. Existing tenants safely
  default to `other`; hosted identity and tenant counts remain unchanged.
- Migration
  `20260729115110_cortex_conversation_record_context.sql` adds an optional
  validated canonical record-reference pair to saved Cortex conversations and
  removes authenticated browser write authority from Cortex conversation and
  message tables. Existing ten conversations remain valid and unscoped.
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
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4`, built remotely from source commit
  `e948223b261b7c335ceaad85e359fec68888e84a`. Health and readiness remain
  HTTP 200 with PostgreSQL and Redis `ok`.
- Vercel project `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb` is disconnected from
  Git. The canonical alias still serves READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`. Vercel recorded zero deployments after
  source commits through `63b2b4c9dc824b6baa5c1fda2c2475cbde5b8896`.
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
8. Docker Desktop remains unavailable on this host, but the isolated WSL1
   PostgreSQL 17/Redis lane now provides the authoritative no-cost clean replay
   and zero-skip database gate.
9. Live-looking secrets exist in ignored local environment files. They were
   not copied into source or logs and should be rotated.
10. Repository governance is inconsistent: `AGENTS.md` references a missing
    PRD and obsolete pnpm/PostgreSQL/tRPC/Inngest stack rules. The explicit
    user-approved architecture documents govern current migration work until a
    separately approved governance rewrite reconciles that file.
11. The repository's current `lint` tasks are TypeScript checks, not a
    configured ESLint rule set.
12. Remaining Supabase advisor warnings include an extension in `public`,
    intentional RLS helper execution, and dashboard-level leaked-password
    protection; these require separate reviewed changes.
13. GitHub-hosted Actions is blocked before runner startup by the organization
    billing/spending-limit state. The approved short-lived self-hosted lane
    remains the authoritative no-cost gate.
14. The migrated Project-write flag must remain disabled until clean CI and a
    provider-level enable/rollback drill are complete. Controlled hosted
    transaction, audit-attribution, and restoration evidence is complete.
15. Database test harnesses now require an explicitly injected
    `DATABASE_URL`; normal unit-test commands cannot auto-load a hosted
    application `.env.local`.
16. Local Docker cannot run until firmware virtualization and Windows Virtual
    Machine Platform are enabled. The current host reports
    `HCS_E_HYPERV_NOT_INSTALLED`. The isolated WSL1 lane provides disposable
    PostgreSQL 17 and Redis 7.4.9 evidence without hosted credentials or
    production access.
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
- Sixty-nine Web unit tests include exact feature-flag selection,
  tenant-allowlist fail-closed behavior, database-derived tenant routing,
  legacy write/audit rollback behavior, Nest-only routing when enabled, and
  Next-to-Nest correlation forwarding.
- API and web TypeScript checks pass for the new slice.
- API production compilation passes.
- The built API starts independently: `/health` returns 200, an unauthenticated
  Project write returns 401, and `/ready` returns 503 when its deliberately
  absent database and Redis dependencies are unavailable.
- Fresh workspace tests pass with 377 passing tests; 134 database
  cases are skipped unless a disposable database URL and capability flags are
  explicitly injected.
- The dedicated fail-closed database lane rebuilds from all 51 migrations and
  seed data, then executes all 224 database tests with zero skips.
- A disposable-database Nest integration test now covers 401, 403, cross-tenant
  404, stale 409, successful update, trigger audit actor, and final rollback.
  It passes locally against the isolated PostgreSQL/Redis lane and remains
  wired into the exact clean-container CI job.
- Fresh replay exposed and fixed three database-function defects: a missing
  trigger return, PL/pgSQL record/table-alias resolution, and workflow guard
  ordering for bank reversal and Project Budget revision approval.
- The migration/catalog verifier passes with the optional platform
  `rls_auto_enable()` helper both absent and present-but-locked.
- Supabase project `aqqrtkmtcsfkbyyqxowv` is current at 51/51 migrations.
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
- The supported dedicated-tenant path already exists. `/auth/signup` is live;
  Supabase Auth fires `on_auth_user_created`, whose non-public
  `SECURITY DEFINER` function creates one isolated tenant and same-ID Admin
  profile. The signed-in Admin can create a non-critical Project through
  `/projects/new`, producing that tenant's first Project audit root.
- Executing this path requires a new user-controlled email identity and email
  confirmation. No account was created and no email was sent during the
  read-only inspection.

## M1 onboarding organization classification

- Hosted Supabase is current at migration
  `20260729054456_persist_signup_organization_type.sql` (50/50).
- Signup organization type now uses one shared six-value catalog across the
  Next.js form, TypeScript domain contract, Drizzle schema, database trigger,
  migration, and reproducibility verifier.
- `public.tenants.organization_type` is `NOT NULL`, defaults to `other`, and is
  protected by a validated check constraint. The two existing demo tenants
  were safely backfilled to `other`.
- Signup metadata is normalized through a database whitelist. Unknown or
  tampered values become `other`; the value grants no role, capability, or
  tenant access.
- Hosted counts remain 13 Auth users, 13 application profiles, and 2 tenants.
  `handle_new_user()` retains `search_path=""`; client execution remains
  denied; `service_role` execution and the enabled Auth trigger remain intact.
- Validation is green: root lint, typecheck, tests, and production build;
  50-migration PostgreSQL 17 replay; 220/220 database tests with zero skips;
  Nest database integration; release/cutover planners; Actionlint; pinned
  action references; Gitleaks; and diff hygiene.
- Supabase advisors report no finding tied to `organization_type`,
  `tenants_organization_type_check`, or `handle_new_user`. The pre-existing
  advisor backlog remains open.
- Source commit `828b63f90f13f6ff735a2b972781a69fa7ffcf2f` is synchronized
  to `main` and `agent-02/third-code-erp-landing` under `kurtgav`.
- Railway deployment `f480586e-fe8d-4214-a33e-7bfdaaa5f38c` succeeded from
  that exact commit. `/health` and `/ready` return HTTP 200; PostgreSQL and
  Redis both report `ok`.
- Vercel Git remains disconnected and recorded zero deployments after source
  publication.
- No Auth user, email, Project, provider variable, or Vercel deployment was
  created. Project routing remains disabled and the allowlist remains empty.
- Exact next action: obtain explicit approval for the unused canary email,
  complete normal signup and confirmation, create one non-critical Project,
  then require a zero-blocker read-only cutover plan.

## Public landing mobile QA correction candidate

- A fresh live audit verified canonical metadata, index/follow directives,
  Organization, SoftwareApplication, and FAQPage JSON-LD, robots, sitemap,
  manifest, health, and readiness. The live frontend remains deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` at source revision `f24e5603a355`.
- The live 390px hero renders six visual lines and several mobile links are
  shorter than the product's 44px control target. Decorative ordinal labels
  also remain in capability, workflow, and FAQ surfaces.
- The source release candidate constrains the mobile H1 to exactly three visual
  lines, removes decorative ordinal labels, preserves functional carousel
  position, and gives every visible mobile link/button/summary at least 44px.
- Vercel Analytics now renders only when `VERCEL=1`. Self-hosted production
  builds no longer request the unavailable `/_vercel/insights/script.js`.
  The hero uses one high-priority responsive image request without duplicate
  preload work.
- This candidate changes no database, Auth, Nest, Redis, queue, tenant-routing,
  or provider configuration. Vercel Git remains disconnected; no deployment
  is authorized by this source work.
- Commit `f40b2472d070085ef114143b65cfd822bda30f0d` is synchronized to
  `main` and `agent-02/third-code-erp-landing` as
  `kurtgav <kurtgavin.design@gmail.com>`. Vercel recorded zero deployments
  after publication.

## M2 document-processing design baseline

- Current upload path was traced from browser upload through Next.js, Inngest,
  Python, `scope_items`, and draft-BOM creation.
- Python directly deletes and inserts `scope_items` with `DATABASE_URL`; it
  also downloads Storage objects with a service-role key.
- Next.js separately owns inline DXF, visual/AI extraction, scope-row
  replacement, and draft-BOM writes.
- BullMQ and Redis are configured in NestJS, but no business queue or processor
  is registered.
- Hosted PostgreSQL 17.6 confirms RLS on `documents` and `scope_items`, but
  neither table has a composite tenant/Project foreign key or audit trigger.
- Current upload sign and complete routes derive user tenant but do not first
  prove requested Project belongs to that tenant.
- Current extraction tests do not cover endpoint authentication, cross-tenant
  substitution, durable idempotency, queue retries, evidence immutability, or
  transaction rollback.
- Original target contract is recorded in
  `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`.
- No code, schema, data, Auth, Storage, queue, provider, or deployment changed
  during this design milestone.

## Upload tenant-Project access hardening candidate

- Shared `getProject(tenantId, projectId)` previously queried only by tenant,
  loaded one arbitrary row, then compared its ID in application code.
- Upload sign and complete handlers trusted a syntactically valid Project UUID
  after deriving user tenant. A crafted path could reach quota, Storage, or
  document work without first proving same-tenant Project ownership.
- Source candidate now queries Project by tenant and Project ID together.
- Both upload handlers return non-enumerating `404 Project not found` before
  quota, signed Storage URL, document insert, CAD/AI parsing, or queue work.
- Same-tenant signed upload and document-recording contracts remain unchanged.
- Six focused tests cover exact two-key query, null result, both cross-tenant
  denials, and both valid-flow compatibility paths.
- No UI, copy, schema, data, Auth, Storage, queue, provider setting, or
  deployment changed. Live Vercel still needs one separately approved paid
  build before this protection is active there.

## Document mutation authority candidate

- Upload sign, upload complete, and Project document deletion previously
  authenticated a user but did not require an explicit document-mutation
  capability. A `viewer` could reach all three mutation paths.
- Signed upload authorization and document creation previously produced no
  application audit entry. Document deletion also lacked an audit entry.
- Document deletion removed the Storage object before independent database
  deletes. A later database failure could leave a live document record whose
  object had already been removed.
- Source now defines `document.manage` for every operational role and denies
  `viewer`. Upload sign and complete fail with 403 before request side effects
  when the capability is absent.
- Signed URL issuance appends an actor- and tenant-scoped audit record before
  returning the credential. Document creation and its hash-linked audit entry
  commit in one PostgreSQL transaction.
- Document deletion validates UUIDs, binds document, tenant, and Project
  together, locks the row, deletes derived scope rows and the document, and
  appends the audit entry in one transaction. Storage cleanup starts only
  after that transaction commits and uses the Project loaded from the record.
- No UI, schema, hosted data, Auth, Storage object, queue, provider setting, or
  deployment changed. Live Vercel retains the prior behavior until one
  explicitly approved consolidated production build.

## Cortex canonical entity registry candidate

- PostgreSQL and Drizzle define 48 Cortex node types. The hosted graph currently
  has 385 active nodes across 14 of those types.
- Cortex metadata had drifted across separate maps: role scope covered 43
  types, graph labels/colors covered 28, navigation covered fewer, and the
  entity endpoint accepted only the older source-table set.
- Source now has one exhaustive 48-type registry for display labels, colors,
  role access paths, source-table ownership, and canonical record navigation.
- Four reserved enum values with no UUID-backed mirror table are explicit
  non-queryable definitions; no fictional source name is accepted.
- Graph RBAC and citation labels derive from that registry. A schema-backed
  unit test fails when a node type is added without an intentional definition.
- Entity lookup now accepts every registered source, checks the tenant-scoped
  node, rejects a source/type mismatch, applies the caller's role scope to the
  context pack, and preserves a non-enumerating 404 for forbidden records.
- No schema, hosted row, Auth identity, Storage object, provider setting, or
  deployment changed. Live Vercel retains the old maps until one explicitly
  approved consolidated production build.

## Cortex grounded citation navigation candidate

- Cortex chat already generated and persisted grounded citations, but the
  streamed response exposed only plain text and the conversation UI discarded
  citation metadata.
- Source now preserves the existing `text/plain` stream while returning up to
  eight bounded citations in `X-Cortex-Citations`.
- New assistant answers and restored conversation history render canonical
  source-record links through the 48-type entity registry.
- Conversation history trusts only stored node IDs. It rebuilds title,
  reference, Project context, and route from current tenant-scoped graph data
  under the viewer's current role.
- Missing, superseded, cross-tenant, malformed, and role-forbidden citation
  nodes are omitted. A role downgrade therefore cannot reveal stale stored
  metadata.
- Desktop citation targets have visible keyboard focus. At 390px, targets are
  44px high and produce no horizontal overflow.
- No schema, hosted row, Auth identity, Storage object, or provider setting
  changed. Vercel Git remains disconnected and recorded zero deployments.
- Publishing source commit `59b4c236b8803b3ca19ce012abd78b795e5a1790`
  triggered Railway because `packages/database` is in the API watch set.
  Deployment `2991586f-070e-470a-add0-56ce264b74e8` built the NestJS Dockerfile,
  passed `/ready`, and is live with PostgreSQL and Redis both `ok`.
- The Next.js citation UI is still source-only. Live Vercel remains deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` at revision `f24e5603a355`.

## Cortex operational record context candidate

- Cortex context was embedded only on Project detail and the graph workspace.
  Finance, procurement, inventory, CRM, claims, variation, punchlist, and
  warranty detail pages had no in-place backlinks.
- Dashboard layout now resolves 16 exact UUID-backed detail-route patterns to
  their canonical Cortex source tables and renders one shared context panel.
- Collection, create, edit, print, portal, Project-detail, malformed, and
  unsupported paths fail closed and render no new panel.
- Existing path RBAC runs before rendering. The existing entity API then
  reauthorizes tenant, source/type ownership, and current-role graph scope.
- Cash transaction navigation now opens the exact transaction detail route
  instead of falling back to the collection.
- No page owns a Cortex query or duplicate route map. One resolver and the
  exhaustive entity registry own the behavior.
- No schema, hosted row, Auth identity, Storage object, queue, provider setting,
  or deployment changed. This remains a source candidate while Vercel Git is
  disconnected.

## Cortex directional relationship candidate

- Record context previously listed grouped edge names in summary text and
  separate source chips, but did not explain each source's directional meaning.
- The entity response now derives at most 12 relationship rows from the
  existing tenant- and current-role-filtered context pack.
- Fifteen canonical edge types have explicit outgoing and incoming labels.
  Unknown types fail safely to `Connected`.
- Each relationship retains its canonical citation, origin, direction, and
  confidence. Missing citations are omitted instead of producing guessed links.
- The existing authorization gate still runs before graph-neighbor retrieval.
  Browser code receives no tenant selector, database access, or transaction
  authority.
- The panel renders canonical backlinks in two columns at desktop/tablet and
  one column at mobile, with 44px targets, visible focus, ellipsis, and no
  horizontal overflow.
- No schema, hosted row, Auth identity, Storage object, queue, backend, provider
  setting, or deployment changed. This remains a source candidate while Vercel
  Git is disconnected.

## Cortex evidence-trail candidate

- Cortex already stored append-only, tenant-scoped provenance, but operational
  record panels did not show when or how a node entered the graph.
- Hosted read-only inspection found 637 node events across all 385 current
  nodes. Each current node has one to three events; current hosted origins are
  ERP mutations.
- Entity response now returns at most six safe evidence events from the
  existing role-filtered context pack.
- Server normalization exposes only event kind, label, explanation, and ISO
  timestamp. Actor ID, origin reference, hashes, sequence, tenant ID, and
  subject ID never reach browser code.
- Mutation, document, AI-run, and import origins have explicit human language.
  Unknown origins fail safely to generic system evidence.
- Native disclosure remains collapsed by default, keyboard operable, 44px high,
  responsive, and read-only.
- No schema, hosted row, Auth identity, Storage object, queue, backend, provider
  setting, or deployment changed. Hosted Supabase access was aggregate
  read-only. Vercel Git remains disconnected.

## Cortex focused-neighborhood candidate

- Authorized operational record panels now expose one `Open focused graph`
  backlink built from their canonical source table and UUID.
- `/api/cortex/graph` preserves its existing whole-graph response when no
  focus is supplied. A complete `refTable` plus `refId` focus is validated
  against the canonical registry and UUID format.
- The server resolves the node by authenticated tenant, verifies source/type
  ownership and current-role access, then returns the exact node plus a
  bounded one-hop neighborhood. Missing, mismatched, and forbidden records
  share a non-enumerating 404.
- Focused database retrieval rechecks tenant on the focus node, graph edge,
  and joined neighbor node because the application database role bypasses
  RLS. Browser input never selects a tenant or trusted node ID.
- The server-derived focus node opens its detail drawer automatically, remains
  highlighted, and is centered in the visible canvas. The count is explicitly
  labeled as connections shown, not a total.
- Tablet and mobile flow the drawer below the graph. The shell collapses to an
  icon navigation rail below 700px. Authenticated production-build QA at
  1440, 768, and 390 found zero page overflow and zero console/page errors.
- No schema, business row, password, Storage object, queue, or provider setting
  changed. Hosted Supabase supplied read-only record evidence; gated E2E used
  one-time test sessions and globally revoked them afterward. Vercel retained
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Source commit `5ed6984d789dcc62bffc6a61f2e16fe759e281b7` reached both
  the working branch and `main`. Because `packages/database` is watched,
  Railway deployment `dd9f0f50-e8bd-4411-a49b-ffea0984030a` built and
  activated successfully; live health and readiness are 200 with PostgreSQL
  and Redis `ok`.

## Cortex durable conversation context

- Saved conversations can now hold one immutable canonical record reference:
  registered source table plus UUID, or neither value.
- New and restored chats reauthorize that record against the authenticated
  tenant, current Cortex node, canonical entity mapping, and current role.
  Missing, mismatched, revoked, and forbidden context shares a
  non-enumerating 404 response.
- History omits conversations whose stored context is no longer authorized.
  Existing unscoped conversations remain backward compatible.
- Chat request input is bounded. Stored record context is included in the
  grounded prompt and deterministic fallback without allowing the model to
  approve or finalize ERP transactions.
- Official conversation and message writes are server-only. Hosted catalog
  checks confirm zero authenticated write policies, table grants, or column
  grants for these tables.
- Hosted Supabase is live on migration
  `20260729115110_cortex_conversation_record_context.sql` at 51/51. Ten
  existing conversations remain; zero have a half-bound context pair.
- Disposable PostgreSQL 17 and Redis validation passed all 51 migrations,
  catalog verification, 224/224 database tests with zero skips, Nest database
  integration, and stable rollback fingerprint
  `C89987BD5B4E7DAA2F53DDD0036FBE3614D385844078453B052E992516935260`.
- Supabase security advisor reports no new Cortex finding. Existing findings
  remain: one public-schema extension, callable authorization helpers,
  leaked-password protection disabled, and one RLS-enabled internal sequence
  table without a policy.
- The durable API boundary is now exercised by the source-only context,
  deep-link, and recent-history presentation candidates below. Vercel Git
  remains disconnected, and no frontend deployment or provider spend occurred.
- Source commit `e948223b261b7c335ceaad85e359fec68888e84a` reached the
  working branch and `main` under `kurtgav <kurtgavin.design@gmail.com>`.
  Railway deployment `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` succeeded for
  that exact SHA; live `/health` and `/ready` are HTTP 200 with PostgreSQL and
  Redis `ok`.
- GitHub Actions run `30449560735` did not start a workflow step because the
  account reports failed payments or an exceeded spending limit. Local and
  disposable-runtime gates remain the verified evidence.
- Vercel reports zero deployments after the retained production baseline
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.

## Cortex conversation-context UI candidate

- The Cortex page now authorizes a requested canonical record server-side
  before passing it into the chat client. Raw URL focus never becomes trusted
  chat context.
- The agent visibly distinguishes `Focused on`, `Company-wide`, and
  `Record unavailable`. Unauthorized focus disables chat rather than silently
  falling back to company-wide analysis.
- New scoped conversations send the complete canonical pair. Existing scoped
  conversations continue sending the same pair and remain protected by the
  immutable API contract.
- Saved history displays each conversation's record scope. Only the exact
  current canonical pair can load in place; another scope is an explicit link
  to that Cortex context.
- Record focus uses record-specific suggestions. Mobile history, suggestion,
  header, and composer controls meet a 44px minimum target.
- Source tests cover context equality, route construction, human labels,
  focused/company/unavailable presentation, and the existing API contracts.
- Authenticated local production-browser QA passed at 1440, 768, and 390 with
  exact focused-record display, company-wide restoration, zero page overflow,
  zero console/page errors, and global one-time-session revocation.
- No schema, hosted row, Auth user, Storage object, queue, Railway setting, or
  Vercel deployment changed. This remains a source candidate while Vercel Git
  is disconnected.

## Cortex saved-conversation deep-link candidate

- Cortex accepts an optional UUID `conversationId` query alongside its
  authorized record focus.
- A direct saved-chat URL loads through the existing ownership-, tenant-,
  current-role-, record-context-, and citation-authorized detail API.
- Restored, history-selected, and newly created conversations synchronize the
  browser URL without navigation. `New chat` removes only `conversationId` and
  preserves canonical record focus.
- Restore uses a latest-request token. A slow earlier response cannot overwrite
  a newer selection or a user-triggered new chat; composer stays disabled while
  the active restore is unresolved.
- Cross-context history links now include both the destination record context
  and target conversation, reducing restore from two steps to one.
- Invalid query identifiers never reach the conversation API. A missing,
  foreign, revoked, or context-mismatched thread renders a bounded error and
  cannot replace current chat state.
- Authenticated local production QA covered real page/record authorization and
  a deterministic intercepted deep-link payload without hosted writes or AI
  calls. Restore, URL stability, new-chat cleanup, 1440/768/390 overflow,
  console/page errors, and global session revocation passed.
- No schema, hosted row, Auth identity, Storage object, queue, provider
  setting, Railway build, or Vercel deployment changed.

## Cortex recent-conversation search candidate

- Saved-conversation history now provides keyboard-first search over the
  existing bounded list of 30 authorized recent chats. It does not imply a
  tenant-wide or global history query.
- Matching is case- and diacritic-insensitive. Every whitespace-separated term
  must occur in the combined conversation title and human record-scope label.
  Source order remains newest-first.
- Search never indexes or renders tenant IDs, user IDs, internal graph-node
  IDs, or canonical record UUIDs. Company-wide and record-type labels remain
  searchable.
- The panel shows the honest recent-count boundary, provides a 44px mobile
  search and clear target, visible focus, bounded empty state, and no
  horizontal overflow.
- Authenticated local production QA verified title-plus-record filtering,
  clear/reset, saved-chat deep-link restore, 1440/768/390 layouts, zero
  console/page errors, and global session revocation.
- Root lint/typecheck/build pass; 377 tests pass; Next generates 77/77 static
  steps. No database, API, hosted row, AI call, Auth identity, Storage object,
  queue, Railway deployment, or Vercel deployment changed.
- Source commit `b15c24201326a51db021c4cfd6e57c14923c71e9` is on both
  repository refs under `kurtgav <kurtgavin.design@gmail.com>`. Railway
  correctly skipped deployment `4b8183fe-bbdb-471f-9e68-c08a0d7e401f`
  because no watched backend file changed. Vercel reports zero deployments
  after the retained READY baseline. GitHub Actions run `30453629029` started
  zero steps because of the account billing/spending block.

## Cost-controlled frontend release candidate

- The consolidated frontend candidate is
  `36e618274769ef49a18974dbe3bed8f0b4db7edd`, 33 commits after retained
  production source `f24e5603a35571f8dcadd43fc09c64d12646a7d0`.
- The Web delta is fully inventoried: 72 files, comprising 44 runtime files
  and 28 test/E2E files. No Web runtime file remains unclassified.
- Vercel Git is disconnected. On-demand concurrent builds are disabled and
  the next build uses Standard 4 vCPU/8 GB. Vercel documents Standard build
  compute as no added charge in this queued configuration.
- No Vercel deployment followed the source push. The retained READY production
  artifact remains `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Middleware now isolates anonymous IP buckets from authenticated user buckets.
  This prevents an authenticated burst from producing a later public 429 and
  prevents authenticated users behind one shared IP from consuming one bucket.
- Root lint, typecheck, test, and production build pass. There are 396 passing
  application tests; Next generates 77/77 static steps. A sequential
  authenticated Cortex plus public landing browser run passes 2/2.
- gitleaks, actionlint, diff checks, and prohibited external ERP brand/source
  scans pass. GitHub-hosted CI remains blocked before step start by the account
  billing/spending condition.
- The release and rollback manifest is
  `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`. Production activation still
  requires explicit user approval and exactly one manual production build.

## Permission-aware dashboard candidate

- `/dashboard` remains available to every authenticated role, but executive
  pipeline visibility now follows the existing `/pipeline/board` permission.
- Data-loader selection occurs before queries. `safety`, `cx`, and `viewer`
  roles cannot execute pipeline, GP, forecast, rep-scorecard, or executive
  alert reads from the dashboard.
- Restricted roles receive a calm Today surface with pending task counts
  constrained by authenticated tenant and authenticated assignee.
- Quick access is derived from the canonical navigation permission registry.
  It cannot advertise Finance, Pipeline, or other forbidden workspaces.
- Authenticated local production QA used an existing demo viewer with a
  one-time link. Desktop, tablet, and mobile passed with no forbidden content,
  overflow, console error, or page error. The session was revoked globally.
- No schema, hosted row, role, password, Storage object, queue, AI call,
  Railway deployment, or Vercel deployment changed.
- Source commit `36e618274769ef49a18974dbe3bed8f0b4db7edd` is on both
  repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
