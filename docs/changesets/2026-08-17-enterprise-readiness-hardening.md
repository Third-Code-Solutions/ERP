# Enterprise-readiness hardening (local)

**Completion state: PARTIALLY VERIFIED.** This is a repository-safe hardening
slice with scoped local and read-only provider evidence. It is not an
enterprise-release approval, deployment, or claim that customer data was
tested.

## Remediated in source and CI

- Replaced duplicate Web/API RBAC matrices with a dependency-free canonical
  `ErpRole`/`ErpCapability` policy and regression coverage.
- Moved the five previously identified browser API mutation paths behind ERP
  Core. The current static boundary report finds zero direct database writes in
  `apps/web/src/app/api`; two read-only routes remain direct reads.
- Added takeoff-import Core contracts, removed direct auto-BOM persistence,
  and return unpriced visual candidates rather than direct Web pricing.
- Closed a BOM immutability bypass: takeoff and Togal commits now permit only
  draft BOMs, including their UI gates. Fractional source quantities are never
  rounded to fit the integer BOM schema; they are rejected or retained as
  unresolved evidence until a separately approved precision migration exists.
- Restored the worker endpoint consumed by the existing Core document-processing
  client: `/parse-evidence` now verifies exact-body HMAC signatures, request
  freshness and identity, bounded body/source sizes, no redirects, source
  hashes, and the shared `third-code-cad-extractor` evidence shape without any
  tenant, database, or Storage credential.
- Added ADR-022 and an additive, dormant membership/delegation foundation.
  The migration does not change active `users.tenant_id` authority or enable
  tenant switching/delegation at runtime.
- Added an opt-in Upstash REST distributed rate-limit adapter using atomic
  fixed windows, salted subject digests, secure HTTPS endpoint validation,
  redirect refusal, route-specific policies, standard rate-limit response
  fields, and fail-closed selected-provider behavior. Added a Core
  `provider-vision` quota before visual document-intake state is written.
- Added request command correlation (`trace_id`, `tenant_id`, `actor_id`, role,
  action, and outcome) after authentication guards resolve the principal,
  while retaining redaction of URLs, payloads, credentials, and entity IDs.
- Added `20260817100000_harden_function_search_paths.sql` and
  `20260817110000_explicit_server_only_rls_policies.sql`. The former pins two
  mutable function search paths; the latter installs explicit deny policies
  for the 56 server-only tables reported by the read-only advisor.
- Made database/API integration lanes reject zero, pending, skipped, todo, or
  failed Vitest work. Trusted-PR browser E2E requires an isolated target and
  rejects skipped/flaky Playwright evidence rather than appearing green by
  omission.
- Added managed-Supabase parity-plan checks. It currently records a 144-hosted
  / 147-source migration ledger and the ordered unapplied suffix; it does not
  claim live application of source migrations.
- Corrected the BUILD OPS CI invariant test so it enforces the intended safe
  order: rebuild, ledger/schema validation, then CI-only legacy Data API grants.
  This prevents test-only grants from masking a migration-drift failure.

## Verified locally

- Focused Web tests for local/distributed rate limiting, middleware, provider
  quota, upload completion, CAD evidence, takeoff route handling, and manual
  BOM actions: pass (64 tests).
- Focused API takeoff/Togal immutability and private CAD bridge tests: pass
  (10 tests).
- Focused shared takeoff/Togal and document-processing contract tests: pass
  (16 tests).
- Full DXF parser worker regression/API tests: pass (21 tests, one third-party
  TestClient deprecation warning).
- Focused database tests for membership/delegation, function search paths, and
  server-only RLS policy inventory: pass (6 tests).
- Full monorepo lint, TypeScript checks, and production build: pass. The build
  compiled the API and generated all 85 Web routes.
- Full monorepo unit runner: exit 0 with 2,395 passed tests. It also reports
  162 intentionally skipped database/disposable tests because this workspace
  has no authorized `DATABASE_URL` or enabling flags; those skips are not
  database, RLS, or tenant evidence.
- Disposable PostgreSQL 17 checks prove the two function search paths are
  empty and the 56 rejection policies deny authenticated direct rows.
