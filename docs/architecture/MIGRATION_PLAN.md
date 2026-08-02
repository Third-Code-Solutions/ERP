# Migration Plan

Strategy: strangler migration by complete vertical transaction slices. Keep
the current application usable and keep each new route disabled until its
evidence is green.

## Current source/release handoff (2026-08-02)

The reviewed CAD evidence and atomic draft-BOM slice is published on
`agent-02/third-code-erp-landing` at `4c166142056ee80c7cb2089afefd6bdcb360db63`
under `kurtgav <kurtgavin.design@gmail.com>`. Source gates are green. The
controlled hosted release is intentionally `review_required`: Supabase is
55/62 migrations with seven forward-only candidates, one tenant-scoped
Purchase Order-number duplicate group contains 12 demo records, and
`AUDIT_RECOVERY_TENANT_ID` is not configured. Railway and Vercel readiness are
HTTP 200, but no hosted SQL, flags, provider settings, or deployments were
changed.

## Milestones

### M0 — Baseline audit

Status: complete on 2026-07-27.

- Inventory frameworks, actions, routes, workers, schema, RLS, tests, and
  deployment.
- Record security and production risks.
- Establish current and target architecture documents.

### M1 — Nest transaction-authority foundation

Status: source published; hosted database reconciled through migration 51;
NestJS/Redis deployed on Railway; Next.js deployed on Vercel; live
Auth/capability/tenant isolation proved without writes; command observability
and safe source-level rollback selection proved; controlled hosted mutation,
audit reconciliation, and exact-value restoration proved. A supplemental
native PostgreSQL/Redis lane now passes clean replay plus zero-skip database and
Nest integration tests. Signup provisioning is hardened and verified on hosted
Supabase. Dedicated-canary onboarding and provider-level enable/rollback remain.

- Add NestJS modular-monolith application.
- Add validated configuration, health/readiness endpoints, Supabase identity
  verification, database-backed tenant membership, deny-by-default capability
  guard, PostgreSQL access, Redis, and BullMQ foundation.
- Move one low-blast-radius command: Project update.
- Preserve the existing Server Action contract through a feature-flagged
  adapter.
- Prove tenant scoping, optimistic concurrency, strict boundary validation,
  atomic actor attribution, type safety, tests, and production compilation.
- In the existing clean-database CI job, run the real Nest guards and
  transaction service against PostgreSQL 17, build the production container,
  and smoke it against real PostgreSQL and Redis.
- Keep pnpm 10 dependency overrides in `pnpm-workspace.yaml`; require a frozen
  install with an unchanged reviewed lockfile before CI execution.

Production entry status:

- Complete: the no-cost disposable PostgreSQL/Redis lane is green locally and
  through the approved short-lived self-hosted workflow; paid hosted runners
  are not required for M1 database evidence.
- Complete: repository access and reviewed source publication to
  `Third-Code-Solutions/ERP`.
- Complete: real Supabase Auth identity resolution using consumed one-time
  links without password resets.
- Complete for backend infrastructure: Railway NestJS `/health` and `/ready`
  are green with PostgreSQL and Redis.
- Complete for frontend infrastructure: Vercel production is READY on the
  `4fd1451e756ccb578ed013016d644e5048af6f92` runtime baseline or its
  documentation-only successor, the canonical alias is current, Web Analytics
  is enabled, and desktop/mobile browser gates pass.
- Complete: live missing/invalid 401, malformed 400, Viewer 403, cross-tenant
  404, and stale authorized 409 responses with unchanged Project/audit state.
- Complete: Web-to-Nest UUID correlation and sanitized structured command
  outcomes, including a deployed pre-guard 401 matched in Railway logs.
- Complete: local rollback-selection rehearsal proves exact `false` uses the
  legacy write/audit path and exact `true` uses Nest only. Provider-level
  enable/rollback remains deferred; the hosted flag was never enabled.
- Complete in source: tenant-scoped canary selection requires exact `true` and
  an explicit matching tenant allowlist. Empty, malformed, non-matching, and
  mixed-wildcard values fail closed. Deployment and provider drill remain.
- Complete: read-only hosted target discovery and a redacted Project-cutover
  planner. The current demo tenant is blocked by historical predecessor/hash
  integrity failures; the clean QA tenant is blocked by missing application
  and Auth users. No production flag or data changed.
- Remaining M1 prerequisite: use the existing public signup plus authenticated
  Project-create flow for one user-controlled email identity. Confirm the
  resulting active Auth identity, Admin profile, reversible E2E Project, and
  genesis-rooted chain with
  `pnpm plan:project-cutover -- --require-ready`.
- Complete: one authorized, same-tenant Nest Project update against designated
  demo data, followed by exact-value restoration through a second Nest
  transaction. Both 200 responses correlated to safe Railway command logs;
  Supabase confirmed two actor-attributed audit rows and continuous hashes.
- Complete: hosted database release gate at 50/50 migrations with the
  protected-catalog verifier green and business baselines unchanged.
- Complete locally: clean replay of 50 migrations plus seed, 220/220 database
  tests with no skips, and the Nest transaction-authority integration test
  against disposable PostgreSQL and Redis.
- Complete hosted release: applied and verified the three forward migrations
  `20260727194749`, `20260727194757`, and `20260727194805`.
- Complete emergency database repair: applied forward migration
  `20260728005112` to align the hosted `purchase_order_status` catalog with
  the canonical application contract. Purchase-order and audit baselines are
  unchanged, and the verifier now rejects enum-catalog drift.
- Complete signup hardening: applied `20260729051205` with an empty privileged
  function path, fully qualified objects, deterministic bounded slugs, bounded
  display metadata, and direct execution revoked from client roles. Hosted
  identity/tenant counts remained unchanged.
- Complete onboarding classification persistence: applied
  `20260729054456`, added a constrained non-authoritative tenant organization
  type, safely backfilled existing tenants to `other`, and aligned the shared
  catalog across Web, TypeScript, Drizzle, trigger SQL, tests, and the database
  verifier. Hosted identity/tenant counts remained unchanged.
- Complete Cortex conversation authority: applied `20260729115110`, added an
  immutable optional canonical record-reference pair, reauthorized saved
  context on every read/reply, and revoked authenticated browser writes from
  Cortex conversations and messages. Existing unscoped history remains valid.
- Complete local database evidence for that slice: 51-migration clean replay,
  224/224 zero-skip database tests, authenticated direct-write denial, pair
  constraint enforcement, Nest database integration, and stable rollback
  fingerprint.
- Complete in source: Cortex page focus is server-authorized before entering
  chat; active scope is visible; unavailable focus fails closed; saved history
  is scope-labeled; and only the exact canonical pair restores in place.
- Complete local presentation evidence: context/component/API tests, full
  lint/typecheck/test/build, authenticated production-browser QA at
  1440/768/390, zero overflow/errors, and global test-session revocation.
- Pending activation: include this candidate in one explicitly approved
  consolidated Vercel production build. Do not reconnect Git or create a
  separate preview.
- Complete in source: validated saved-conversation deep links, automatic
  authorized restore, URL synchronization after create/load/new-chat, and
  one-click cross-context history navigation. Latest-request-wins protection
  prevents stale restore responses from replacing newer chat state.
- Complete local proof: pure URL-contract tests, full repository gates, real
  authenticated page/record authorization, deterministic no-write deep-link
  browser restore, responsive overflow checks, clean console, and global
  one-time-session revocation.
- Complete in source: local keyboard-first search over the existing 30
  authorized recent conversations using title and human record-scope labels.
  The UI names the bounded recent scope and exposes no internal identifiers.
- Complete local proof: helper/component tests, full repository gates,
  authenticated mobile search/clear/deep-link browser QA, no overflow or
  console errors, and global one-time-session revocation.
- Complete emergency route proof: authenticated Admin `/dashboard` hard reload
  renders KPI and Risk Signals content with zero browser-console errors;
  Vercel records successful route requests and zero runtime errors in the
  proof window.
- Complete source/provider release: commit
  `42010b9adce6ae89286449edfc1e27c9ffe1eda7` is synchronized to both refs;
  Vercel and Railway released the exact SHA under `kurtgav`.
- Complete in source: the Actionlint bootstrap is pinned to version 1.7.12
  with an exact Linux archive SHA-256. Local Linux validation and pinned
  GitHub Action reference checks pass.
- Complete release evidence: release-tool source commit
  `d4ef08151fa60e62e239c0f049b08b1f83820789` is synchronized to both
  GitHub refs; Vercel production/preview are READY on that SHA. Railway
  recorded a watched-path skip and retains the healthy API artifact from
  `42010b9adce6ae89286449edfc1e27c9ffe1eda7`.
- Complete locally: a no-cost short-lived self-hosted workflow and runner
  bootstrap are implemented. The exact lane passes lint, typecheck, tests,
  production build, 48-migration PostgreSQL 17 replay, 212/212 database tests
  with zero skips, Nest integration and native runtime smoke, stable schema
  fingerprint, and full-history secret scan.
- Complete cost control: Vercel Git is disconnected and repository guard
  `git.deploymentEnabled=false` is published. The guard push created zero
  Vercel deployments; current production remained READY and HTTP 200.
