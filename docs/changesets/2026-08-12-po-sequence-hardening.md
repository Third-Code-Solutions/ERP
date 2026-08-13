# Purchase Order sequence hardening

## Outcome

PARTIALLY VERIFIED: local implementation and checks pass; hosted deployment and
database migration remain blocked by provider-source and WO-02 gates.

## Changes

- Replaced lexicographic `max(po_number)` allocation in all three Purchase
  Order creation paths.
- Added an atomic tenant-scoped reservation against the existing
  `financial_sequences` table.
- The allocator derives the next legacy `PO-####` value numerically, ignores
  non-canonical seeded labels such as `PO-2026-0001`, and preserves the higher
  of the stored sequence and legacy maximum.
- Added Zod validation for BOM, project, vendor, date, line-item, quantity, and
  cost-code inputs; project and vendor lookups now explicitly enforce the
  authenticated tenant before insert.
- Replaced floating-point VAT/withholding calculations with integer basis-point
  arithmetic and safe centavo-product checks.
- Purchase Order, line items, and BOM locking now share a transaction in the
  BOM-generated path. Grouped BOM creation reserves each PO and its lines in
  one transaction, locks the BOM row, refuses already-committed BOMs, and
  writes the BOM lock audit event in the same transaction.
- BOM-generated PO creation now reads and locks source BOM lines after taking
  the BOM lock, preventing stale line snapshots from being copied during a
  concurrent edit. Empty approved BOMs fail before any PO is allocated.
- Creation audit rows now use `writeAuditLogInTransaction`, so the PO/BOM
  mutation and its audit event commit or roll back together.
- All PO creation paths and vendor creation now enforce `po.create`; vendor
  creation validates bounded fields and commits the vendor plus its audit row
  in one transaction.
- Viewer-forbidden Finance, Inventory, and Invoices pages now redirect through
  the shared RBAC policy instead of throwing capability errors during Next.js
  prefetch/render work. This keeps expected authorization denials out of
  production error logs.
- Added root and dashboard loading, error, and not-found boundaries with
  accessible retry/recovery actions and redacted failure references.
- Procurement and Purchase Order list/detail pages now use the authenticated
  tenant-bound profile; Purchase Order detail joins also constrain related
  projects, vendors, and approver identities to the same tenant.
- Project, BOM, pipeline, opportunity, progress, variation-order, warranty,
  print, inspection, upload, document, report, and AI routes now use the
  authenticated profile instead of redundant unscoped identity lookups.
- BOM mutations now enforce `bom.edit` or `bom.approve_internal`, validate the
  parent project/BOM relationship, scope line-item sorting and deletion by
  tenant plus BOM, and constrain supplier/material joins to the tenant.
- Legacy procurement status advance and receiving actions now enforce the
  appropriate Purchase Order capability and tenant scope; supplier joins are
  tenant-constrained.
- Pipeline opportunity creation and stage advancement now enforce the existing
  `opportunity.create` and `opportunity.advance_stage` capabilities, with
  authorization regression coverage.
- AI chat and similar-item endpoints now validate request bodies with Zod and
  apply bounded message/description limits before provider calls.
- Scope-item money parsing now converts decimal pesos to exact centavos with
  BigInt arithmetic and rejects unsafe values; focused parser tests cover
  fractional precision and overflow boundaries.
- Follow-up tenant-scope audit closed unscoped mutation predicates across
  claims, punchlist, delivery inspections, admin catalogs, KYC accounts,
  turnover/COC/permit workflows, proposal design actions, portal signing, and
  DocuSeal webhook paths. Public joins now bind related project/account rows
  to token tenant identity.
- Follow-up read audit added tenant-bound joins to customer-project portal
  headers, warranty/CNPS pages, public signing summaries, and portal account
  lookups; no remaining `requireUserProfile` app route lacks an explicit tenant
  reference.
- Background-library audit added tenant predicates to Cortex conversation
  updates, SLA sweep updates, CNPS dispatch/retry paths, weekly-report
  attachment updates, customer-portal view counters, and pre-con checklist
  dependency updates. Won-conversion now passes tenant identity into checklist
  seeding.
- Middleware now performs a tenant-scoped role lookup for restricted dashboard
  paths and returns an explicit 307 forbidden redirect before server rendering;
  runtime role validation is closed over the persisted role vocabulary.
