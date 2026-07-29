# Migration Plan

Strategy: strangler migration by complete vertical transaction slices. Keep
the current application usable and keep each new route disabled until its
evidence is green.

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

Status: source implementation and all local release gates complete; production
cutover disabled.

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