- Complete entry evidence: self-hosted run `30422175962` passed every gate on
  exact SHA `277e03484c00b6c9c6e27bae7d708302bb6d2e88` without remote cache
  or artifact upload. Runner registration and process counts returned to zero;
  credential files were erased.
- Keep `ERP_PROJECT_WRITES_VIA_API=false` and the tenant allowlist empty until
  the dedicated canary passes the read-only cutover planner.
- Exact next action: after explicit email approval, exercise normal signup and
  confirmation, create one reversible non-critical Project, and require a
  zero-blocker planner result. Do not enable routing or request a paid Vercel
  build before that evidence exists.
- Before M2 application code, reconcile the missing-PRD and obsolete-stack
  rules in `AGENTS.md` through a separately reviewed owner-approved governance
  change. Current owner-approved architecture documents remain authoritative.

### Parallel public landing QA correction

Status: source candidate complete; deployment not authorized.

- Preserve the accepted landing architecture and generated image; do not
  rewrite the page.
- Correct the 390px six-line hero to three lines, remove decorative ordinals,
  and enforce 44px visible mobile controls.
- Keep analytics enabled on Vercel while suppressing unavailable Vercel
  telemetry scripts on self-hosted production builds.
- Verify the optimized production build, 1440/768/390 overflow and typography,
  accordion/carousel/FAQ interactions, structured data, and clean console.
- Keep Vercel Git disconnected. Publish source only after all local gates pass;
  request no paid build until the user explicitly approves the disclosed cost.

### Parallel RFQ quote-workflow integrity slice

Status: source and hosted database complete on 2026-07-30; frontend activation
not authorized.

- Replace independent quote/status/audit commits with one row-locked,
  tenant-scoped transaction service.
- Preserve Server Action behavior and visible design while deriving authority
  only from the authenticated profile.
- Persist stable BOM-line identity and tenant-scoped quote submission
  idempotency.
- Enforce tenant-composite quote parents and the explicit RFQ state graph in
  PostgreSQL.
- Recheck complete quote coverage under lock before terminal transition.
- Keep completion notification post-commit and non-authoritative.
- Prove action/service failure paths, exact retry, key conflict, cross-tenant
  denial, audit rollback, invalid transition, clean migration replay, and
  stable schema fingerprint.
- Apply only the reviewed forward migration. Do not reverse the live
  cross-tenant, idempotency, or state-machine constraints.
- Keep Vercel Git disconnected. Include this source in the one consolidated
  production build only after explicit approval.
- Next code slice: add an inert NestJS procurement command adapter for the
  same quote/complete/cancel contract, disabled by default. Do not cut traffic
  until contract, integration, canary, rollback, and provider gates pass.

### M2 — Remove unauthorized worker writes

Status: design complete; application code blocked by M1 and governance gates.

- Contract:
  `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`.
- M2.1 adds inert shared contracts, database constraints, persisted job and
  evidence state, explicit capabilities, Nest endpoints, and a BullMQ
  processor. It routes no user or production traffic.
- M2.2 removes Python database and Storage service-role authority from the new
  path. Python returns bounded, immutable, hash-linked CAD evidence.
- M2.3 makes NestJS validate and transactionally commit pending-review scope
  rows plus one idempotent draft-BOM result.
- M2.4 adds a Next.js compatibility adapter behind an exact flag and
  database-derived tenant allowlist.
- M2.5 proves one authorized demo-tenant job, duplicate delivery, retry,
  audit, reconciliation, and rollback before expansion.
- M2.6 removes the Python/Inngest write path only after every consumer and
  rollback check passes.
- M2.7 migrates visual/text extraction through the same evidence boundary.
- Keep current user-visible upload result fields and completion summary.
- Do not start M2 application code before M1 canary evidence and separately
  approved repository-governance reconciliation.

### Parallel upload tenant-access hardening

Status: source candidate complete; deployment not authorized.

- Fix shared Project lookup to query tenant and Project ID together.
- Require same-tenant Project existence in upload sign and complete routes
  before quota, Storage, document insert, parsing, AI, or queue work.
- Preserve valid upload response and UI behavior.
- Ship only in one consolidated, explicitly approved Vercel production build.
- Keep M2 composite database constraints as required defense in depth.

### Parallel document mutation authority

Status: source candidate complete; deployment not authorized.

- Add explicit `document.manage` capability for operational roles; deny
  `viewer`.
- Require capability before upload-sign, upload-complete, or document-delete
  side effects.
- Audit signed URL issuance before returning the credential.
- Commit document creation plus audit in one PostgreSQL transaction.
- Commit derived scope deletion, document deletion, and audit in one
  PostgreSQL transaction; run Storage cleanup only after commit.
- Ship only in the existing consolidated, explicitly approved Vercel
  production build. Do not buy a separate build for this candidate.
- Keep M2 composite constraints, durable processing evidence, Nest authority,
  and audit triggers as required later controls.

### M3 — Sensitive project and procurement commands

- Migrate approvals, commitments, purchase orders, and inventory commands one
  workflow at a time.
- Introduce explicit persisted state machines and idempotency for retryable
  transitions.
- Remove each legacy write only after equivalence and rollback validation.

### M4 — Finance authority

- Migrate posting/reversal/allocation commands with exact decimal types,
  balanced-entry constraints, immutable evidence, and serializable transaction
  tests.

### M5 — Async consolidation and legacy retirement

- Move appropriate retryable jobs from legacy schedulers to BullMQ.
- Retire duplicated Next, Inngest, Edge Function, and Python write paths only
  when their consumers and operational runbooks are migrated.

## Per-slice definition of done

- Acceptance criteria and compatibility contract documented.
- Tenant, permission, validation, concurrency, idempotency, audit, and failure
  tests appropriate to the command.
- Lint, typecheck, unit/integration tests, and production build pass.
- Preview runtime, database, queue, and logs verified.
- Feature flag, rollback procedure, and data-reconciliation query exercised.
- Current-state, decisions, work log, and next action updated.

## Consolidated frontend activation

Status: exact source candidate prepared; deployment awaits explicit approval.

- Candidate `36e618274769ef49a18974dbe3bed8f0b4db7edd` contains 33
  reviewed commits after the retained production source.
- All 72 changed Web files are inventoried as 44 runtime and 28 test/E2E files.
- Lint, typecheck, 396 application tests, production builds, combined
  authenticated/public browser regression, secret scan, workflow scan, and
  prohibited-source scan pass.
- Vercel Git remains disconnected. Builds are queued one at a time on Standard
  4 vCPU/8 GB. No preview or production deployment was created.
- Activation, production validation, and rollback are defined in
  `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`.
- Do not deploy until the user explicitly approves the single manual
  production build.

## Parallel permission-aware Today slice

Status: source candidate complete; deployment not authorized.

- Select dashboard data mode from the verified application role before
  invoking any query.
- Preserve the existing executive dashboard only for roles allowed to access
  `/pipeline/board`.
- Give restricted roles tenant- and assignee-scoped pending task counts and
  canonical authorized workspace links.
- Keep the slice read-only. No new mutation, schema, provider, or AI authority.
- Include it in the one approved consolidated frontend build and verify at
  least one executive and one restricted role after activation.

## Parallel Cortex consistency slice

- Keep one 48-type application registry aligned with the versioned database
  enum.
- Derive graph scope, entity-source validation, display metadata, and record
  navigation from the registry instead of maintaining independent maps.
- Preserve tenant-scoped node resolution, non-enumerating permission denial,
  and role-filtered citations.
- Add each future entity only with its source mirror, database authorization,
  application route, and enum-completeness tests.
- Activate this source candidate only in the next explicitly approved
  consolidated Vercel build; do not buy a separate build.

## Parallel Cortex citation navigation slice

Status: source candidate complete; deployment not authorized.

- Preserve the existing `text/plain` chat response while adding bounded
  citation metadata for new answers.
- Rehydrate stored citation IDs using current tenant and role scope before
  rendering history.
- Route visible citations through the canonical 48-type entity registry.
- Omit stale, malformed, cross-tenant, superseded, and forbidden nodes.
- Include this candidate in the next explicitly approved consolidated Vercel
  build. Keep Vercel Git disconnected and do not create a separate preview.
- After activation, verify exact record navigation and role-downgrade behavior
  with authorized Admin, finance, procurement, estimator, sales, and viewer
  sessions.

## Parallel Cortex operational context slice

Status: source candidate complete; deployment not authorized.

- Resolve exact supported dashboard detail routes to canonical Cortex source
  tables in one tested server utility.
- Render one shared context panel after existing page content.
- Preserve existing Project-detail panel without duplication.
- Keep collection, create, edit, print, portal, malformed, and unsupported
  routes unchanged.
- Preserve dashboard RBAC and entity-API tenant/current-role authorization.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Public-origin portability slice

Status: source candidate complete; deployment not authorized.

- Replace Vercel-specific public URL literals in metadata, structured data,
  robots, and sitemap generation with one validated resolver.
- Preserve the current production hostname as the compatibility fallback.
- Reject malformed, credential-bearing, non-HTTP(S), or path-scoped origins.
- Remove the unverified build-time sitemap `lastModified` value.
- Verify helper precedence/failure behavior, SEO endpoints, structured data,
  desktop/tablet/mobile behavior, console output, overflow, full repository
  gates, and security scans.
