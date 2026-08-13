# BUILD OPS WO-02 business-day service

## Outcome

PARTIALLY VERIFIED. The date-only business-day engine and data-backed 2026
Philippine holiday seed are implemented and tested. Database audit coverage is
blocked by the missing staging/restore gate and an existing 71/86 trigger
coverage result.

## Changes

- Added `@third-code-erp/shared-types/business-days`.
- Added runtime-supplied holiday calendar support, weekend handling, business
  day `add` and `[start, end)` `between` arithmetic, and separate calendar-hour
  arithmetic for CX clocks.
- Added deterministic calendar merging so tenant-maintained rows override the
  national seed by date without changing the arithmetic engine.
- Reworked existing SLA clocks so process SLAs use Philippine business days,
  while CX acknowledgement/scheduling clocks remain calendar hours. Legacy
  `sla_seconds` JSON is parsed as calendar hours for backward compatibility.
- Added four pure SLA semantics tests covering Holy Week, calendar hours,
  legacy config, and malformed config.
- Added database schema typing and a server-only tenant calendar loader. It
  validates rows at the DB boundary, preserves disabled-date overrides, and
  fails explicitly when the unapplied table is unavailable.
- Wired the Inngest SLA checker through an explicit
  `BUSINESS_CALENDAR_DB_ENABLED=1` rollout gate. Until the additive table is
  migrated and verified, it uses the approved national seed; once enabled, a
  missing table fails loudly instead of silently using the wrong calendar.
- Updated the legacy Supabase SLA fallback to parse both clock types and load
  persisted tenant holiday rows for business-day clocks; it no longer treats a
  process SLA as calendar seconds.
- Added Deno typecheck and two tests for fallback calendar arithmetic and
  Philippines-local day boundaries.
- Corrected deployment identity precedence so dirty-tree Vercel releases expose
  the immutable deployment ID rather than stale Git metadata.
- Added official 2026 regular/special holiday data as JSON, including Eid'l
  Fitr, Eid'l Adha, and the Holy Week run.
- Added year-boundary, Holy Week, holiday-start, runtime calendar, calendar-hour,
  and invalid-input tests.
- Added read-only `verify:audit-coverage` proof for the database trigger gate.
- Added the non-applied additive SQL proposal at
  `docs/proposals/2026-08-12-wo-02-audit-calendar.sql`. It preserves the
  existing UUID audit contract while adding `entity_key` for numeric/composite
  row keys, covers the 15 current audit gaps, and introduces tenant-maintained
  holiday rows with RLS and idempotent 2026 seed data.
- Added `pnpm test:wo-02-sql-proposal` to block destructive or incomplete
  proposal drift before staging review.
- Added read-only `pnpm verify:wo-02-database` to verify audit coverage,
  additive audit identity, holiday-table shape/RLS/policies, seed presence, and
  append-only rules after staging or production migration.
- Hardened the non-applied proposal for replay after a partial staging attempt:
  audit constraint, holiday policies, and holiday triggers are created only
  when absent; no DROP or destructive repair was introduced.

## Verification

- PASS - shared-types typecheck.
- PASS - shared-types tests: 6 files, 88 tests.
- PASS - web SLA semantics tests: 5 tests; database and web typecheck.
- PASS - web production build: 77/77 routes.
- PASS - code-only Vercel deployment and live 3/3 Chromium boundary E2E.
- PASS - web production build generated 77/77 routes.
- PASS - latest code-only production deployment
  `dpl_4ZVACBsDAY2BUUJzGTUCPmHEZcb2` is READY and live browser/API checks
  pass: 3/3 browser tests, 22 protected roots, health/readiness database up,
  and empty Vercel runtime-error aggregation.
- PASS - latest production deployment `dpl_F1Xo2hfhpMrfvrHG1hiPRKeim9mN`
  is READY and the public alias E2E is 3/3 after fixing the reproduced page
  navigation 429 regression. API/auth/mutation requests remain rate-limited;
  page GET/HEAD requests no longer consume the shared bucket.
- PASS - the latest Vercel build emits Node 22 serverless lambdas and the
  provider-managed middleware edge runtime is Node 24; runtime-error
  aggregation is empty after live browser and HTTP smoke.
- PASS - `pnpm test:wo-02-sql-proposal` still rejects destructive SQL and now
  verifies replay-safe policy, constraint, and trigger creation.
- FAIL/BLOCKED - hosted audit trigger coverage: 71/86 tenant-scoped tables.
- NOT RUN - audit DDL, migration push, or production data mutation.
- NOT RUN - SQL execution, RLS mutation tests, audit exactly-once tests,
  rollback, and post-migration advisor recheck.
- FAIL against current target by design - `pnpm verify:wo-02-database` reports
  9 missing WO-02 database gates, including the known 71/86 audit coverage.