- Authenticated role E2E now uses deterministic `@abi.demo.ph` accounts so
  concurrent magic-link tests cannot invalidate one another's sessions.
- Added typed tenant-bound Nest routes for process steps, task assignment,
  SLA-clock start/evaluation/observe mode, approval rules, approval decisions,
  and BU-level process-health reads with explicit capability checks.
- Added structured request fields (`trace_id`, `tenant_id`, `actor_id`, and
  `action`) for the process API mutation/read paths.
- Added the authenticated web Core API client and Operations > Process Health
  surface. It shows BU-level source-backed metrics or an explicit unavailable
  state; it never fabricates an empty process catalog or SLA counts.
- Added `/process` to the middleware protected-route set and to unauthenticated
  and authenticated browser route coverage.
- Fixed local authenticated browser fixtures to derive the Supabase cookie host
  from `PLAYWRIGHT_BASE_URL`, so `localhost` and `127.0.0.1` production-mode
  runs exercise the same session boundary.
- Fixed the project audit route to use an explicit pre-`entity_key` projection;
  the UI does not require that new column, so the route remains renderable while
  the provider-linked schema is still before the additive audit migration.
- Hardened `smoke-console.spec.ts` so console errors fail the test instead of
  being reported only as log output.
- Replaced raw process-API insert failures with typed Nest
  `InternalServerErrorException` responses; API surfaces no longer leak generic
  `Error` throws for impossible persistence results.
- Promoted the WO-02 audit/calendar proposal into the ordered
  `20260812155000_wo_02_audit_business_calendar.sql` migration so a clean
  replay does not depend on a manual proposal step.
- Hardened the calendar actor trigger to attribute a mutation only when the
  authenticated actor belongs to the holiday row's tenant; system-seeded
  national holidays remain actor-null instead of creating cross-tenant FK
  failures during tenant provisioning.

## Verification

- PASS - web TypeScript check.
- PASS - web unit suite: 55 files, 315 tests.
- PASS - aggregate `pnpm test`; database integration coverage still reports
  137 skipped tests because the root test process does not receive
  `DATABASE_URL`.
- PASS - focused Purchase Order authorization, input, money, and number tests:
  16/16.
- PASS - Next production build generated 78/78 routes.
- PASS - root `pnpm typecheck` across auth, database, API, shared types, and
  web.
- PASS - current local production server Playwright E2E: 5/5 using the
  installed Chrome executable via `E2E_CHROME_PATH`; this includes public,
  responsive, auth-boundary, and hosted-data viewer checks. The server error
  log was empty.
- PASS - static Build Ops invariants, demo-tenant tests, project cutover-plan
  tests, WO-02 SQL proposal gate, workflow action pin checks, actionlint, and
  gitleaks.
- PASS - root production build: API webpack and Next.js 78/78 routes.
- PASS - focused upload, project, document, procurement authorization
  regressions: 5 files, 21 tests; pipeline authorization: 3 tests.
- PASS - `git diff --check`.
- PASS - follow-up `pnpm typecheck` after tenant-scope hardening.
- PASS - latest `pnpm build` after portal read-scope hardening; API webpack and
  Next.js 78/78 routes.
- PASS - latest fresh local production-server Playwright E2E: 5/5; exact port
  3010 listener cleanup verified with zero remaining listeners.
- PASS - latest aggregate `pnpm test`: 55 web files / 315 tests, 99 database
  tests passed with 137 DB-dependent skips, and 26 API tests.
- PASS - `pnpm typecheck` after background-library tenant hardening.
- PASS - latest `pnpm typecheck` and production build after middleware RBAC
  hardening; Next.js generated 78/78 routes.
- PASS - latest authenticated production-mode local E2E: 7/7, including
  Cortex focused graph, viewer dashboard isolation, deterministic 11-role
  access matrix, auth boundaries, responsive frontend checks, and explicit
  forbidden-route redirects.
- PASS - latest `pnpm lint`, actionlint, gitleaks, workflow-action reference
  checks, and `git diff --check`.
- PASS - API process contract/unit coverage: 9 files, 41 tests.
- PASS - API typecheck and process test rerun after typed exception hardening:
  9 files, 41 tests.
- PASS - web process-health client/UI coverage: 55 files, 315 tests.
- PASS - fresh local production-mode browser E2E after the `/process` auth fix:
  4/4 authentication/public frontend checks.