- For any future alternative host, set `NEXT_PUBLIC_SITE_URL` before its single
  reviewed production build. Do not reconnect Vercel Git or create a Vercel
  deployment for this source slice.
- Rollback is one source commit. No database, Railway, Supabase, or Vercel
  rollback is required.

## Milestone: inert NestJS RFQ quote command

Status: implementation and local validation complete; activation not authorized.

- Added shared strict command/result contracts and a modular-monolith
  ProcurementModule.
- Preserved the Next.js writer as default and added exact flag plus UUID
  tenant allowlist routing.
- Added fail-closed API transport and retained complete/cancel on Next.js.
- Validated disposable PostgreSQL rollback, tenant isolation, authorization,
  exact retries, conflict behavior, state transition, and audit evidence.
- Next milestone: inspect provider gates, then propose one tenant canary.

Provider inspection complete:

- Exact RFQ adapter commit is healthy on Railway.
- Vercel incurred no new deployment.
- No hosted tenant currently satisfies Auth, role, Project, and genesis-rooted
  audit requirements.
- Do not select either existing tenant. Create a dedicated canary only through
  approved public signup and authenticated Project creation.
- Root `AGENTS.md` reconciliation remains a separate owner-approved governance
  milestone; do not silently apply its obsolete stack rules or edit it without
  sign-off.

## Parallel atomic RFQ-dispatch slice

Status: source and hosted database complete; frontend activation not authorized.

- Preserve the browser action's `{ rfqId } | { error }` compatibility shape.
- Remove caller-controlled system tenant authority and derive manual authority
  from the authenticated server profile.
- Wire current and historical BOM-approval events to one server-only
  transaction service.
- Lock the tenant-scoped BOM and commit retry check, RFQ creation, and audit in
  one transaction.
- Add tenant-composite BOM ownership and one-RFQ-per-tenant/BOM constraints.
- Keep notification post-commit and suppress duplicate retry notification.
- Remove direct browser write privileges for RFQs and quotes while preserving
  authenticated tenant-scoped reads.
- Apply only forward migrations; never edit the 53 applied migration files.
- Move this authority into NestJS later without changing the compatibility or
  integrity contract.

## Parallel permission-safe universal search slice

Status: source candidate complete; deployment not authorized.

- Normalize and cap query input before role-filtered query fan-out.
- Escape PostgreSQL `ILIKE` escape, percent, and underscore characters so
  browser input is always literal.
- Repeat authenticated tenant predicates on every base and joined table.
- Preserve assignee-scoped tasks and the canonical route-based role matrix.
- Mark every search response private/no-store and vary it on the session
  cookie.
- Verify helper behavior, role policy, authenticated normal and literal
  searches, command-palette rendering, 1440/768/390 layouts, console output,
  overflow, and global one-time-session revocation.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Parallel private Search-to-Cortex handoff slice

Status: source candidate complete; deployment not authorized.

- Preserve the existing permission-filtered record-search path as the default
  command-palette mode.
- Require an explicit Ask mode and prevent it from issuing `/api/search`
  requests.
- Move only a bounded draft through same-tab, opaque, five-minute,
  single-consume browser state; keep prompt text out of URLs and server logs.
- Accept handoff only for company-wide Cortex, clear the marker URL, prefill
  and focus the composer, and never auto-send.
- Verify real authorized search, exact draft transfer, zero search/chat
  requests during handoff, one-time removal, 1440/768/390 layouts, console
  output, overflow, and global one-time-session revocation.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Parallel atomic public-signing slice

Status: source candidate complete; deployment not authorized.

- Preserve the existing public signing URL, form, token hash, and successful
  response contract.
- Bound and validate PNG input before mutation.
- Resolve tenant and source only from the one-time signing session.
- Upload once, then lock and recheck the exact session inside one database
  transaction.
- Commit document, tenant-scoped source transition, session stamp, and
  nullable-actor entity audit together.
- On replay, create nothing. On database or audit failure, roll back official
  state and remove the uploaded object.
- Verify focused failure/success/replay paths, unauthenticated invalid-token
  rendering, full repository gates, and provider no-deployment state.
- Activate only in the next explicitly approved consolidated Vercel build.
  Use a controlled new canary signing session for production proof; never
  mutate historical demo signatures.
- Later NestJS migration must preserve this contract and cannot return
  transaction authority to Python or the browser.
- After activation, verify one populated and one empty record for each role
  family, exact backlinks, non-enumerating denial, and responsive behavior.

## Parallel Cortex relationship-meaning slice

Status: source candidate complete; deployment not authorized.

- Reuse the existing entity authorization gate and role-filtered context pack.
- Convert canonical edge type plus direction into bounded human labels.
- Return at most 12 relationship rows joined only to already-authorized
  neighbor citations.
- Render canonical backlinks with origin metadata, static fallback, visible
  focus, 44px targets, and responsive two-to-one-column behavior.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.
- After activation, verify representative incoming/outgoing edges, unknown-edge
  fallback, exact routes, role downgrades, and cross-tenant denial.

## Parallel Cortex evidence-trail slice

Status: source candidate complete; deployment not authorized.

- Reuse existing node provenance already loaded by the authorized context pack.
- Cap retrieval and response at six newest events.
- Normalize provenance server-side to safe kind, label, explanation, and ISO
  timestamp only.
- Never expose actor, internal reference, hash-chain, sequence, tenant, or
  subject identifiers.
- Render a collapsed native disclosure with 44px target, visible focus, UTC
  timestamps, reduced-motion support, and zero horizontal overflow.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.
- After activation, verify authorized mutation evidence, empty state, role
  downgrade, cross-tenant denial, and raw-field absence in browser responses.

## Parallel Cortex focused-neighborhood slice

Status: source candidate complete; deployment not authorized.

- Preserve the no-query whole-graph contract.
- Accept focus only as a complete registered source table plus UUID.
- Resolve tenant and role exclusively from the authenticated session.
- Reauthorize source/type ownership and role access before neighborhood
  retrieval; use a non-enumerating 404 for missing, mismatched, and forbidden
  records.
- Return a server-derived focus node plus a bounded one-hop neighborhood with
  explicit tenant predicates on focus, edges, and joined neighbors.
- Link operational record context to the focused graph, auto-open the exact
  record, maintain a persistent highlight, and offer a clear route back to the
  whole graph.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.
- After activation, verify Admin and restricted-role focus, role downgrade,
  cross-tenant denial, invalid focus, exact backlink navigation, and
  1440/768/390 console/overflow behavior.

## Parallel Cortex recent-conversation search slice

Status: source candidate complete; deployment not authorized.

- Filter only the existing bounded authorized history response; do not expand
  the API, database query, or retention boundary.
- Match case- and diacritic-insensitively across conversation title and human
  scope label while preserving server order.
- Keep tenant, user, record UUID, and graph-node identifiers out of searchable
  and visible text.
- Show the recent-count boundary, accessible search/clear controls, bounded
  empty state, visible focus, 44px mobile targets, and zero overflow.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Portable self-hosted Web runtime slice

Status: source candidate complete; deployment and traffic cutover not
authorized.

- Preserve the existing Next.js application and API behavior.
- Add opt-in standalone output and a non-root Node 22 image without changing
  the default build used by local development or retained Vercel rollback.
- Expose provider-neutral release identity through liveness and readiness.
- Prove the isolated standalone server renders the real landing page and
  returns nonce CSP, canonical robots, sitemap, and manifest output.
- Do not change DNS, Supabase Auth redirects, Vercel settings, Railway
  services, or live traffic in this source slice.
- Before cutover, build the Docker image on a Linux/Docker-capable host, scan
  it, configure the exact canonical hostname and Auth allowlists, then require
  authenticated browser/API/database/log/tenant-isolation evidence.
- Roll back source by reverting this isolated commit. After a later host
  release, roll back to the retained image tag or retained Vercel artifact.

## RFQ terminal NestJS adapter slice

Status: source candidate complete; provider routing disabled.

- Preserve `completeRfq` and `cancelRfq` Server Action behavior.
- Add one strict Nest command route for complete/cancel with server-derived
  identity and `rfq.dispatch`.
- Keep RFQ lock, tenant predicates, state-machine checks, full quote coverage,
  guarded update, and semantic audit in one PostgreSQL transaction.
- Route only through an independent exact flag plus strict tenant allowlist.
  Never fall back after an enabled API attempt.
- Validate shared, HTTP, service, Web adapter, and real PostgreSQL paths,
  including cross-tenant denial, conflict, cancel reason evidence, and
  rollback cleanup.
- Keep all provider flags absent/false. No Vercel build is required.

Rollback: unset the terminal flag/allowlist or revert this source milestone.
No database or provider rollback is required because the adapter reuses the
current integrity schema and remains disabled.
# 2026-07-30 RFQ creation adapter milestone

Status: source implementation and local release gates complete; production
cutover disabled.

- Added strict shared RFQ creation command and durable result contracts.
- Added capability-guarded NestJS `POST /v1/procurement/rfqs`.
- Added tenant-scoped BOM row locking, replay idempotency, contracted-rate
  filtering, atomic RFQ creation, and semantic audit.
