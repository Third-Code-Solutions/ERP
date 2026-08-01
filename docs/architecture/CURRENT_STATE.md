# Current State

Verified from the repository and the configured Supabase target on 2026-07-30.
Application deployments are reported separately and are never inferred from a
successful build.

## Runtime topology

| Area | Verified implementation |
|---|---|
| Frontend | `apps/web`: Next.js 15.5.18 App Router, React 19.2.6, TypeScript 5.9.3 |
| Existing application backend | 47 Next.js Server Action files, 24 Route Handler files, SQL functions/triggers, and Supabase clients |
| New core ERP boundary | `apps/api`: NestJS 11 modular monolith. Project and procurement adapters are disabled by default; approved-BOM RFQ dispatch now has an inert BullMQ producer/consumer path |
| Database | PostgreSQL 17 through Supabase; Drizzle 0.40.1; 54 SQL migrations and 45 Drizzle schema files |
| Authentication | Supabase Auth. Tenant membership and role come from PostgreSQL, not client claims |
| Authorization | RLS plus mixed application checks in the legacy path. The Nest slice has deny-by-default capability metadata and tenant-scoped queries |
| Async work | Inngest remains authoritative. Redis 5/BullMQ 5 now carry one disabled approved-BOM RFQ job contract with bounded retry and explicit dead-letter handling |
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

The historical 54/54 baseline below is retained as the last fully reconciled
hosted baseline. The current source branch has seven additional forward-only
migrations through `20260801150000_document_processing_evidence.sql`; the
read-only release planner on 2026-08-01 reports 55/62 applied, with no
unexpected or out-of-order versions. The hosted release remains blocked until
the duplicate Purchase Order-number group and audit-recovery tenant are
resolved by the owner; no SQL has been applied for the seven-migration set.

- Migration ledger: 54 of 54 applied; no missing or unexpected versions.
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
- Migration `20260729152059_rfq_transaction_integrity.sql` makes one RFQ per
  tenant/BOM a database invariant and replaces the single-column BOM reference
  with a validated tenant-composite foreign key.
- Migration `20260729153620_close_rfq_browser_writes.sql` removes direct
  browser mutation authority from RFQs and RFQ quotes. Authenticated users keep
  tenant-scoped reads; official writes require server authority.
- Migration `20260729162944_rfq_quote_workflow_integrity.sql` adds durable
  quote submission idempotency, stable BOM-line identity, four validated
  tenant-composite quote references, and a database-enforced RFQ state graph.
  Hosted verification found zero RFQs, zero quotes, and no affected business
  rows.
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
- NestJS: Project and RFQ command authorization, atomic transaction authority,
  and one approved-BOM BullMQ worker. All production cutover gates remain
  disabled.

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
  `733f1197-344a-41d9-ad95-af4fda876242`, built remotely from docs head
  `cc5733fa98136c500aa2602b9232a6f9ae34df78`, which contains RFQ source
  `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59`. Health and readiness remain
  HTTP 200 with PostgreSQL and Redis `ok`.
- Vercel project `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb` is disconnected from
  Git. The canonical alias still serves READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`. Vercel recorded zero deployments after
  source commits through `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59`.
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
| Implemented | Broad construction ERP UI, Supabase schema/RLS, server actions, route handlers, audit infrastructure, Inngest jobs, incremental Nest transaction adapters, and one disabled BullMQ RFQ job |
| Incomplete | Remaining Nest migration, notification/outbox parity for RFQ BullMQ cutover, uniform capability checks, uniform transactional audit, Python write removal, production-write activation evidence, clean hosted CI, and provider-level rollback |
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
- Fresh workspace tests pass with 453 passing tests; 137 database
  cases are skipped unless a disposable database URL and capability flags are
  explicitly injected.
- The dedicated fail-closed database lane rebuilds from all 54 migrations and
  seed data, then executes all 236 database tests with zero skips.
- A disposable-database Nest integration test now covers 401, 403, cross-tenant
  404, stale 409, successful update, trigger audit actor, and final rollback.
  It passes locally against the isolated PostgreSQL/Redis lane and remains
  wired into the exact clean-container CI job.
- Fresh replay exposed and fixed three database-function defects: a missing
  trigger return, PL/pgSQL record/table-alias resolution, and workflow guard
  ordering for bank reversal and Project Budget revision approval.
- The migration/catalog verifier passes with the optional platform
  `rls_auto_enable()` helper both absent and present-but-locked.
- Supabase project `aqqrtkmtcsfkbyyqxowv` is current at 54/54 migrations.
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
- GitHub runner registration and runner-process counts are zero. Transient
  runner work directories and credential-free remnants were removed after
  the verified run.
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
  `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59`, 43 commits after retained
  production source `f24e5603a35571f8dcadd43fc09c64d12646a7d0`.
- The Web delta is fully inventoried: 94 files, comprising 58 runtime files
  and 36 test/E2E files. No Web runtime file remains unclassified.
- Vercel Git is disconnected. On-demand concurrent builds are disabled and
  the next approved build would use Standard 4 vCPU/8 GB. No zero-cost claim
  is assumed; live billing and the accepted spend cap must be reconfirmed.
- No Vercel deployment followed the source push. The retained READY production
  artifact remains `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Middleware now isolates anonymous IP buckets from authenticated user buckets.
  This prevents an authenticated burst from producing a later public 429 and
  prevents authenticated users behind one shared IP from consuming one bucket.
- Root lint, typecheck, test, and production build pass. There are 453 passing
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

## Permission-safe universal search candidate