- PASS - authenticated viewer dashboard E2E: 1/1, including explicit
  `/process` unavailable-state verification with no fabricated metrics.
- PASS - authenticated Cortex focused graph E2E: 1/1.
- PASS - authenticated 11-role access matrix E2E: 1/1.
- PASS - authenticated production-mode major-route smoke: 1/1 test, 21 routes,
  using the explicit admin magic-link harness; HTTP status, error overlays,
  substantive rendering, console errors, and non-realtime page errors all
  passed.
- BLOCKED - password-mode `smoke-console.spec.ts` remains unavailable without
  a valid explicit `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` pair; the provider
  returned `invalid_credentials`. Magic-link mode is now supported explicitly.
- PASS - latest production build after middleware hardening: 78/78 routes.
- FAIL - hosted WO-02 database gate: 9 checks fail (audit coverage 71/86;
  missing `audit_log.entity_key`, business-calendar table/RLS/policies/trigger).
  This is the current read-only result from
  `node --env-file=apps/web/.env.local scripts/verify-wo-02-database.mjs`.
- BLOCKED - provider-source release plan: 69 migrations pending, one tenant
  has 12 duplicate `PO-0002` rows, and the local checkout is not the clean
  provider-linked source.
- BLOCKED - `pnpm verify:release-source`: 216 changed entries; local HEAD and
  56-migration workspace differ from provider-linked `origin/main` at 124
  migrations.
- NOT RUN - hosted authenticated mutation/E2E creation flow; production
  writes remain disabled while the hosted database release is blocked.
- PASS - live Vercel public/auth boundary E2E against
  `https://thirdcode-erp.vercel.app`: 3/3.

## WO-03 / M-06 local foundation

- Added tenant-scoped `process_steps`, `task_instances`, `sla_clocks`,
  `approval_rules`, and `approvals` Drizzle schema definitions with composite
  tenant foreign keys, non-negative integer-centavo approval bands, owner
  resolution checks, schedule ordering, external no-escalation constraints,
  observe-mode defaults, RLS, and audit trigger attachment.
- Added the local-only migration
  `supabase/migrations/20260812160000_process_sla_engine_foundation.sql`.
  It deliberately contains no process-step seed rows because the ABI SD
  Framework deck is absent; see
  `docs/blockers/2026-08-12-wo-03-sd-framework-source.md`.
- Added the shared process-SLA contract for business-day and calendar-hour
  clocks, 80% at-risk, 100% breach, 150% internal escalation, external-clock
  no-escalation, and observe-mode suppression.
- Added the Agent 04/API/UI/Ops handoff in
  `docs/handoffs/2026-08-12-wo-03-process-sla.md`.
- Added the M-06 static no-fabricated-seed gate to the CI unit-test job.
- Added typed tenant-bound Nest routes for process steps, task assignment,
  SLA-clock start/evaluation/observe mode, approval rules, approval decisions,
  and BU-level process-health reads with explicit capability checks.
- Added structured request fields (`trace_id`, `tenant_id`, `actor_id`, and
  `action`) for the process API mutation/read paths.
- Added the authenticated web Core API client and Operations > Process Health
  surface. It shows BU-level source-backed metrics or an explicit unavailable
  state; it never fabricates an empty process catalog or SLA counts.

WO-03 verification is local foundation evidence only. WO-02 and M-06 have now
been replayed together on an isolated PostgreSQL 17 database with seed data,
but hosted Supabase remains unchanged and populated authenticated process E2E
is not run because the source deck and provider migration/recovery gates remain
blocked.

- PASS - `pnpm --filter @third-code-erp/shared-types typecheck`.
- PASS - shared-types tests: 7 files, 94 tests.
- PASS - `pnpm --filter @third-code-erp/database typecheck`.
- PASS - `pnpm test:process-sla-sql`.
- PASS - root `pnpm typecheck` after M-06 schema/contract changes.
- PASS - `git diff --check`.
- NOT RUN - PostgreSQL migration replay/rollback; no disposable PostgreSQL 17
  environment is available and hosted mutation is not authorized under the
  current release blockers.
- NOT RUN - authenticated populated process/SLA E2E; no source-backed process
  steps exist to exercise the workflow.