- Added an independent Next.js tenant gate with fail-closed no-fallback
  behavior after Nest selection.
- Preserved the existing Server Action response, post-commit notification,
  route revalidation, and background Inngest flow.
- Kept both creation cutover variables unset.
- Completed root lint, typecheck, tests, production build, all 54 migrations,
  236/236 zero-skip database checks, 2/2 Nest integration tests, action
  validation, release-planner tests, secret scanning, and prohibited external
  ERP runtime scanning.

Next migration milestone:

1. Specify the automatic BOM-approved RFQ dispatch contract.
2. Add a NestJS/BullMQ producer-consumer path behind an independent disabled
   tenant gate.
3. Preserve the current trusted event behavior during compatibility mode.
4. Prove retry idempotency, tenant isolation, audit atomicity, dead-letter
   handling, and Redis recovery against disposable PostgreSQL and Redis.
5. Do not enable provider flags or deploy the frontend without explicit
   approval.

## 2026-07-30 approved-BOM RFQ BullMQ milestone

Status: source implementation, all local release gates, and Railway deployment
complete; production cutover disabled.

- Added the original HTTP, job, retry, dead-letter, authority, compatibility,
  and rollback contract before implementation.
- Added protected NestJS enqueue authority with a deterministic
  tenant/BOM/version job ID and strict server-derived payload.
- Added a NestJS BullMQ processor that revalidates membership and capability,
  requires an approved tenant BOM, and reuses the existing atomic RFQ
  transaction.
- Added five-attempt exponential retry and deterministic final dead-letter
  handling.
- Added an independent exact Next.js flag and strict tenant allowlist. The
  current Inngest producer remains selected by default; a selected Nest failure
  never invokes a second producer.
- Proved the full queue contract against disposable PostgreSQL 17 and Redis
  7.4.9, including a real Redis restart.
- Kept both production cutover variables unset. No schema, data, UI, Python,
  Storage, Supabase, or Vercel change was made.

Next migration milestone:

1. Specify an idempotent RFQ notification outbox and delivery contract inside
   the NestJS modular monolith.
2. Commit notification intent atomically with a newly created automatic RFQ;
   replay must not create another intent.
3. Deliver through BullMQ with bounded retry, dead-letter, audit-safe
   observability, and no transaction-finalizing authority outside NestJS.
4. Prove create/replay/failure/recovery behavior with disposable PostgreSQL and
   Redis.
5. Keep automatic RFQ routing disabled until controlled hosted canary,
   reconciliation, monitoring, and rollback receive explicit approval.

## 2026-07-30 RFQ notification outbox milestone

Status: implementation, hosted schema, local release gates, and Railway
deployment complete; production routing disabled.

- Added the original outbox, delivery state-machine, retry, provider
  idempotency, compatibility, and rollback contract before implementation.
- Added atomic automatic-RFQ outbox and same-tenant procurement-recipient
  snapshots.
- Added UUID-only BullMQ delivery jobs, deterministic duplicate suppression,
  five bounded attempts, dead-letter evidence, and opt-in stale recovery.
- Added idempotent in-app delivery and fail-closed Resend delivery using
  server-only configuration.
- Applied the inert server-only migration to the correct Supabase project and
  verified zero rows, closed browser privileges, and validated composite
  constraints.
- Kept automatic routing, tenant allowlist, and recovery-sweep flags disabled.
  Existing Inngest behavior remains authoritative.

Next migration milestone:

1. Do not canary automatic RFQ routing without an explicitly approved clean
   tenant, exact environment diff, baseline, monitoring, reconciliation, and
   rollback.
2. Audit and specify purchase-order creation as the next bounded procurement
   transaction-authority slice.
3. Preserve current API and UI behavior; add one disabled NestJS adapter only.
4. Require tenant constraints, exact money types, permission checks, audit,
   idempotency, and disposable PostgreSQL evidence before any cutover.
5. Create no Vercel build and keep Vercel Git disconnected.

## 2026-07-30 controlled production release milestone

Status: complete; schema was already current, frontend promoted, backend
retained, and automatic Vercel Git deployment disconnected.

- Proved repository and hosted Supabase parity at 55/55. Applied no migration
  because there was no pending SQL.
- Completed sequential lint, typecheck, 444 application tests, the production
  build, Actionlint, immutable action-reference verification, release-planner
  tests, Gitleaks, and the disposable PostgreSQL 17/Redis 7.4.9 lane.
- The disposable lane replayed all 55 migrations, passed 240/240 database
  assertions and 7/7 Nest integration tests, and retained schema fingerprint
  `5429BBD50089170BFCA7E624C928DB6EBEA30E3D2585E26439CEF592710B6E8C`.
- Promoted exact source
  `31c04942a93dce78f165880fb02bdf38d25eb506` through one Vercel preview build
  and one required production-environment rebuild. No deployment was retried.
- Reused the already healthy Railway application deployment because the
  source delta was documentation-only.
- Verified canonical web and API health/readiness, authenticated dashboard
  rendering, zero Vercel runtime errors, zero provider HTTP 5xx, and protected
  RFQ dispatch.
- Disconnected Vercel Git immediately after production verification.

Next migration milestone:

1. Keep all RFQ automatic-routing, allowlist, and notification-sweep flags
   absent/false.
2. Perform the read-only purchase-order transaction-authority audit already
   defined below; do not combine it with another production release.
3. Create no new Vercel deployment until application source changes, all gates
   pass again, and explicit production authorization is recorded.
4. Keep Vercel Git disconnected. Use one reviewed manual release only when a
   frontend change is ready.
