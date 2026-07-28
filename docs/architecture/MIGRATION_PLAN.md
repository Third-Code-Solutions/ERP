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

Status: source published; hosted database reconciled through migration 48;
NestJS/Redis deployed on Railway; Next.js deployed on Vercel; live
Auth/capability/tenant isolation proved without writes; command observability
and safe source-level rollback selection proved; controlled hosted mutation,
audit reconciliation, and exact-value restoration proved. A supplemental
native PostgreSQL/Redis lane now passes clean replay plus zero-skip database and
Nest integration tests. Three forward database fixes are applied and verified
on hosted Supabase. Exact pinned CI and provider-level enable/rollback remain.

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

- Blocked: a green execution of the new disposable PostgreSQL/Redis CI lane.
  GitHub currently refuses runner startup because of account billing/spending
  limits.
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
- Complete: one authorized, same-tenant Nest Project update against designated
  demo data, followed by exact-value restoration through a second Nest
  transaction. Both 200 responses correlated to safe Railway command logs;
  Supabase confirmed two actor-attributed audit rows and continuous hashes.
- Complete: hosted database release gate at 44/44 migrations with the
  protected-catalog verifier green and business baselines unchanged.
- Complete locally: clean replay of 48 migrations plus seed, 212/212 database
  tests with no skips, and the Nest transaction-authority integration test
  against disposable PostgreSQL and Redis.
- Complete hosted release: applied and verified the three forward migrations
  `20260727194749`, `20260727194757`, and `20260727194805`.
- Complete emergency database repair: applied forward migration
  `20260728005112` to align the hosted `purchase_order_status` catalog with
  the canonical application contract. Purchase-order and audit baselines are
  unchanged, and the verifier now rejects enum-catalog drift.
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
- Pending entry evidence: push the reviewed source, dispatch the same workflow
  through the transient GitHub runner, and attach the GitHub run result. This
  replaces payment as the M1 CI unblocker; it does not bypass the tests.
- Keep `ERP_PROJECT_WRITES_VIA_API=false` and the tenant allowlist empty until
  that remote workflow proof is attached.

### M2 — Remove unauthorized worker writes

Status: next.

- Change Python document/DXF processing to return evidence only.
- Add a Nest command that validates the evidence, authorizes the actor, applies
  idempotency, and commits accepted scope changes.
- Queue the processing with BullMQ and persist job/evidence status.
- Keep the existing user-visible upload flow compatible.

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
