# WO-02 audit and calendar handoff

## Scope

BUILD OPS WO-02 requires both a data-layer gate and a runtime service. Work is
not complete until the database mutation path produces one immutable audit row
per covered table mutation and holiday changes are tenant-isolated.

## Sequence

1. Agent 04 — apply the reviewed additive audit/calendar migration on a
   disposable or restored staging database. Preserve all existing foreign keys,
   append-only audit rules, and tenant RLS.
2. Agent 05 — expose typed holiday read/write operations only after the table
   exists and the RLS mutation test passes. Runtime business-day calculations
   consume the persisted tenant calendar plus the approved national seed.
3. Agent 13 — replay the full ledger, run migration/rollback/advisor checks, and
   record the exact deployed migration head.
4. Agent 03/feature agents — wire process/SLA clocks only after WO-02 database
   acceptance is verified.

## Current evidence

- Hosted ledger: 55 migrations applied; current local workspace has 56 and
  provider-linked `origin/main` has 124. The former 55/55 equality was a
  historical snapshot only.
- Hosted audit coverage: 71/86 tenant-scoped tables; 15 gaps are documented.
- Non-applied design: `docs/proposals/2026-08-12-wo-02-audit-calendar.sql`.
- Static proposal gate: `pnpm test:wo-02-sql-proposal` PASS.
- Full read-only release preflight: `pnpm plan:database-release:full`; it
  currently fails on the hosted WO-02 database gates instead of passing on
  migration-ledger parity alone.
- No hosted DDL or data mutation has been executed.

## Handoff

→ Handoff to Agent 04. Reason: missing audit trigger coverage and the
tenant-maintained holiday table require schema ownership. Inputs: the SQL
proposal, current hosted ledger, and read-only target audit evidence.
Expected output: staging-verified additive migration, RLS proof, audit
exactly-once proof, rollback evidence, and advisor recheck.