- PASS - API process contract/unit coverage: 9 files, 44 tests.
- PASS - web process-health client/UI coverage: 56 files, 320 tests.
- PASS - browser frontend/authenticated smoke: 5/5 tests across auth,
  responsive public frontend, and 21 major authenticated routes (including
  `/process`) with Chrome; the read-only role matrix also passed 1/1.

## M-06 lifecycle and scheduler hardening

- Added typed task status transitions: `in_progress`, `blocked` with a
  required reason, `completed`, and `cancelled`. Terminal transitions close
  any active tenant-scoped SLA clock in the same transaction.
- Added `PATCH /v1/process/tasks/:taskId/status` with UUID, capability, and
  strict Zod boundaries.
- Added the closed-by-default `process-sla-checker` Inngest cron. It evaluates
  bounded immutable schedule snapshots every 15 minutes and uses optimistic
  tenant/status/timestamp matching, so duplicate runs cannot overwrite a
  concurrent clock transition. External clocks can become breached but never
  escalated.
- Process API clock creation now loads tenant holiday rows when
  `BUSINESS_CALENDAR_DB_ENABLED=1`; otherwise it uses the approved national
  seed. M-06 migration now requires WO-02 calendar schema before apply.
- PASS - shared-types tests: 7 files, 94 tests.
- PASS - API tests after lifecycle hardening: 9 files, 44 tests.
- PASS - web process-SLA scheduler tests: 5 tests.
- PASS - full root test suite: shared 94, database 99 with 137 database-backed
  tests skipped because `DATABASE_URL` is unset, API 44, web 320.
- PASS - sequential production build and root typecheck.
- PASS - browser auth/frontend/major-route smoke: 5/5; read-only role matrix:
  1/1, using installed Chrome because the Playwright-managed browser binary is
  not installed.
- PASS - API and Web typechecks; M-06 SQL safety gate; build-ops invariants;
  actionlint; gitleaks; `git diff --check`.

## Latest local replay refresh

- PASS - clean isolated PostgreSQL 17 replay: 57 ordered migrations, seed, and
  migration ledger exactly matched the repository; `plan-database-release.mjs
  --require-current` reported `current` with no missing or unexpected versions.
- PASS - `verify-database-repro.mjs`: protected-table/RLS/index/trigger/grant
  invariants passed on the fresh replay, including the WO-02 calendar and M-06
  process tables.
- PASS - database runtime suite on the fresh replay: 17 files, 236 tests.
- PASS - API database integration on the fresh replay: 3 files, 3 tests,
  including the populated process/SLA lifecycle journey.
- PASS - forced Turbo test run with `--env-mode=loose`: shared 94, database 236,
  API 44, web 320 tests; no test cache was used.
- PASS - stock-movement regression reproduced and then passed after the
  tenant-aware calendar actor fix.
- PASS - current production-mode browser verification: 8/8 tests using the
  installed Chrome executable, covering auth boundaries, the public responsive
  frontend, 21 authenticated routes with console/page-error assertions, Cortex,
  viewer dashboard isolation, and the seeded role matrix.
- PASS - current `pnpm build`: API webpack and Next.js 78/78 routes.
- PASS - current `pnpm typecheck`: auth, database, API, shared types, and web.
- PASS - current `verify-database-repro.mjs`: 57 migrations and 36 protected
  tables, including WO-02/M-06 policy, index, grant, and trigger coverage.
- PASS - current local release plan and audit verifier: migration ledger current,
  WO-02 gate passed, and 92/92 tenant-scoped tables have exactly one enabled
  audit trigger.
- PASS - current `ci:actionlint`, schema verifier, SQL gates, and direct pinned
  gitleaks 8.30.1 scan; the wrapper retry was blocked only because GitHub
  release fetch timed out, while the cached pinned binary completed with no
  leaks.
- BLOCKED - current provider-source plan remains 55/124 applied with 69
  pending, one duplicate `PO-0002` group containing 12 rows, and no hosted SQL
  executed.

## Live deployment boundary

The live alias remains on READY deployment `dpl_F1Xo2hfhpMrfvrHG1hiPRKeim9mN`
for source `8268bbf93fae23c4584c4d0485ded784e07e08b4`, while this workspace has
uncommitted changes and differs from provider-linked `origin/main`. Vercel
runtime inspection still reports stale authorization-error groups from that
deployed source. Current local RBAC, API, and route-boundary fixes are
therefore not claimed as production-fixed and were not deployed.
