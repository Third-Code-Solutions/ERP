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

Status: source published; hosted database reconciled; NestJS/Redis deployed on
Railway; Next.js deployed on Vercel; live Auth/capability/tenant isolation
proved without writes; command observability and safe source-level rollback
selection proved. Disposable CI, hosted mutation reconciliation, and
provider-level enable/rollback remain.

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
- Complete: hosted database release gate at 44/44 migrations with the
  protected-catalog verifier green and business baselines unchanged.
- Keep `ERP_PROJECT_WRITES_VIA_API=false` until the remaining entry evidence is
  attached.

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