- Query text is trimmed and capped at 100 characters before any database
  fan-out. PostgreSQL `ILIKE` control characters (`\`, `%`, and `_`) are
  escaped so browser input remains literal text.
- Record-type queries are built only after canonical role authorization.
  Restricted viewers can search tenant documents and their own assigned tasks;
  they cannot infer Finance, Pipeline, procurement, or other forbidden data.
- Every base record remains tenant-scoped. Opportunity-account and BOM-project
  joins now repeat the authenticated tenant predicate on the joined table,
  matching the defense-in-depth already used by later joins.
- Every response, including 401 and short-query responses, is explicitly
  `private, no-store` and varies on the session cookie.
- Unit coverage proves normalization, literal pattern construction, response
  caching, and the existing role matrix.
- Authenticated local browser QA found a real tenant document, returned only
  viewer-authorized result types, proved a literal `%`, `_`, and backslash
  probe, opened the result in the command palette, and repeated the dashboard
  at 1440, 768, and 390 without overflow or console/page errors. The one-time
  session was revoked globally.
- Source commit `8dc051e70d56cf3f0cde9c2f409c4f97928d337d` is on both
  repository refs. Railway skipped deployment
  `37ee8021-9037-4f4c-b0d9-cf9219699c25`; Vercel created no deployment.
- No schema, hosted row, Auth identity, Storage object, queue, AI call, active
  Railway build, or Vercel build changed.

## Private Search-to-Cortex handoff candidate

- The global command palette now has explicit `Search records` and
  `Ask Cortex` modes. Search remains the default.
- Ask mode never calls `/api/search`; questions cannot enter search-query URLs
  or search logs.
- Opening Cortex generates an opaque UUID and stores the normalized,
  100-character-bounded question in same-tab `sessionStorage` for at most five
  minutes. Prompt text is absent from the URL.
- The Cortex page accepts a handoff only on the company-wide route. It consumes
  and deletes the draft once, replaces the URL with `/cortex`, prefills and
  focuses the composer, and does not send an AI request.
- Authenticated viewer QA preserved normal document search and proved the Ask
  handoff at 1440, 768, and 390 with zero search leakage, zero Cortex chat
  requests, exact composer text, removed browser storage, no overflow, and no
  console/page errors. The one-time session was globally revoked.
- Root lint, typecheck, 408 application tests, Nest/Next production builds,
  77/77 static-generation steps, gitleaks, actionlint, diff checks, and the
  prohibited external ERP source/brand scan pass.
- Source commit `8058c8a5db18828656fc182939dce7aa06c698af` is on both
  repository refs under `kurtgav <kurtgavin.design@gmail.com>`. Railway skipped
  deployment `e2c6d6a8-82cb-4f19-996f-b67518b9d949` because no watched backend
  file changed. Vercel created zero deployments after the retained READY
  baseline.
- No schema, hosted row, Auth identity, Storage object, queue, AI call, active
  Railway build, or Vercel build changed.

## Atomic public canvas-signing candidate

- Public canvas signing previously inserted the signature document, updated
  the session and source independently, then attempted a separate audit with a
  fabricated zero-UUID actor and ignored foreign-key failure.
- The action now bounds and validates the PNG before mutation, derives tenant
  and entity identity only from the hashed one-time session, resolves a
  same-tenant source, and uploads under a collision-resistant key.
- One database transaction locks and rechecks the exact session, inserts the
  document, updates the tenant-scoped source, marks the session signed, and
  writes the entity audit with the correct nullable external actor.
- Concurrent replay fails after the row lock before document or audit creation.
  Audit or database failure rolls back official state and compensates Storage
  by removing the uploaded object.
- Five focused tests prove payload bounds, the shared transaction,
  tenant-scoped source/session writes, nullable actor, audit-failure cleanup,
  concurrent replay denial, and missing-source denial.
- Connected local browser QA rendered the unauthenticated invalid-token state
  with `Link not found`, zero console warnings/errors, and no mutation.
- Root lint, typecheck, 413 application tests, Nest/Next production builds,
  77/77 static-generation steps, gitleaks, actionlint, diff checks, and the
  prohibited external ERP source/brand scan pass.
- Source commit `e99b88fd232957ec8a224968ecb63441a2eab9d9` is on both
  repository refs under `kurtgav <kurtgavin.design@gmail.com>`. Railway skipped
  deployment `ebe99b8c-886e-478e-b3bc-30620fbf11cf` because no watched backend
  file changed. Vercel created zero deployments after the retained READY
  baseline.
- No schema, hosted row, Auth identity, durable business row, Storage object,
  queue job, AI call, Railway build, or Vercel build changed during validation.

## Atomic RFQ auto-dispatch integrity

- The BOM approval producer and RFQ consumer now share the current
  `bom/approved` event; the historical event name remains accepted during
  migration.
- Browser-facing RFQ creation derives tenant, actor, and capability from the
  authenticated profile. Caller-supplied system tenant authority is removed.
- A server-only service locks the tenant-scoped BOM, checks retry state, reads
  tenant-scoped lines and rate cards, inserts the RFQ, and writes its audit in
  one database transaction.
- The initiating actor is revalidated against the tenant. Missing or stale
  background actors become nullable audit actors; fabricated zero UUIDs are
  forbidden.
- `(tenant_id, bom_id)` is unique and also forms the validated tenant-composite
  BOM reference. Queue retries return the existing RFQ without another audit
  or notification.
- Notifications run after commit in a separate retryable queue step.
- Direct `anon` and `authenticated` insert, update, and delete privileges were
  removed from `rfqs` and `rfq_quotes`; authenticated tenant-scoped reads
  remain.
- Hosted Supabase is current at 54/54 migrations with zero RFQs, zero quotes,
  and zero duplicate tenant/BOM pairs. No business rows changed.
- Root lint, typecheck, 453 tests, Nest/Next production builds, 77/77 static
  steps, the 236/236 PostgreSQL 17/Redis lane, secret/workflow scans, diff
  checks, and prohibited external ERP source/brand scans pass.
- Source commit `f173957559a93eb724daf9eeed3fbbb1c4576baf` is on both
  repository refs under `kurtgav <kurtgavin.design@gmail.com>`. Railway
  deployment `94c78bd2-327a-4f6a-a49e-1d77195d850d` is successful and live
  readiness reports database and Redis `ok`.
- Vercel Git remains disconnected and Vercel created zero deployments after
  the retained READY production artifact. The RFQ Web source remains pending
  the single explicitly approved consolidated frontend build.

## Atomic RFQ quote and terminal workflow

- Quote logging, completion, and cancellation now use one server-only,
  tenant-scoped transaction service. Each command locks the RFQ before
  validation and commits official state plus actor-attributed audit together.
- Quote submissions carry a browser-generated UUID that is reused across
  transport retries. `(tenant_id, submission_id)` is unique; exact replay
  returns the prior quote and conflicting key reuse fails closed.
- New RFQs persist the canonical BOM line ID and retain the material ID for
  uncontracted catalog items. Quote coverage resolves the line ID first, with
  bounded legacy material/code fallback for existing JSON.
- Vendor, material, RFQ, and BOM-line references are tenant-composite database
  constraints. Vendor/material deletion is restrictive instead of erasing
  official quote evidence.
- The allowed database state graph is `pending -> quotes_received|cancelled`
  and `quotes_received -> completed|cancelled`. Terminal states cannot reopen.
- Completion rechecks full quote coverage under the RFQ lock. Completion
  notification is post-commit; its failure cannot misreport a rolled-back ERP
  transaction.
- Source commit `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59` contains the
  reviewed implementation. Local lint/typecheck, 453 application tests,
  Nest/Next production build, 77/77 static generation, 54-migration replay,
  236/236 zero-skip database tests, and 1/1 Nest database integration pass.
- Supabase project `aqqrtkmtcsfkbyyqxowv` is healthy and current at 54/54,
  headed by `20260729162944`. Four quote constraints are validated, the state
  trigger is enabled, and authenticated insert/update/delete privileges on
  RFQ quotes remain false.
- Vercel Git remains disconnected. No deployment exists after retained
  production `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`; visible UI activation remains
  pending one explicitly approved consolidated production build.
- Both GitHub refs resolve to
  `cc5733fa98136c500aa2602b9232a6f9ae34df78`. GitHub Actions run
  `30471712383` executed zero steps because the account payment/spending-limit
  block prevented Actionlint from starting; dependent jobs were skipped.
- Railway deployment `733f1197-344a-41d9-ad95-af4fda876242` is SUCCESS for
  that docs head and serves the RFQ source commit. Live `/health` returns
  `status=ok`; `/ready` returns `database=ok` and `redis=ok`.

## 2026-07-30 RFQ quote NestJS adapter

- NestJS now exposes original endpoint
  `POST /v1/procurement/rfqs/:rfqId/quotes` with strict shared contracts,
  Supabase JWT identity, `rfq.dispatch`, tenant predicates, row/advisory locks,
  exact retry semantics, explicit terminal-state rejection, and atomic
  semantic audit evidence.
- Next.js keeps the existing writer by default. The Nest path requires exact
  flag `ERP_RFQ_QUOTE_WRITES_VIA_API=true` and an explicit UUID tenant
  allowlist; enabled failures are fail-closed with no legacy fallback.
- Complete/cancel commands remain in the existing Next.js transaction service.
- No database migration or provider environment change was required.

## 2026-07-30 RFQ terminal NestJS adapter

- NestJS now exposes the original terminal command boundary
  `POST /v1/procurement/rfqs/:rfqId/transitions` for complete and cancel.
- Strict shared contracts reject unknown authority fields, trim and bound
  cancellation reasons, and require a durable tenant-scoped success result.
- The authenticated principal supplies tenant and actor. The controller
  requires `rfq.dispatch`; the service locks the tenant RFQ, enforces its
  explicit state machine, rechecks full quote coverage for completion, uses a
  guarded status update, and commits semantic audit evidence in the same
  transaction.
- Next.js preserves the current Server Action response and notification
  behavior. Routing remains on the compatibility service unless
  `ERP_RFQ_TERMINAL_WRITES_VIA_API` is exactly `true` and the authenticated
  tenant matches a separate strict UUID allowlist. An enabled API failure
  never falls back to a second writer.
- The adapter is source-complete but disabled in every provider environment.
  No UI, schema, migration, data, Python, Storage, queue, or provider setting
  changed.
- Full validation passes: lint, typecheck, 397 application tests, production
  build with 77/77 generated pages, Actionlint, pinned-action verification,
  both release planners, Gitleaks, and product-path ERPNext/Frappe scan.
- The disposable PostgreSQL 17 and Redis 7.4.9 lane passes all 54 migrations,
  236/236 database tests with zero skips, and 2/2 Nest database integration
  tests including real tenant denial, quote completion, repeated-transition
  conflict, cancellation reason audit, and transaction rollback cleanup.

## 2026-07-30 RFQ adapter provider verification

- Railway deployment `f51c7aba-d5d9-4ccd-9cbe-46fa508117af` is SUCCESS and
  RUNNING for exact Git commit
  `cdb246a9a1aa7b61b3e816dc397a86d8e0c2c86f`, authored by `kurtgav`.
- Live `/health` returns `status=ok`; `/ready` returns `status=ready` with
  database and Redis both `ok`. Anonymous RFQ quote submission returns 401.
- Railway error-log query for that deployment returned no entries.
- Vercel reported zero deployments after retained baseline timestamp
  `1785295180454`; Git integration remains disconnected.
- Hosted read-only canary discovery found zero eligible tenants. The QA tenant
  has one Project but no application/Auth user. The demo tenant has active
  users and Projects but its historical audit chain still has 2 link and 151
  hash mismatches.
- GitHub Actions run `30475864702` failed before any step; Actionlint contains
  zero steps and every dependent job was skipped. Local and disposable-lane
  evidence remains authoritative until account billing is repaired.

## 2026-07-30 public-origin portability

- Public metadata, structured-data identifiers, `robots.txt`, and
  `sitemap.xml` now resolve from one validated public origin.
- Resolution order is `NEXT_PUBLIC_SITE_URL`, server-only `SITE_URL`, Vercel's
  production hostname, then the retained Third Code Vercel origin for
  compatibility.
- Configured origins must be absolute HTTP(S) origins without credentials,
  paths, queries, or fragments. Invalid configuration fails the build instead
  of publishing mixed or unsafe URLs.
- Sitemap output no longer fabricates a fresh `lastModified` value on every
  build.
- No visible landing layout, copy, motion, database, provider setting, or live
  deployment changed.
- Root lint/typecheck, 378 application tests, production build with 77/77
  generated pages, one desktop/tablet/mobile browser release test, gitleaks,
  actionlint, and workflow action-reference validation pass. Local database
  tests remain 99 passed and 137 skipped because this source-only milestone
  did not inject production database credentials.

## 2026-07-30 portable standalone Web runtime

- `apps/web` can now emit Next.js standalone output when
  `NEXT_OUTPUT_MODE=standalone`. Normal local and Vercel-compatible builds keep
  the existing output mode.
- `apps/web/Dockerfile` defines a Node 22 Alpine, non-root, health-checked
  runtime. Public URL and Supabase browser values are build inputs; secrets
  remain runtime-only.
- Web health and readiness expose one provider-neutral revision resolver:
  `APP_REVISION`, Railway SHA, Vercel SHA, then `local`.
- The free self-hosted workflow now runs an isolated standalone production
  smoke. On Windows it uses a hoisted dependency tree to avoid the host's
  unprivileged pnpm-symlink tracing failure.
- Standalone source build and runtime proof pass: 77/77 generated pages,
  process health, SSR landing, nonce CSP, robots, sitemap, and manifest.
- First transient self-hosted run `30484376284` passed checkout, locked install,
  workflow validation, lint, typecheck, unit tests, the clean PostgreSQL
  17/Redis lane, and the production build. Its standalone step built 77/77
  pages, then failed only while removing a deep Windows runner path.
- The standalone smoke now isolates work at the repository drive root and
  retries verified cleanup. Local rerun passes every runtime assertion, removes
  its worktree, and leaves no process listening on port 3090.
- Root lint/typecheck, 381 application tests, default production build,
  77/77 generated pages, the 1440/768/390 frontend release browser test,
  gitleaks, actionlint, workflow action-reference validation, and both release
  planner suites pass. Local database tests remain 99 passed and 137 skipped
  because no disposable database credential was injected for this source-only
  slice.
- Docker Desktop cannot start on this workstation because WSL2 virtualization
  is disabled. The Docker image itself is therefore not locally built; the
  standalone Node artifact and runtime are verified independently.
- No frontend hostname, Supabase redirect setting, traffic, database, Railway
  service, Vercel setting, or Vercel deployment changed.
# 2026-07-30 manual BOM-to-RFQ NestJS adapter

- NestJS now exposes authenticated `POST /v1/procurement/rfqs` for manual
  BOM-to-RFQ creation.
- Request accepts only `bomId`. Tenant, actor, role, and source come from the
  verified principal and capability guard.
- Transaction locks the tenant-scoped BOM, returns exact tenant/BOM replay,
  filters contracted-rate lines, inserts one pending RFQ, and writes one
  actor-attributed semantic audit before commit.
- Next.js preserves the existing `createRfqFromBom(bomId)` Server Action
  contract through independent fail-closed gates:
  `ERP_RFQ_CREATE_WRITES_VIA_API` and
  `ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS`.
- Both creation gates remain unset. Manual production writes therefore remain
  on the existing server-only compatibility service until a controlled tenant
  cutover is approved.
- Automatic BOM-approval dispatch remains on the existing server-only Inngest
  path. Moving that background authority to NestJS/BullMQ is the next backend
  migration slice.
- No UI, database schema, hosted data, Python, queue, Storage, or Vercel
  deployment changed in this source milestone.
- Validation passes: root lint and typecheck; 412 application tests; ordinary
  database lane 99 pass with 137 expected skips; Nest and Next production
  builds with 77/77 Next static steps; disposable PostgreSQL 17/Redis 7.4.9
  replay of 54/54 migrations; 236/236 zero-skip database assertions; and 2/2
  Nest database integration tests.
- Source commit `b8d1e518e63d0fcf9802efe30b2f1569ad6c6de4` is live on Railway
  as deployment `5ebaca8a-e1cb-4d25-afb3-a98930046ebc`; health, database, and
  Redis readiness pass, and the protected create endpoint rejects anonymous
  access.
- Free self-hosted GitHub Actions run `30495135107` passed the exact source
  SHA. The hosted run executed zero steps because of the account billing
  restriction.
- Vercel Git is disconnected and no frontend deployment was created. Frontend
  release remains a single explicitly approved, consolidated deployment.

## 2026-07-30 approved-BOM RFQ BullMQ dispatch

- NestJS now exposes protected
  `POST /v1/procurement/rfqs/dispatch`. The request accepts only `bomId`;
  tenant, actor, source, retry policy, queue, and deterministic job ID are
  server-derived.
- Queue `procurement-rfq-dispatch` runs
  `create-from-approved-bom` with five bounded attempts, exponential backoff,
  retained failures, and one deterministic dead-letter record after the final
  failure.
- The worker parses the job again, reloads the actor by tenant, rechecks the
  current `rfq.dispatch` capability, locks the approved tenant BOM, and reuses
  the existing atomic RFQ transaction. Replay returns the existing RFQ without
  a second semantic audit.
- Next.js selects this producer only when exact
  `ERP_RFQ_AUTO_DISPATCH_VIA_API=true` and a strict tenant allowlist match.
  Disabled or unmatched tenants keep the current Inngest producer. After Nest
  selection, failure never falls back to Inngest.
- Both automatic-dispatch variables remain unset. Inngest remains production
  authority because its notification side effect has not yet moved to an
  idempotent NestJS outbox/delivery path.
- No React/UI, schema, migration, hosted data, Python, Storage, provider
  environment, or Vercel deployment changed.
- Validation passes: 60/60 focused tests; root lint, typecheck, 430 application
  tests, and production build with 77/77 generated pages; Actionlint, pinned
  action references, both release planners, Gitleaks, and zero prohibited
  external-ERP runtime matches.
- The disposable PostgreSQL 17/Redis 7.4.9 lane passes all 54 migrations,
  236/236 database assertions with zero skips, and 5/5 Nest integration tests.
  It proves duplicate suppression, bounded retry, one dead letter, Redis
  restart/reconnect, tenant and role denial, approved-state enforcement, one
  RFQ, one semantic audit, rollback cleanup, and stable schema fingerprint
  `36B8999F16B825D89D8F782CBF28180D074AD677A9E8B2C16B713C79BB931BB6`.
- Source commit `dffb6052dde794a80abd8bbb24acc59adcd6fd10` is published on
  both GitHub refs under `kurtgav` and is live on Railway as successful
  deployment `5e717900-d78a-4472-846f-df5784167354`, image
  `sha256:13a83447269e7588cf4141ca02491122e0a5101b24678d1657e69034d4717864`.
- Live `/health` and `/ready` return 200; readiness reports PostgreSQL and Redis
  `ok`. Anonymous dispatch returns 401, and the deployment error-log query is
  empty.
- Railway has zero `ERP_RFQ_AUTO_DISPATCH*` variables. Vercel reports zero
  deployments after retained baseline timestamp `1785295180454`; Git remains
  disconnected.
- Hosted GitHub Actions run `30498025937` executed zero steps because its first
  hosted job could not start; dependent jobs were skipped. No self-hosted
  runner remains registered. Local and disposable evidence is authoritative
  for this release.

## 2026-07-30 RFQ notification outbox and BullMQ delivery

- Automatic NestJS RFQ creation now commits one immutable
  `notification_outbox` intent and same-tenant procurement-recipient delivery
  snapshots in the same PostgreSQL transaction as the RFQ and semantic audit.
- Exact replay returns the existing outbox. Database uniqueness prevents a
  second intent, recipient/channel delivery, or in-app notification.
- BullMQ carries only tenant, outbox, and delivery UUIDs. PostgreSQL remains
  the delivery authority with explicit `pending`, `processing`, `delivered`,
  and `dead_letter` states, a five-attempt database ceiling, and stale-claim
  recovery.
- In-app delivery revalidates the current procurement role and commits its
  notification and delivered state together. Email delivery rebuilds content
  from PostgreSQL and uses a stable Resend idempotency key.
- Browser roles have no access to outbox/delivery tables and can no longer
  directly insert, update, or delete notifications. Existing authorized
  notification reads remain unchanged.
- Recovery polling is opt-in through exact
  `ERP_NOTIFICATION_SWEEP_ENABLED=true`; its default is false. The disabled
  production path therefore creates no scheduled Redis or email-provider
  work.
- Hosted Supabase project `aqqrtkmtcsfkbyyqxowv` is healthy on PostgreSQL 17.
  Migration `20260729233017_notification_outbox_foundation.sql` is applied;
  ledger is 55/55, both new tables have zero rows, all three composite
  constraints are validated, and browser privileges are closed.
- Supabase advisors add only expected informational findings for the two
  intentionally policy-free/server-only empty tables and their unused new
  indexes. Existing unrelated warnings remain tracked.
- Production automatic dispatch, tenant allowlist, and notification recovery
  flags remain disabled. Existing Inngest behavior remains authoritative.
- Source commit `a93da5f5025677444ca14407c98a189673c952dc` is published on
  both GitHub refs under `kurtgav` and is live on Railway as successful
  deployment `50fad0aa-8506-457a-a405-152dc31d2340`, image
  `sha256:50d598e279aa8d6b3681a0f2a230ed46d682bdc80e0802ff9bd81023dbd11a55`.
- Live `/health` and `/ready` return 200; readiness reports PostgreSQL and
  Redis `ok`. Anonymous dispatch returns 401. Deployment error logs and recent
  HTTP 5xx logs are empty.
- GitHub Actions run `30499929834` executed zero steps because the hosted
  Actionlint job could not start; all dependent jobs were skipped. Local and
  disposable evidence remains authoritative.
- No React/UI, Python, Storage, or Vercel deployment changed. Vercel Git
  remains disconnected; Vercel reports zero deployments after retained
  baseline timestamp `1785295180454`.

## 2026-07-30 controlled production release

- Hosted Supabase project `aqqrtkmtcsfkbyyqxowv` remains the PostgreSQL source
  of truth on PostgreSQL 17.6. Its migration ledger exactly matches the
  repository at 55/55 through
  `20260729233017_notification_outbox_foundation.sql`; no SQL was pending or
  applied during this release. The notification outbox remains empty.
- Vercel production deployment
  `dpl_Htv5nb1A8oHbtowQpmrToYQgxDDL` is `READY` on exact source
  `31c04942a93dce78f165880fb02bdf38d25eb506`, created by `kurtgav`, and owns
  `https://thirdcode-erp.vercel.app`.
- Vercel required one protected preview build
  (`dpl_92JBFVyZjGozKPg2vcu5Hv4wNx9c`) and one production-environment rebuild.
  No retries or additional deployments were created.
- Live web `/`, `/api/health`, `/api/ready`, `robots.txt`, `sitemap.xml`, and
  `manifest.webmanifest` return 200. Health and readiness report revision
  `31c04942a93d`; readiness reports the database `up`. The authenticated
  dashboard renders without the previous Server Components exception.
- Vercel reports no runtime-error cluster and no HTTP 5xx for the production
  deployment. The previous production deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` is the rollback reference.
- Vercel Git was disconnected after promotion. Future GitHub pushes cannot
  trigger automatic Vercel builds.
- Railway remains online without an unnecessary rebuild. Deployment
  `50fad0aa-8506-457a-a405-152dc31d2340` is `SUCCESS` on application source
  `a93da5f5025677444ca14407c98a189673c952dc`; the repository delta to
  `31c04942a93dce78f165880fb02bdf38d25eb506` is documentation-only.
- Railway `/health` and `/ready` return 200; readiness reports PostgreSQL and
  Redis `ok`. Anonymous RFQ dispatch returns 401, and the last-hour HTTP 5xx
  query is empty.

## 2026-08-01 purchase-order authority audit and bounded adapter

- Purchase-order reads and writes remain in Next.js Server Actions. The main
  write surface is `apps/web/src/app/(dashboard)/procurement/actions.ts`:
  standalone/BOM/grouped creation, cost-code edits, state transitions,
  approvals, issuance, and receiving.
- Existing actions derive tenant and actor from the authenticated server
  profile, but prior creation, legacy transition, and receiving entry points
  did not consistently enforce capability checks. This milestone closes those
  gaps with `po.create` and new `po.receive` checks. Project and vendor IDs are
  now verified against the caller tenant before PO creation.
- PO money is stored as PostgreSQL integer centavos (`bigint` mapped to
  numbers). Standalone line input now rejects non-integer quantities/prices;
  the existing BOM path still needs a transaction-authority rewrite.
- NestJS now exposes original contract boundary
  `POST /v1/procurement/purchase-orders`, guarded by `po.create`, strict Zod
  command validation, and required `Idempotency-Key` header. Service is
  deliberately fail-closed and performs no database mutation until durable
  idempotency and full transaction parity exist.
- `ERP_PO_CREATE_WRITES_ENABLED` defaults to `false`; even `true` cannot enable
  provisional service. No browser action calls this endpoint yet. No SQL,
  Supabase, Vercel, Railway, Python, Storage, or UI design change occurred.
- Focused and full gates pass: 453 application tests (91 shared, 70 API,
  292 web), plus 103 database tests with 137 environment-gated skips; root
  lint, root typecheck, `git diff --check`, and production build (Nest compile
  plus 77/77 Next pages). Disposable database/Redis release lane was not
  rerun because this slice changes no schema or migration.
- Remaining authority risks: BOM/grouped PO creation and legacy PO-number
  allocation are not one transaction, receiving and state updates are not yet
  atomic with semantic audit, and direct Server Action writes remain
  authoritative until a tenant-scoped cutover. Standalone create has a
  disabled candidate transaction seam documented below.

## 2026-08-01 standalone purchase-order transaction seam

- Candidate migration 20260801090000 adds tenant-scoped purchase-order
  idempotency requests, a processing/succeeded state check, composite
  tenant-to-purchase-order and tenant-to-user foreign keys, RLS, service-only
  grants, and a tenant-composite unique PO-number index. It deliberately
  preflights duplicate existing numbers and fails closed. Repository head now
  contains 56 migrations; hosted Supabase remains at 55/55 and was not changed.
- The Nest service now performs the official standalone create inside one
  PostgreSQL transaction: rechecks tenant membership and po.create capability,
  locks and replays an idempotency request, rejects a conflicting request hash,
  validates same-tenant project/vendor/cost-code references, takes a tenant
  advisory number lock, calculates integer centavos with bounded bigint
  arithmetic, inserts the PO and lines, writes semantic audit, and commits the
  replay result atomically.
- API writes require the exact ERP_PO_CREATE_WRITES_ENABLED flag plus an explicit
  UUID tenant allowlist. The Next client requires its own exact flag and
  allowlist, supplies a stable idempotency key, and fails closed on API errors;
  the legacy Server Action path remains the default until a canary is approved.
- Static schema, database, API, shared-contract, and focused web tests pass;
  the full web suite is 295 passed. Root lint, typecheck, test, and production
  build also pass.
- Read-only release planning against Supabase confirms PostgreSQL 17,
  55 applied migrations through 20260729233017, and one linear missing suffix:
  20260801090000. The planner flags its defensive drop-constraint statements
  for explicit review; no SQL was executed.
  Disposable PostgreSQL 17/Redis integration was initially blocked because
  Docker is unavailable on this workstation. A later owned Alpine WSL1 lane
  completed the proof without hosted SQL or provider mutation.

## 2026-08-01 live landing regression audit

- The accepted public Third Code ERP landing surface remains the existing
  Next.js implementation in `apps/web/src/components/marketing`: three-line
  hero, dense 12-column bento, progressive-disclosure accordion, workflow
  stack, testimonial carousel, FAQ, CTA, and structured metadata.
- Live browser evidence at `https://thirdcode-erp.vercel.app/` confirms no
  horizontal overflow at 1440px or 390px, three hero lines at both widths,
  accessible accordion/carousel/FAQ state changes, and zero console errors.
- Source regression coverage now protects the visual contract in
  `third-code-landing.test.ts`; the full web suite is 298 passed. This is a
  source-only evidence milestone: no Vercel deployment, Railway release, or
  hosted Supabase mutation was performed.

## 2026-08-01 disposable database and queue proof

- `scripts/ci/run-wsl1-database-lane.ps1 -Distribution ThirdCodeERP-Test`
  rebuilt the disposable PostgreSQL 17 database from zero, applied all 56
  repository migrations, seeded it, and verified an exact migration ledger and
  schema hash `427DEBE7531E969D9142C618180FB896FFE12C55C654655256DF1BA7647F2384`.
- Database suite executed 243/243 tests with zero environment skips. Nest
  integration executed 7/7 tests covering tenant/auth boundaries, idempotency,
  rollback, audit, and BullMQ Redis restart/data-loss recovery.
- Redis 7.4.9 was built and run in the disposable WSL1 distro. WSL reported
  only the known memory-overcommit warning; no hosted SQL, Vercel deployment,
  or Railway deployment occurred.

## 2026-08-01 PO approval workflow authority slice

- Added candidate migration `20260801100000_purchase_order_workflow_idempotency.sql`;
  repository head is now 57 migrations. It creates a tenant-scoped,
  service-only request ledger for `submit_pm_approval`, `pm_approve`,
  `commercial_approve`, and `reject`.
- NestJS now exposes the disabled route
  `POST /v1/procurement/purchase-orders/:purchaseOrderId/workflow`. The service
  rechecks tenant membership and action capability, locks the PO and request,
  enforces the explicit state machine, stamps approvers, writes semantic audit,
  and replays the original result atomically. SCM issuance, supplier email,
  receiving, and browser delegation remain outside this slice.
- `ERP_PO_WORKFLOW_WRITES_ENABLED` and
  `ERP_PO_WORKFLOW_WRITES_TENANT_IDS` default false/empty. Existing Next Server
  Actions remain authoritative; no tenant is selected for cutover.
- Disposable WSL1 proof reran all 57 migrations: database tests 243/243 with
  zero skips and Nest/Redis integration 8/8, including real workflow commit,
  replay, state/capability, audit, rollback, and tenant isolation assertions.
- Hosted Supabase was not changed. Vercel and Railway were not deployed;
  provider sessions still require the correct `kurtgav` identity.
- Fresh read-only hosted reconciliation reports PostgreSQL 17, 55 applied
  migrations through `20260729233017`, repository 57/57, and exactly two
  linear missing candidates (`20260801090000`, `20260801100000`). No SQL was
  executed; both candidates require explicit defensive-constraint review.
- The Next server-only core client now has a strict, separately gated PO
  workflow request seam and validates the Nest result. No current Server Action
  delegates to it because notification parity and canary evidence are not yet
  complete.

## 2026-08-01 PO workflow notification parity slice

- Added candidate migration `20260801110000_purchase_order_workflow_notifications.sql`.
  It constrains the tenant-scoped notification outbox payload for the four
  approval transitions; hosted Supabase remains unchanged.
- Nest workflow commits now require a separate exact notification flag and
  tenant allowlist. Each committed transition inserts one outbox intent and
  role-routed in-app/email delivery rows in the same PostgreSQL transaction;
  retries replay without duplicating either state or notification intent.
- BullMQ delivery now validates the payload, tenant aggregate, current role,
  channel, and idempotent delivery state for Purchase Orders. In-app notices
  link to the existing Purchase Order route; email uses the existing Resend
  boundary. No UI or Server Action cutover occurred.
- Local proof: 58/58 migrations, database 244/244 with zero skips, Nest/Redis
  integration 8/8, full tests shared 94/API 79/web 300/database 107 plus the
  normal 137 environment-gated database skips, root typecheck/lint, and 77/77
  Next production pages all pass. Hosted planner is 55/58 read-only; no SQL
  or provider deployment was performed.

## 2026-08-01 read-only project canary audit

- The existing demo tenant/project/actor target was inspected in a repeatable
  read-only transaction on PostgreSQL 17. Auth identity, project audit trigger,
  hardened audit function, and non-public audit function permissions are all
  present.
- Canary status is blocked: the tenant audit chain has 2 predecessor-link
  mismatches and 151 hash mismatches; the selected actor also lacks the
  `project.update` capability.
- No business data, audit rows, permissions, flags, hosted migration, or
  provider deployment was changed. These findings require a separate audit
  recovery review before any canary or write authority decision.

## 2026-08-01 audit hash parity hardening

- The read-only forensic query confirmed that the database trigger hashes
  `prev_hash + entity_type + entity_id + action + PostgreSQL timestamptz text`,
  while the API and Next server writers had been using a JSON payload hash.
- Added one shared database-compatible hash helper and switched both server
  writers plus chain verification to it. This affects only future audit rows;
  existing hosted rows were not rewritten.
- Focused hash tests (17/17), serial full tests (shared 95, database 107 with
  137 normal skips, web 300, API 79), disposable PostgreSQL/Redis (58/58
  migrations, 244/244 DB assertions, 8/8 integration), typecheck, lint, and
  build (77/77 pages) passed. Hosted data and provider state remain unchanged.

## 2026-08-01 read-only audit recovery planner

- Added `scripts/plan-audit-recovery.mjs` with opaque tenant references,
  repeatable-read/read-only transactions, system-label/day mismatch buckets,
  control checks, and a `--require-clear` release gate. It never prints entity
  IDs or business values and never writes `audit_log`.
- Hosted execution reproduced PostgreSQL 17/UTC, 661 audit rows, 2 link
  mismatches, and 151 hash mismatches. The report is `review_required`; no
  repair, permission change, migration, or deployment was attempted.

## 2026-08-01 audit hash profile verification

- `scripts/verify-audit-hash-profiles.mjs` compares historical rows only with
  the current PostgreSQL trigger formula and the legacy JSON writer formula.
- Hosted read-only result: 510 rows match the database profile, 40 match the
  legacy JSON profile, 111 match neither reviewed profile, and 2 chain links
  are broken. `--require-current` remains non-zero; this is evidence for
  recovery review, not permission to rewrite immutable history.

## 2026-08-01 controlled release gate

- Branch `agent-02/third-code-erp-landing` is pushed under the requested
  `kurtgav` GitHub identity at commit `ca9ff6d`. One Vercel preview for that
  SHA reached `Ready`; Preview Protection redirected anonymous health checks,
  so preview runtime health was not overstated. Vercel production remains on
  revision `31c04942a93d`.
- Railway production remains on the active RFQ-notification deployment
  `50fad0aa-8506-457a-a405-152dc31d2340`; `/health` and `/ready` returned 200,
  with database and Redis ready. No production redeploy was triggered.
- The reviewed 55-to-58 Supabase suffix was attempted as one transaction. The
  first migration intentionally stopped on one duplicate tenant/PO-number
  group containing 12 demo records. PostgreSQL rolled back the transaction;
  the hosted ledger remains 55/58 and no schema, business data, audit rows,
  permissions, or flags were changed.
- Do not rename/delete those records or weaken the uniqueness guard without an
  explicit data-remediation decision. The duplicate and historical audit
  integrity blockers keep PO authority and production promotion disabled.

## 2026-08-01 read-only Purchase Order duplicate planner

- Added `scripts/plan-purchase-order-duplicates.mjs` and its pure contract
  helpers/tests. The planner uses a repeatable-read/read-only transaction,
  stable opaque tenant/group/record references, bounded output, timestamps,
  statuses, and deterministic review order.
- Hosted execution confirms one duplicate tenant/PO-number group containing 12
  records. The report prints no PO number, UUID, money, note, or other business
  value; it returns `review_required` and never writes.
- Added CI contract coverage in both GitHub workflows. No hosted schema,
  business data, audit history, provider setting, feature flag, or deployment
  changed in this milestone.

## 2026-08-01 clean-room runtime branding guard

- Runtime source/public text was scanned for ABI Ops, ERPNext, and Frappe
  markers; none were found. Rework references remain limited to internal
  clean-room provenance comments and migration names.
- Added `apps/web/src/lib/branding-clean-room.test.ts` to prevent those legacy
  markers from entering production runtime text. No visible UI copy changed.

## 2026-08-01 controlled release gate aggregator

- Added `scripts/plan-controlled-release.mjs` and its pure contract helper to
  combine the existing migration, Purchase Order duplicate, audit, and
  Railway/Vercel readiness evidence into one read-only decision.
- The command is fail-closed: `--require-clear` exits non-zero unless every
  component is clear. It never applies SQL, enables feature flags, changes
  provider settings, or creates a deployment.
- Hosted execution reports `review_required` with 55/58 migrations, one
  duplicate group containing 12 demo records, and a missing explicit audit
  tenant selector in the current shell. Both live readiness endpoints return
  HTTP 200. No hosted state changed.

## 2026-08-01 Stock Receipt draft authority slice

- Added candidate migration `20260801120000_stock_receipt_create_idempotency.sql`.
  The repository now contains 59 ordered migrations; the hosted Supabase
  ledger remains unchanged at 55/59 and the four missing migrations are still
  a release blocker.
- Added disabled NestJS `POST /v1/inventory/stock-receipts` authority with
  `inventory.manage` capability checks, database-derived tenant membership,
  exact micro-unit quantity and centavo valuation, same-tenant PO/Warehouse/
  Delivery validation, durable idempotency, semantic audit, and one database
  transaction. Posting and reversal remain the existing database workflows.
- Added the server-only `stock_receipt_create_requests` table with tenant
  composite foreign keys, state-payload checks, RLS, and browser privilege
  revocation. `ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED` defaults false and
  its tenant allowlist defaults empty. Existing Inventory Server Actions remain
  authoritative and unchanged; no frontend cutover occurred.
- Validation for this source milestone: shared-types 104/104, database
  110/110 with normal environment-gated skips, API 85/85, web 301/301;
  production build generated 77/77 pages; TypeScript checks, serial lint,
  Actionlint, Gitleaks, migration replay, and the disposable Nest inventory
  integration passed. No hosted database, provider setting, flag, or
  deployment changed.
- Validation: controlled-gate contract 4/4, all existing planner contracts,
  typecheck, lint, actionlint, gitleaks, full package tests, and production
  build 77/77 pages passed. The first parallel verification attempt was
  discarded because build/typecheck raced on `.next/types`; the ordered rerun
  is the authoritative result.

## 2026-08-01 CAD parser write-authority removal

- Removed the Python worker's PostgreSQL dependency and direct `scope_items`
  write path. The worker now reads source files from Supabase Storage, performs
  document extraction, and returns bounded evidence only.
- Added a shared response contract that checks document identity, item count,
  formats, warning limits, quantity/cost bounds, and a maximum of 5,000 items.
- The Next application validates the source document inside the tenant/project
  scope, replaces only that document's derived rows, computes exact integer
  line totals, and writes semantic audit evidence in one transaction. Uploads
  pass the authenticated actor; queued Inngest parsing uses an explicit
  system-attributed null actor rather than accepting worker authority.
- Existing upload/API behavior and UI remain unchanged. No hosted database,
  feature flag, Railway service, Vercel project, or deployment changed.
- Validation: web contract 4/4, web suite 50 files/305 tests, web typecheck,
  ordered lint, production build generated 77/77 pages, and Python source
  bytecode compilation passed. Python pytest was not runnable in this checkout
  because `pytest` is not installed.

## 2026-08-01 NestJS CAD evidence-commit adapter

- Added shared CAD evidence contracts and exact integer line-total helpers in
  `packages/shared-types/src/erp-api/cad.ts`; the web compatibility contract
  now re-exports the same parser limits and arithmetic.
- Added candidate migration `20260801130000_cad_evidence_commit_idempotency.sql`
  and the matching Drizzle table. It is tenant-scoped, composite-FK protected,
  RLS-enabled, server-only, and records processing/succeeded idempotency state.
- Added disabled NestJS `POST /v1/documents/:documentId/cad-evidence` authority.
  It derives membership from PostgreSQL, requires `document.manage`, validates
  document/project tenancy, replaces only document-derived scope rows, commits
  exact totals plus semantic audit in one transaction, and replays/conflict
  checks idempotency keys. `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED` defaults
  false and its tenant allowlist defaults empty. Existing Next parsing remains
  the compatibility path; no UI cutover occurred.
- Python remains evidence-only. No hosted Supabase SQL, flag, Railway service,
  Vercel project, or deployment changed.
- Validation: shared 108/108, database 113 passing with 137 normal skips, API
  92/92, web 301/301; disposable PostgreSQL 17/Redis 7.4.9 lane replayed all
  60 migrations, ran 250/250 database assertions without skips, and ran 10/10
  Nest/Redis integration assertions. Root typecheck, serial lint, production
  build (77/77 pages), Actionlint, Gitleaks, and diff checks passed.

## 2026-08-01 NestJS CAD processing-job intake

- Added strict shared request, opaque queue identity, accepted response, and
  bounded status contracts. BullMQ carries only schema version and durable job
  UUID; it never carries tenant, actor, storage path, or source content.
- Added candidate migration `20260801140000_document_processing_jobs.sql` and
  Drizzle schema. Jobs are tenant-scoped, idempotent by tenant/key,
  composite-FK protected, state/timestamp/warning checked, RLS-enabled, and
  browser-privilege revoked.
- Added disabled NestJS POST intake and tenant-scoped status read. PostgreSQL
  membership and `document.process`/`document.processing.read` are rechecked;
  the transaction derives document project/actor and the server-only queue
  producer deduplicates opaque transport IDs. No worker processor or Next
  cutover is enabled.
- Added clean-room live landing behavior/topology/component artifacts and
  desktop/mobile captures; no visible UI code or copy changed.
- Disposable PostgreSQL 17/Redis 7.4.9 replay passed 61 migrations, 253/253
  database assertions without skips, and 11/11 API integration assertions.
Hosted Supabase remains at its prior ledger; no provider flag or deployment
changed.

## 2026-08-01 NestJS-to-Python CAD evidence bridge

- Added a private `/parse-evidence` worker contract. NestJS signs the exact
  request body with a shared HMAC, sends no tenant/project/actor authority, and
  grants Python only a 120-second exact-object Storage URL. The worker returns
  bounded, hash-linked evidence with deterministic item keys and no ERP write
  capability.
- Added server-only API storage URL issuance, response validation, document
  identity/attempt checks, timeout and response-size bounds, PostgreSQL-backed
  queued/processing/succeeded/failed transitions, duplicate delivery handling,
  retry/dead-letter handling, and the disabled BullMQ processor. Scope commits
  reuse the existing Nest transaction authority; draft-BOM requests fail
  closed until a separate idempotent Nest BOM command exists.
- The legacy `/parse` path remains compatibility-only. Its service-role key is
  optional at worker startup and is required only when that legacy path is
  called; the new evidence path never receives or logs it.
- `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED`,
  `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED`,
  `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED`, and all tenant allowlists remain
  false/empty by default. No Next routing, UI, hosted SQL, provider setting,
  or deployment changed.
- Focused shared/API tests passed; TypeScript typecheck and Python source
  compilation passed. In an isolated temporary venv, the worker suite passes
  11/11, including private endpoint signature and evidence tests.

## 2026-08-01 Durable CAD evidence and draft BOM source slice

- Added candidate migration `20260801150000_document_processing_evidence.sql`
  and tenant-scoped Drizzle schema. Each processing attempt stores validated
  source hash, producer, formats, warnings, bounded worker payload, and
  document/project/job composite-FK context. RLS remains enabled and browser
  privileges remain revoked.
- Added Nest evidence persistence with attempt replay mismatch detection.
  The processor persists evidence before scope commit, then creates an
  idempotent draft BOM in one Nest transaction when requested. BOM and line
  totals use integer centavos; job `draft_bom_id` is durable and duplicate
  delivery returns the existing BOM.
- Added independent closed-by-default
  `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` flag and tenant allowlist. A
  request asking for a BOM is rejected at intake when that gate is closed.
- Disposable PostgreSQL 17/Redis 7.4.9 replay passed 62 migrations, 253/253
  database assertions without skips, and 11/11 API integration assertions.
- Full workspace verification passed: shared 114/114, API 113/113, web
  301/301, database 116 passing with 137 environment-gated local skips,
  workspace typecheck, serial lint, Nest/Next production build (77/77 pages),
  Actionlint, Gitleaks, diff checks, and isolated Python worker pytest 11/11.
  Hosted Supabase, provider flags, and deployments remain unchanged.

## 2026-08-01 Controlled release handoff after CI repair

- Branch `agent-02/third-code-erp-landing` is pushed at
  `69801292e35499645c38991422b66716d25b5476` under `kurtgav`; draft PR #1
  targets `main`.
- GitHub CI run `30707238189` passed Actionlint, secret scan, typecheck, lint,
  unit tests, Postgres 17/Redis reproducibility, Nest container smoke, and
  production build. E2E is explicitly skipped because hosted E2E credentials
  are absent.
- CI-only legacy role grants run after the migration-only schema diff; no
  application migration or hosted privilege changed.
- Read-only hosted planner remains `review_required`: Supabase 55/62, one
  tenant-scoped 12-record Purchase Order duplicate group, and no approved
  `AUDIT_RECOVERY_TENANT_ID`. Railway/Vercel readiness are HTTP 200.

## 2026-08-02 M2.5 processor canary proof

- Added a rollback-only API integration canary that creates a real processing
  job, calls the signed worker-client boundary, persists immutable evidence,
  commits through Nest authority, ignores duplicate delivery, verifies scope
  replacement/audit evidence, and rolls back the fixture.
- CI run `30708078211` passed the PostgreSQL 17/Redis 7.4.9 lane, database and
  API integration, container smoke, workspace checks, and production build.
  E2E remains skipped by explicit credential gating.
- All processing flags and tenant allowlists remain closed. Hosted Supabase,
  Railway, Vercel, and business data remain unchanged.
