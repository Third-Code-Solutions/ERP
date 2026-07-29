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

Status: source published; hosted database reconciled through migration 50;
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