5. Preserve Vercel deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` and Railway
   deployment `50fad0aa-8506-457a-a405-152dc31d2340` as rollback evidence.

## 2026-08-01 purchase-order authority milestone

Status: audit complete; source hardening and disabled Nest contract complete;
no hosted schema or provider deployment performed.

- Audited all PO write entry points, including BOM/grouped/standalone creation,
  cost-code assignment, legacy/current transitions, approvals, issuance, and
  receiving. Confirmed direct Server Action writes remain authoritative.
- Added tenant-derived capability enforcement to existing PO write actions and
  same-tenant project/vendor checks before creation. Added `po.receive` to the
  permission matrix.
- Added strict shared command/result schemas, a Nest pipe, controller, service,
  and tests for `POST /v1/procurement/purchase-orders`. Service fails closed
  and performs no write; route is not selected by any tenant.
- Kept `ERP_PO_CREATE_WRITES_ENABLED=false` by default and did not add it to
  Railway/Vercel environments. No migration was created or applied.
- Full source gates pass: 453 application tests, lint, typecheck, and 77/77
  production pages. Database/Redis disposable lane remains valid from prior
  schema-only release and was not rerun.

Next migration milestone:

1. Design and apply one tenant-composite idempotency table/migration only
   after disposable PostgreSQL proof and hosted parity review.
2. Implement standalone PO transaction in Nest with row locks, same-tenant
   references, budget constraints, semantic audit, and replay tests.
3. Add server-only tenant allowlist gate in Next action, fail closed on API
   outage, and cut over one approved demo tenant with reconciliation.
4. Migrate approval, issuance, receiving, and grouped/BOM creation separately;
   do not combine them into one release.
5. Keep Vercel Git disconnected and create no deployment for this source-only
   backend milestone.
## Milestone: standalone PO idempotency and transaction seam (2026-08-01)

Status: implementation complete locally; production cutover not authorized.

- Added candidate migration 20260801090000 with tenant-composite request
  idempotency and PO-number uniqueness.
- Added Drizzle schema and contract tests.
- Implemented the Nest transaction with locks, bounded integer-centavo math,
  same-tenant validation, semantic audit, and exact replay.
- Added server-only API/Next tenant gates and stable client idempotency keys.
- Hosted Supabase remains 55/55; Vercel Git remains disconnected; no provider
  deployment was created.

Exit criteria still open: replay all 56 migrations against disposable
PostgreSQL 17, prove Redis/readiness and real HTTP transaction cases, reconcile
against hosted schema, then canary one approved tenant with both flags enabled.

## Landing regression milestone (2026-08-01)

Status: complete for source and live evidence; no release was created.

- Added `third-code-landing.test.ts` to protect hero, bento, responsive, and
  accessibility/SEO invariants.
- Captured `docs/research/LIVE_LANDING_AUDIT_20260801.md`, the live
  accessibility snapshot, and the desktop screenshot.
- Browser verification passed at 1440px and 390px with zero console errors;
  full web tests are 298 passed.
- Docker remains unavailable because local hardware virtualization is disabled;
  disposable PostgreSQL/Redis proof was completed through the owned WSL1 lane
  recorded below.

## Disposable authority proof (2026-08-01)

Status: complete locally; hosted cutover still gated.

- Owned Alpine WSL1 lane rebuilt PostgreSQL 17 and Redis 7.4.9 without paid
  services or Docker.
- All 56 migrations applied from zero; release planner reported 56/56 current
  and schema-before/schema-after hashes matched.
- Database tests passed 243/243 without skips; Nest integration passed 7/7,
  including PO idempotency/rollback and BullMQ Redis recovery.
- Remaining gates: read-only hosted Supabase reconciliation, Railway
  readiness/log identity, correct provider account authentication, and a
  reviewed single-tenant canary with both write flags still false by default.

## PO approval workflow authority (2026-08-01)

Status: local implementation and disposable proof complete; hosted migration
and cutover not authorized.

- Added `20260801100000_purchase_order_workflow_idempotency.sql`, Drizzle
  schema, strict shared command/result contracts, Nest pipe/controller/service,
  environment gates, unit tests, and a real PostgreSQL integration test.
- Supported transitions are intentionally bounded: `draft` → PM approval,
  PM approval → Commercial approval, Commercial approval → SCM issuance, and
  rejection back to `draft` from the first two pending states.
- The service performs no email/outbox side effect and does not issue, receive,
  or alter the existing Server Action behavior. This preserves rollback by
  leaving flags false and the legacy path active.
- Validation: 57/57 migrations, 243/243 database assertions, 8/8 Nest/Redis
  integration tests, API focused suite 74/74, shared contracts 17/17, API and
  database typechecks, and root lint passed.

Next exact action: reconcile hosted Supabase read-only against the 57-migration
repository head, authenticate Vercel/Railway as `kurtgav`, then review a
single-tenant canary. Do not enable either workflow flag or deploy this source
before those gates.

Read-only reconciliation completed after this slice: PostgreSQL 17 with
55 applied migrations; repository 57; missing only the two linear candidates
`20260801090000` and `20260801100000`; no unexpected history and no SQL run.

The Next workflow client seam is now implemented and tested (18/18 focused web
tests), but its delegation flag remains absent/false. Do not treat the client
contract as a cutover or as notification parity.

## PO workflow notification parity milestone (2026-08-01)

Status: local implementation and disposable proof complete; hosted cutover not
authorized.

- Added candidate migration `20260801110000_purchase_order_workflow_notifications.sql`
  with strict payload integrity for Purchase Order workflow events.
- Added an independent notification feature gate and tenant allowlist. Nest
  atomically creates role-routed outbox/delivery intent alongside status,
  audit, and idempotency completion. BullMQ validates and delivers in-app or
  Resend email notices with stale/retry/dead-letter protections.
- Full local evidence: 58/58 migrations, 244/244 database assertions without
  skips, 8/8 Nest/Redis integration tests, shared 94, API 79, web 300, root
  typecheck/lint, and 77/77 Next pages. Hosted Supabase remains read-only at
  55/58; no provider release occurred.

Next exact action: keep all PO and notification flags false, review the three
linear hosted candidates and duplicate/constraint evidence, then authenticate
Vercel/Railway as `kurtgav` before any one-tenant canary decision. Do not apply
SQL or deploy while provider sessions are unresolved.

## Read-only canary audit gate (2026-08-01)

The existing demo tenant/project/actor was evaluated without writes on
PostgreSQL 17. Target existence, Supabase Auth identity, project audit
trigger, hardened audit function, and non-public audit function permissions
passed. The cutover planner remains `blocked` because the tenant audit chain
has 2 predecessor-link mismatches and 151 hash mismatches, and the selected
actor lacks `project.update`. No canary, flag enablement, audit repair, hosted
SQL, or deployment is authorized until those findings are separately reviewed.

## Audit hash parity hardening milestone (2026-08-01)

The API and Next server audit writers previously used the shared JSON hash
while the database trigger used its concatenated PostgreSQL timestamp formula.
The shared audit package now exposes a database-compatible helper; both server
writers and chain verification use it, with a fixed parity vector and UTC
timestamp normalization. No migration or historical row rewrite is included.

Validation: focused shared audit tests 17/17; serial repository tests shared
95, database 107 with 137 normal environment-gated skips, web 300, API 79;
disposable PostgreSQL 17/Redis 7.4.9 58/58 migrations, 244/244 DB assertions,
8/8 integration; root typecheck/lint/build and 77/77 Next pages passed. Hosted
forensic review remains read-only and the canary remains blocked by the audit
findings recorded above.

## Read-only audit recovery planner milestone (2026-08-01)

Added `scripts/plan-audit-recovery.mjs` and its pure contract tests. It
requires an explicit tenant UUID, runs a repeatable-read/read-only transaction,
checks PostgreSQL 17 and hardened/non-public audit controls, and reports only
opaque tenant references, counts, timestamps, and system event labels. The
`--require-clear` option exits non-zero while historical mismatches remain.

Validation: audit recovery contract 4/4, database-release contract 7/7,
project-cutover contract 6/6, actionlint passed. Hosted read-only execution
reproduced 661 rows, 2 link mismatches, 151 hash mismatches, UTC timezone, and
`review_required`; no SQL or deployment occurred.

## Audit hash profile verification milestone (2026-08-01)

Added `scripts/verify-audit-hash-profiles.mjs` and contract tests. The tool
reads the selected tenant's immutable audit rows in a repeatable-read/read-only
transaction and classifies only the current PostgreSQL formula, the historical
JSON writer formula, both, or unknown. It prints no entity IDs or business
values and exits non-zero with `--require-current` whenever links or unknown/
legacy profiles remain.

Hosted result: 661 rows; database profile 510, legacy JSON profile 40, unknown
111, broken links 2. Contract tests 3/3 passed; no hosted SQL or deployment
occurred. Unknown rows remain unrepaired and block canary approval.

## Controlled hosted release attempt (2026-08-01)

- Re-ran the read-only planner: PostgreSQL 17, 55 applied migrations, linear
  missing suffix of exactly `20260801090000`, `20260801100000`, and
  `20260801110000`.
- Preflight found one tenant/PO-number duplicate group containing 12 demo
  records. The three migrations were submitted as one transaction; the first
  migration's explicit uniqueness guard rejected the dataset and PostgreSQL
  rolled back. The ledger remains 55/58. No repair, constraint weakening,
  audit rewrite, permission change, feature-flag enablement, or deployment
  followed.
- Next exact action: obtain an approved, reversible remediation for the
  duplicate group; rerun the read-only planner and apply the unchanged three
  migrations atomically only after that decision. Keep provider production
  promotion and all migrated write flags disabled until the audit recovery and
  canary gates also clear.

## Duplicate remediation evidence milestone (2026-08-01)

- Added a read-only Purchase Order duplicate planner with repeatable-read
  isolation, opaque references, bounded groups/records, and a `--require-clear`
  release gate.
- Hosted result: one duplicate tenant/PO-number group, 12 records, one project,
  statuses across draft, PM approval, SCM issuance, and issued. No business
  number or entity ID was printed; no database state changed.
- Contract tests 4/4, actionlint, typecheck, lint, full serial tests, and
  production build passed. Next action is owner approval of a reversible data
  remediation, not weakening the uniqueness migration.

## Clean-room runtime branding milestone (2026-08-01)

- Scanned runtime source and text assets for ABI Ops, ERPNext, and Frappe
  markers; none were found.
- Added a recursive web branding regression test. Rework provenance comments
  remain internal and are not treated as production copy.
- No UI, database, provider, or deployment change occurred; the guard is part
  of the normal web test suite.

## Controlled release gate aggregator milestone (2026-08-01)

Added a provider-neutral, read-only release gate that composes migration
parity, Purchase Order duplicate evidence, audit recovery, and Railway/Vercel
readiness into one explicit result. `--require-clear` fails closed; the tool
cannot apply SQL, enable flags, change provider settings, or deploy.

Validation: controlled gate contract 4/4; existing release, cutover, audit,
hash-profile, and duplicate contracts passed; actionlint, gitleaks, typecheck,
lint, full package tests, and production build (77/77 pages) passed. Hosted
execution remains `review_required` at 55/58 migrations and one 12-record
duplicate group; live readiness checks returned 200. No hosted state changed.

Next action: run the gate with the explicitly approved audit tenant selector
after the owner approves reversible duplicate remediation. Keep all write
flags, tenant allowlists, and provider deployment operations disabled.

## Stock Receipt draft authority milestone (2026-08-01)

Implemented the smallest safe inventory receiving seam without changing the
existing UI or Server Action behavior:

- migration `20260801120000_stock_receipt_create_idempotency.sql`;
- Drizzle table/enums and shared Zod command/result contracts;
- disabled NestJS inventory module, controller, validation pipe, and atomic
  creation service;
- `inventory.manage` capability plus fail-closed API environment flags;
- HTTP, service-boundary, shared exact-arithmetic, migration-contract, and
  disposable PostgreSQL integration coverage.

The disposable lane replayed all 59 migrations and passed its schema verifier,
database tests without skips, and API integration tests. Hosted Supabase was
not mutated: its read-only ledger remains 55/59, with the prior three PO
candidate migrations plus this inventory migration missing. No Railway or
Vercel release was created. The next action is hosted owner-gated data/audit
remediation, not enabling this route.

## Milestone: CAD worker becomes evidence-only (2026-08-01)

Scope: remove the Python worker's direct database write authority while keeping
the existing upload and queued parsing behavior stable.

Changed: worker configuration/dependencies no longer include PostgreSQL;
`src/db.py` was removed; the worker returns `ParseResult` evidence; the web
application validates a shared contract and commits derived scope rows through
one tenant-scoped transaction with exact line totals and audit logging; the
authenticated upload path supplies the actor; Inngest uses the same commit
boundary.

Validation: 4/4 worker-contract tests, 50 web test files/305 tests, web
typecheck/lint, ordered Next production build (77/77 pages), and Python source
compilation. Python pytest remains unavailable because the checkout has no
pytest installation. No hosted SQL or provider deployment was performed.

Next exact action: add a NestJS CAD evidence-commit adapter with the same
contract and transaction tests, then canary it behind a separate false flag;
do not remove the Next compatibility path until parity and rollback evidence
are recorded.

## NestJS CAD evidence-commit adapter (2026-08-01)

Implemented the next smallest authority seam without changing visible UI or
the transitional Next path. Shared Zod contracts bound worker evidence to one
document, one project, 5,000 lines, bounded strings, and safe integer money.
NestJS now has a disabled, capability-guarded command with PostgreSQL-derived
membership, composite tenant references, document-derived replacement,
idempotency replay/conflict handling, exact totals, and semantic audit in one
transaction. The Python worker has no database dependency or ERP write path.

Validation: disposable PostgreSQL 17/Redis 7.4.9 replayed all 60 repository
migrations; 250/250 database assertions executed without skips; 10/10 API
integration assertions passed, including cross-tenant rejection and rollback.
Root tests, typecheck, serial lint, production build (77/77 pages),
Actionlint, Gitleaks, and diff checks passed. Hosted Supabase remains at its
prior ledger; no provider deployment or flag enablement occurred.

Next exact action: keep the Nest flag disabled, review the hosted duplicate PO
and audit recovery blockers, then design a separate canary cutover test before
retiring the Next compatibility path.

## NestJS CAD processing-job intake (2026-08-01)

Implemented the additive M2.1 intake slice: shared contracts and tests;
`document_processing_jobs` Drizzle schema and migration
`20260801140000_document_processing_jobs.sql`; disabled Nest controller,
service, pipe, opaque BullMQ queue, capability/environment gates, and
observability mapping; database integration coverage; and clean-room landing
research artifacts/captures. The route is inert by default and has no worker
bridge; existing Next upload/parsing behavior is unchanged.

Evidence: focused API 105/105; disposable PostgreSQL 17/Redis 7.4.9 replay
61/61 migrations, database 253/253 with zero skips, API integration 11/11.
Full root gates remain the final source milestone check.

Next exact action: add the private Nest-to-Python evidence adapter and durable
worker state transitions behind a separate false bridge flag. Keep intake
false, allowlists empty, and the Next compatibility path active until retry,
stall, idempotency, and canary parity are proven.

## M2.3 signed Nest-to-Python evidence bridge (2026-08-01)

Status: source candidate implemented; activation and hosted release blocked.

- Private `/parse-evidence` accepts only a timestamp/job-bound HMAC request.
- NestJS resolves the tenant-scoped job/document in PostgreSQL, issues a
  short-lived exact-object Storage URL, validates the bounded response, and
  invokes the existing Nest CAD evidence commit transaction.
- BullMQ carries only the opaque job UUID. PostgreSQL claim, retry, terminal
  failure, duplicate delivery, and stale requeue state remain authoritative.
- Python returns source hash, producer identity, deterministic item keys, and
  bounded evidence. It receives no ERP identifiers, database URL, or service
  role for the new path. The old `/parse` endpoint remains compatibility-only.
- `createDraftBom=true` fails closed until an idempotent Nest BOM command is
  implemented; the bridge cannot report a partial success.
- No migration, UI, Next routing, hosted SQL, provider setting, flag, or
  deployment changed in this source slice.

Source validation so far: shared 6/6 focused contract tests, API 111/111
focused/full-package tests, API typecheck, isolated worker pytest 11/11, and
Python compileall. The disposable PostgreSQL 17/Redis 7.4.9 lane passed 61/61
migrations, 253/253 database assertions without skips, 11/11 API integration
assertions, and an unchanged schema hash. Ordered full tests, typecheck,
serial lint, production build, Actionlint, Gitleaks, and diff checks also pass;
all hosted gates remain fail-closed.

## M2.4 durable evidence and draft BOM source candidate (2026-08-01)

Added migration `20260801150000_document_processing_evidence.sql`, strict
Drizzle schema, evidence-attempt persistence, independent draft-BOM gate, and
idempotent Nest draft-BOM transaction. Evidence is persisted before scope
commit; duplicate attempt payloads replay only when hash, producer, formats,
and validated payload match. BOM creation locks the processing job, creates
one draft plus line rows with exact integer totals, attaches `draft_bom_id`,
and writes semantic audit evidence. No Python or browser path can create a
BOM.

Validation: disposable PostgreSQL 17/Redis 7.4.9 lane passed 62/62
migrations, 253/253 database assertions without skips, and 11/11 API
integration assertions. Full workspace gates also passed: shared 114/114,
API 113/113, web 301/301, database 116 passing with 137 environment-gated
local skips, typecheck, serial lint, Nest/Next production build (77/77
pages), Actionlint, Gitleaks, diff checks, and Python worker pytest 11/11.
Activation flags remain false/empty; hosted migration and provider state were
not changed.

## Release evidence update (2026-08-01)

CI run `30707238189` is green for all executable gates, including the clean
schema diff, database assertions, Nest/Redis integration, container smoke, and
production build. E2E remains skipped by explicit credential gating. The
read-only hosted planner still blocks promotion at 55/62 migrations because
the first candidate enforces Purchase Order number uniqueness against a
12-record demo duplicate group; audit recovery also lacks an owner-approved
tenant UUID. Do not apply SQL or deploy this SHA until those inputs are
resolved and the planner is rerun.

## M2.5 processor canary source proof (2026-08-02)

Added `document-processing-processor.database.integration.spec.ts`. The test
exercises the actual Nest processor with the database-backed job state,
signed worker request/response validation, evidence persistence, authority
commit, duplicate delivery, scope reconciliation, semantic audit, and full
rollback. CI run `30708078211` passed all executable gates. This is source
proof only; activation remains blocked by hosted migration drift, duplicate
Purchase Order data, audit-recovery tenant selection, and missing production
E2E credentials.

## M2.5 Redis transport proof (2026-08-02)

Added `document-processing.redis.integration.spec.ts`. The real Redis lane
uses `DocumentProcessingJobQueue`, validates the opaque queue contract, and
proves duplicate enqueue/delivery results in one transport job and one worker
execution. CI run `30708445023` passed this test and the processor canary.
Remaining M2.5 proof is bounded retry/final-failure, stale requeue, and
recovery after Redis loss; production flags remain closed.

## M2.5 recovery completion (2026-08-02)

The source slice now proves bounded BullMQ retry/final-failure, PostgreSQL
stale-claim recovery, and re-enqueue after Redis transport loss. Recovery
resets stale claims in PostgreSQL and feeds at most 100 opaque IDs through the
existing idempotent queue transport. CI run `30709595007` passed the full
executable lane; E2E remains skipped by explicit credential gating.

The recovery entry point remains dormant until a periodic scheduler has
explicit feature and tenant gates, observability, and canary approval. Hosted
schema drift, duplicate Purchase Order data, and the missing audit-recovery
tenant selector still block release promotion.

## Final branch push and release audit (2026-08-02)

Reviewed source and architecture/operations memory are pushed at
`39f6a62c2bf0463ac0fdcf4fe2788cb876f65510`. CI run `30710003798` passed all
executable gates and the production build; E2E is skipped by explicit hosted
credential gating. The read-only planner still reports `review_required` for
55/62 hosted migrations, the 12-record tenant Purchase Order duplicate group,
and the missing approved `AUDIT_RECOVERY_TENANT_ID`. Do not apply SQL or deploy
providers until owner inputs clear those gates.

## M2.6 tenant-scoped recovery scheduler source candidate (2026-08-02)

Added explicit recovery env gates and tenant allowlist intersection, a BullMQ
job scheduler, an opaque scheduler contract, and a Nest processor branch that
rebuilds transport from PostgreSQL state. The query resets stale claims and
returns at most 100 queued IDs only for the approved tenant scope. Local API,
shared, typecheck, lint, build, and diff checks pass; database/Redis integration
requires the CI credential lane. The scheduler remains disabled by default and
must not be enabled until hosted migration, audit, duplicate-PO, and canary
gates clear.

CI run `30711326355` then passed the complete executable lane, including the
Postgres 17/Redis recovery and cross-tenant exclusion proof, production build,
and container smoke. E2E remains skipped by explicit hosted-credential gating.
The read-only hosted planner is still `review_required` at 55/62 migrations;
do not apply SQL or deploy providers until the owner inputs clear it.

## M2.7 Cortex source-grounded search (2026-08-02)

Status: source candidate implemented; hosted release blocked by existing
database-integrity and audit-recovery gates.

- Added a tenant-session-bound `GET /api/cortex/search` keyword route with
  role-derived node-type scope, registry/ref-table validation, source metadata,
  freshness, and safe deep links.
- Added a debounced graph-toolbar result surface. Typing uses only the local
  keyword route; no embedding or LLM call occurs per keystroke, controlling
  Vercel execution and provider spend.
- Hardened shared Cortex ILIKE retrieval by escaping wildcard characters.
- Preserved canonical ERP authority: Cortex search reads derived graph rows and
  cannot approve, mutate, or finalize business transactions.
- Focused Cortex/search/graph tests pass 22/22; full Web tests pass 306/306;
  database tests pass 116 with 137 explicit environment-gated skips;
  workspace typecheck, serial lint, and Next production build pass.

Commit `6d55248110e630ed01c16f903972c8d52ff70af2` is pushed under `kurtgav`.
CI run `30712546507` passed Actionlint, secret scan, typecheck, lint, unit
tests, Postgres 17/Redis reproducibility, and production build; E2E is skipped
by explicit hosted-credential gating. Next exact action: rerun the read-only
controlled-release planner. Do not apply the seven hosted migrations or deploy
Railway/Vercel while it reports the duplicate Purchase Order group or missing
approved `AUDIT_RECOVERY_TENANT_ID`.

## M2.8 RAG suggestion hardening (2026-08-02)

Implemented the smallest safe RAG slice before moving the feature into a
dedicated Nest module: the existing Next compatibility endpoint now derives
tenant and role from the session, gates BOM visibility, bounds provider input,
returns only finite high-confidence approved-history matches, and maps outages
to a safe 503. The client contract remains unchanged for empty and configured
responses; the new `source` field makes provenance explicit. Next step is a
Nest read adapter only after hosted release evidence and API deployment
identity are available.

## M2.8 evidence checkpoint (2026-08-02)

`fa283f94376aacd8f7febd9324b162697571efa1` is the reviewed source candidate.
GitHub Actions run `30713863937` passed all executable gates, including a
zero-to-current Postgres rebuild, empty schema diff, database tests without
skips, Nest transaction integration, container smoke, and production build.
Keep the Next compatibility route in place until the hosted planner clears;
do not apply hosted migrations or deploy providers from this checkpoint.

## M2.9 Python AI advisory worker (2026-08-02)

Status: source candidate implemented; worker deployment and hosted enablement
not authorized.

- Added a standalone FastAPI `/v1/embeddings` worker with private bearer auth,
  bounded input, provider timeout, response-shape/dimension validation, and
  no database or ERP write capability.
- Added a TypeScript worker client and worker-first selection in the shared
  embedding helper. Existing OpenAI TypeScript behavior remains unchanged when
  `AI_WORKER_URL` is absent; partial worker configuration fails closed.
- Updated BOM RAG, auto-BOM, and Inngest refresh gates to use the shared
  provider-availability check.
- Python 6/6 tests, focused Web 10/10 tests, full workspace tests, typecheck,
  lint, build, secret scan, actionlint, and workflow-reference validation pass.
  Docker smoke is pending local Docker engine recovery.

Next: deploy the worker only as a separately reviewed Railway service after
the controlled planner is clear; then run authenticated worker, provider-cost,
tenant-isolation, and exact-release-SHA evidence before enabling the URL.

## M2.9 CI evidence checkpoint (2026-08-02)

Reviewed source candidate `56bb76eb2dc7f4f7f00fbe4690e06323696b0618` passed
GitHub Actions run `30715179369`: static checks, secret scan, full unit suites,
Postgres reproducibility, Nest transaction integration, container smoke, and
production build. E2E remains explicitly skipped by hosted-credential gating.
This green source result does not authorize hosted SQL or provider deployment
while the controlled planner reports integrity blockers.

## M3.0 Change Request authority slice (2026-08-02)

Implemented the smallest safe backend authority seam for US-009. The new
`change_request_create_requests` migration is forward-only and server-only;
its tenant/key uniqueness and composite parent foreign key make retries
deterministic. Nest validates the opportunity and optional design file inside
one transaction, inserts design-role in-app notification intent, and writes a
semantic audit record. `change_request.create` is explicit and mapped to
owner/admin/sales. Next.js receives a client seam only; the existing action
remains live until a reviewed canary.

Validation complete for the source slice: shared 3/3, database 3/3, Nest
5/5, Web client 20/20, environment 11/11, serial API 125/125, workspace
typecheck/lint, production build 78/78 routes, secret scan, actionlint,
workflow refs, and diff checks pass. GitHub Actions run `30717165544` for
commit `765285a57d37885980f01774bffdb27676a203e0` also passed the zero-to-
current Postgres 17 replay, schema diff, database tests without skips, Nest
transaction integration, container smoke, and production build; E2E remains
credential-gated. Do not apply the new migration to hosted Supabase or deploy
providers while the controlled planner remains `review_required`.

## M3.0 database evidence checkpoint (2026-08-02)

Added a disposable PostgreSQL integration contract for the Change Request
authority. It uses a transaction-bound Nest database service and rolls back
all probe rows. The evidence checks two-tenant isolation, viewer denial,
opportunity ownership, idempotent replay, conflicting-key rejection, one
design notification, one semantic audit entry, and zero tenant-B writes.
The local run is explicitly skipped without disposable database credentials;
the source typecheck and serial API suite pass (126 tests, one skipped).

Next: run this integration lane in CI (where Postgres 17 is disposable), then
rerun the read-only hosted planner. Keep the command flags and migration
closed until the planner is `clear` and a tenant canary is approved.

## M3.0 disposable CI evidence checkpoint (2026-08-02)

Commit `77b6e04206a48ff47ffeee5567b56bf3e3195e65` passed CI run
`30718464238`. The Postgres 17 reproducibility lane executed
`change-request.database.integration.spec.ts` with one passing test,
database tests without skips (256/256), migration/schema replay, Nest
transaction/container smoke, and the production build. E2E remains skipped by
the hosted-credential gate. Hosted release remains blocked by the independent
planner and must not be mutated.

## M3.1 web compatibility seam checkpoint (2026-08-02)

Implemented the smallest safe vertical slice in commit `d5ee498`:

- `packages/auth/src/server.ts`: explicit `change_request.create` capability
  with the existing admin/owner/sales role mapping.
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts`:
  closed-by-default tenant gate to the Nest command; legacy direct write,
  notification, and audit path preserved when disabled.