- `pnpm verify:managed-supabase-parity-plan` and its six-test suite: pass,
  reporting 144/147 and three ordered pending migrations.
- Web database-boundary verification and no-skip assertion tests: pass.
- `pnpm ci:actionlint`: pass. `pnpm audit --prod --audit-level high --json`:
  pass with zero reported vulnerabilities.
- Read-only Supabase inspection confirms the linked project is healthy and
  currently has 144 migrations. It did not mutate hosted schema or data.
- Read-only public production-surface check: pass for
  `https://thirdcode-erp.vercel.app` at revision `dpl_HsLoNYV4` (health,
  readiness, manifest, and landing only). It did not authenticate, mutate data,
  or prove protected user workflows.
- Isolated-browser public landing check: pass with accessible primary navigation
  and zero console errors or warnings. The page automatically issued one 200
  anonymous page-view telemetry POST; no login, customer-tenant action, or ERP
  database mutation was performed.

## Failed or deliberately not performed

- **FAIL — full local Supabase CLI replay:** `npx supabase@2.109.1 start` and
  current `npx supabase@2.114.0 start` fail at the first migration with
  `type "bom_status" already exists`. A clean, unlinked one-migration fixture
  reproduces the same failure for both `CREATE TYPE` and `CREATE TABLE` via
  `db reset --local`. The fixture and its Docker objects were removed. See
  `docs/blockers/2026-08-17-supabase-cli-local-migration-replay.md`.
- **NOT RUN — authenticated hosted E2E:** no isolated origin, test tenant, or
  dedicated credentials were configured. Customer tenants were not used.
- **NOT RUN — production data-boundary scan:**
  `pnpm verify:production-data-boundary` failed closed because neither
  `BUILD_OPS_DEMO_TENANT_IDS` nor `BUILD_OPS_DEMO_TENANT_SLUGS` was supplied.
  No production tenant was queried or mutated.
- **NOT RUN — provider operations:** no Upstash account/token, centralized
  log/error provider, alert, SLO, backup, Storage backup, or restore drill was
  created or exercised.
- **NOT RUN — deployment or hosted migration:** no production deployment,
  source-migration application, hosted-data mutation, credential change, or
  promotion occurred.
- **BLOCKED — exact fractional BOM quantities:** the PRD's `0.10` worked
  example conflicts with the active integer quantity column. Source now fails
  closed instead of rounding, but an ADR, additive precision migration, and
  real ABI workbook proof are required. See
  `docs/blockers/2026-08-17-bom-fractional-quantity-schema.md`.

## Remaining enterprise-release blockers

- Legacy authority remains split across approximately 30 Web mutation modules,
  workers, and services outside the bounded API/Core repair. A transactional,
  domain-by-domain authority migration requires Core contracts and acceptance
  tests; do not collapse distinct finance/procurement/approval semantics into
  one speculative change.
- Membership/delegation is a source foundation only. Adoption needs a signed
  delegation matrix, runtime auth migration, hosted migration plan, and
  cross-tenant E2E proof.
- Hosted advisors still flag eight authenticated `SECURITY DEFINER` helpers,
  vector in `public`, leaked-password protection disabled, and 457 performance
  findings. Private-schema/exposure changes, extension relocation, and index
  additions require provider settings and workload evidence.
- VAT basis, delegation matrix, real ABI Excel templates, Togal export, rate
  ownership, retention, SAP scope, vendor portal, and estimator-vs-Excel
  acceptance remain unresolved business inputs.
- Decimal BOM quantity representation remains a product/database migration
  decision; do not claim the PRD's fractional DUPA example is executable while
  `bom_line_items.quantity` remains an integer.
- The local host runs Node 24.16.0 / pnpm 10.33.0. `apps/web` explicitly
  requires Node 22.x, so pnpm emitted engine warnings even though the root
  manifest declares pnpm 10.33.0. `AGENTS.md` still says pnpm 9.x, which
  conflicts with the committed root manifest. Exact Node 22 CI and hosted
  browser proof remain required.

## Workspace hygiene note

`git diff --check` still reports 19 trailing-whitespace diagnostics in
pre-existing unrelated dirty files. They were preserved rather than silently
rewritten. Targeted changed files are whitespace-clean.