- `apps/web/src/components/proposal/change-request-form.tsx`: stable per-submit
  idempotency token, reset only after success; no visible UI change.
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.test.ts`:
  gated routing, token propagation, and UUID fallback coverage.

Validation passed: 53 web test files / 320 tests, workspace lint, production
build 78/78 routes, actionlint, gitleaks, workflow action references, and
diff checks. No hosted mutation. Next action remains the read-only planner,
then owner-approved data remediation before any flag or provider change.

## M3.1 disposable CI and hosted planner checkpoint (2026-08-02)

GitHub Actions run `30732430851` passed on SHA
`1b3bff1efac5901e34859263f43b1be94835eced`: all executable checks, Postgres
17 zero-to-current replay, database tests without skips (256/256), Nest
transaction/container smoke, and build. E2E stayed skipped by credential
gating. The read-only planner still returns `review_required`; keep the seam
closed and do not apply hosted SQL or deploy providers.

## M3.2 Purchase Order workflow seam checkpoint (2026-08-02)

Implemented commit `fa3c20a`:

- `apps/web/src/app/(dashboard)/procurement/actions.ts`: submit, PM approval,
  and Commercial approval route through the existing Nest workflow client only
  for explicitly allowlisted tenants; direct legacy writes remain fallback.
- `apps/web/src/app/(dashboard)/purchase-orders/[id]/po-status-actions.tsx`:
  stable per-action browser retry keys; no visible copy or layout change.
- `apps/web/src/app/(dashboard)/procurement/actions.workflow.test.ts`: five
  tests for routing, UUID fallback, and fail-closed outage behavior.

SCM issuance and rejection intentionally remain legacy because current Nest
workflow schema/service does not support those states. Validation passed: Web
54 files / 325 tests, workspace typecheck/lint, production build 78/78 routes,
actionlint, gitleaks, workflow-reference checks, and diff checks. No hosted
mutation. Next action: CI evidence, then read-only planner recheck.

## M3.2 CI and planner checkpoint (2026-08-02)

GitHub Actions run `30733168171` passed on final SHA
`1bc232e55fa2f122aea5182b5ca442d536e916d4`: all executable jobs, Postgres 17
zero-to-current replay, database tests without skips (256/256), Nest
transaction/container smoke, and production build. E2E stayed skipped by
credential gating. Planner remains `review_required`; no hosted SQL or provider
deployment is authorized.

## M3.3 — Purchase Order rejection parity (completed source slice)

Scope: route rejection from all pending approval states through the existing
Nest command for explicitly allowlisted tenants; add the forward-only outbox
constraint extension and stable browser idempotency key; retain legacy SCM
issuance until supplier-email side effects are server-owned.

Evidence: source commit `16904f0`; GitHub Actions run `30733959058` passed
Actionlint, lint, secret scan, unit tests, typecheck, fresh Postgres 17 replay
and no-skip database tests, Nest transaction/container smoke, and production
build. E2E remains credential-gated. Local full Web/API/database suites and
build also passed; local database integration is credential-gated.

Release boundary: no hosted SQL or provider deployment. The planner reports
55/64 hosted migrations (nine pending), one 12-record duplicate Purchase Order
group, and missing `AUDIT_RECOVERY_TENANT_ID`. Next slice: design and prove a
supplier issuance outbox contract, then re-run the planner before any canary.

## M3.4 - SCM issuance and supplier outbox (completed source slice)

Scope delivered:

- Add `scm_issue` to the shared workflow contract and Nest state machine with
  `po.issue` capability authorization.
- Keep the existing Next.js SCM action and button stable while routing only
  explicitly allowlisted tenants through Nest with an opaque retry key.
- Create the supplier-issued event and tenant-scoped delivery snapshot in the
  same transaction as status `issued`; never call Resend inside that
  transaction.
- Add separate BullMQ supplier jobs, deterministic job IDs, bounded retries,
  durable dead letters, provider idempotency, `supplier_email_sent_at`, and
  semantic audit evidence.
- Add database schema/migration, contract tests, email/queue/processor tests,
  and disposable Postgres integration coverage for issue, replay, supplier
  outbox, delivery, evidence, and audit.

Evidence: source commits `21a152d` and `52b6288`; CI run `30735228348` passed
all executable jobs, including zero-to-current Postgres 17 replay, no-skip DB
tests, Nest integration/container smoke, lint, typecheck, unit tests, and
production build. E2E remains credential-gated. The first CI attempt
`30735062767` exposed and was fixed for PostgreSQL's nullable-side `FOR UPDATE`
restriction.

Release boundary: the planner is still `review_required` at Supabase 55/65,
with ten unapplied migrations, one 12-record duplicate Purchase Order group,
and missing `AUDIT_RECOVERY_TENANT_ID`. No hosted SQL, provider deployment,
flag, queue, or business-data mutation occurred. Next action: obtain owner
mapping/audit tenant inputs, re-run the read-only planner, then review the
forward-only migration set as one controlled database release.

## M3.5 - Finance journal posting authority (completed source slice)

Scope delivered:

- Add a strict shared journal-post command/result contract and a Nest
  `finance.post` capability with a closed-by-default tenant gate.
- Add tenant-scoped idempotency storage, composite foreign keys, state/result
  checks, forced RLS, and service-role-only privileges in
  `20260802120000_finance_journal_post_idempotency.sql`.
- Move official posting authority into a Nest transaction that locks the
  tenant membership and journal, calls the existing database posting function,
  persists/replays the result, and writes semantic audit evidence. Keep the
  database function as the ledger authority and the Next action as a
  compatibility seam.
- Carry a stable browser retry key without changing visible finance UI.

Evidence: source commit `97106ba`; CI run `30736271967` passed all executable
jobs, including fresh Postgres 17 replay, empty schema diff, no-skip database
tests, Nest transaction/container smoke, unit tests, typecheck, lint, secret
scan, and production build. E2E remains credential-gated. Local serial suites
and build also passed.

Release boundary: no hosted SQL or provider deployment. The read-only planner
now reports 55/66 hosted migrations (eleven pending), one 12-record duplicate
Purchase Order group, zero audit rows, and missing `AUDIT_RECOVERY_TENANT_ID`.
The two finance write gates and tenant allowlists remain false/empty. Next
action: obtain owner data/audit decisions, re-run the planner, then review one
controlled forward migration set before any Railway/Vercel action.

## M3.6 - Cortex external-model privacy boundary (completed source slice)

Scope delivered:

- Add a reusable deterministic redaction policy for direct identifiers and
  apply it to graph prompt context, semantic embedding input, and all chat
  message turns sent to the external model.
- Replace raw Cortex query text in audit metadata with started/completed
  phases, stable prompt/response hashes, model/fallback outcome, redacted
  previews, source counts, and citation counts.
- Preserve tenant/RBAC retrieval, deterministic grounded fallback, durable
  authorized chat history, and the existing public landing design.

Evidence: source commit `08f1315`; focused Cortex tests 10/10, full Web suite
55 files / 332 tests, and Web typecheck passed. No migration was added. No
hosted SQL or provider deployment occurred; the finance and PO write gates
remain closed.

Release boundary: this is source evidence only. Re-run the read-only planner
before any hosted release; current blockers remain 11 pending migrations,
duplicate Purchase Orders, zero audit rows, and missing
`AUDIT_RECOVERY_TENANT_ID`.

CI evidence: run `30736912185` passed all executable jobs for source commit
`08f1315`; Actionlint, typecheck, unit tests, lint, secret scan, the clean
Postgres 17/Redis reproducibility lane (including Nest transaction/container
smoke), and production build all passed. E2E remains skipped by explicit
hosted-credential gating. CI green is not hosted-release authorization.

## M3.7 - CAD processing authority handoff (completed source slice)

Scope delivered:

- Add a closed-by-default Next selector and strict tenant allowlist for the
  binary-DWG canary. Default tenants and non-DWG formats preserve the current
  behavior.
- Delegate selected jobs to Nest/BullMQ through the existing signed
  document-processing contract. If core rejects or is unavailable, return a
  durable processing-unavailable result; never invoke the legacy Next CAD
  writer after core selection.
- Add the authenticated status proxy and bounded browser polling so the
  existing upload surface can show queued, processing, succeeded, or failed
  state without moving business logic into React.

Evidence: commit `0cfb72a`; focused 36/36 tests, full Web 57 files / 342 tests,
lint, typecheck, and production build 78/78 routes passed. GitHub Actions run
`30738075103` is the source candidate gate; E2E remains credential-gated. No
database migration was added and no hosted SQL/provider action occurred.

Release boundary: leave `ERP_DOCUMENT_PROCESSING_VIA_API` and
`ERP_DOCUMENT_PROCESSING_TENANT_IDS` false/empty, together with all API-side
processing, evidence, worker-bridge, and draft-BOM gates. The hosted planner
is still `review_required` at 55/66 migrations with a 12-record duplicate PO
group, zero audit rows, and missing `AUDIT_RECOVERY_TENANT_ID`. After owner
mapping and audit-tenant inputs, re-run the planner, then validate one demo
tenant end to end (queue, signed evidence, scope commit, status polling,
RBAC-negative, audit, readiness, exact SHA, and rollback) before any provider
promotion.

## M3.8 - Stock Receipt creation authority (completed source slice)

Scope delivered:

- Add the Next selector `ERP_INVENTORY_RECEIPT_CREATE_VIA_API` with strict
  `ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS` allowlisting.
- Route selected Stock Receipt creates through the existing Nest transaction
  contract with normalized nullable fields and fail-closed error handling.
- Carry one opaque browser idempotency key across retries without changing the
  visible receipt form. Add client/action contract tests and environment docs.

Evidence: focused 31/31 tests, full Web 58 files / 348 tests, workspace lint,
Web typecheck, and production build 78/78 routes passed. No database migration
was added and no hosted SQL/provider action occurred. GitHub Actions run
`30739156350` passed all executable jobs on exact SHA
`3f4bca7d6a1416f751599ba268f4c0fad565a73f`; E2E remains credential-gated.

Release boundary: keep both inventory selector variables false/empty. The
hosted planner remains `review_required` at 55/66 migrations, with eleven
pending, one 12-record duplicate Purchase Order group, zero audit rows, and
missing `AUDIT_RECOVERY_TENANT_ID`. After owner mapping and audit-tenant
inputs, re-run the planner and validate one demo tenant (RBAC, PO/warehouse/
delivery binding, micros/cents, idempotent retry, audit, readiness, exact SHA,
and rollback) before any provider promotion.

## M3.9 - Stock Receipt post/reversal authority (completed source slice)

Scope delivered:

- Add strict shared post/reverse commands and result contracts plus Nest
  `inventory.post_receipt` routes with tenant membership/RBAC rechecks.
- Add durable tenant-scoped post/reverse idempotency, composite foreign keys,
  state/result constraints, forced RLS, and service-only privileges in
  `20260802130000_stock_receipt_workflow_idempotency.sql`.
- Keep the existing PostgreSQL posting/reversal functions as numbering, ledger,
  fiscal-period, and state authority. Nest commits the function result,
  idempotency state, and semantic audit in one transaction; exact retries replay
  without a second posting or reversal.
- Add independent Next canary selectors and stable browser retry refs. Selected
  core paths fail closed and never fall back to direct RPCs; visible inventory
  UI/copy/design remain unchanged.

Local evidence: focused shared/API/Web/database contract tests passed; full API
30 files / 140 tests, Web 58 files / 353 tests, and shared 10 files / 123 tests
passed. Workspace lint/typecheck and production build 78/78 routes passed;
Actionlint, Gitleaks, diff checks, and the disposable WSL1 PostgreSQL 17 /
Redis 7.4.9 lane passed 67/67 migrations, 260/260 DB assertions without skips,
and 18/18 Nest/Redis integration assertions. One existing Redis-loss test
flaked once and passed on the immediate retry.

Release boundary: no hosted SQL or provider deployment. Supabase remains at
55 applied migrations while source has 67; the aggregate duplicate-PO report
is 1 group / 12 records and the owner still must provide
`AUDIT_RECOVERY_TENANT_ID`. Railway/Vercel readiness are healthy, but this
planner state keeps every inventory write gate and provider action closed.
