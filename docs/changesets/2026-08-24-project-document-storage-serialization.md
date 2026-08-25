# Project document-storage serialization primitive

- Date: 2026-08-24
- Finding: AUD-004
- Scope: Agent 04 transaction primitive
- Deployment: not deployed; no feature flag enabled

## Outcome

Added a transaction-only database helper that locks one exact, non-retired
tenant project before reading its committed document bytes and active,
unexpired upload-reservation bytes. Aggregates remain database text until they
are validated and converted to `bigint`, so quota accounting cannot lose
precision through JavaScript numbers.

The exported type requires Drizzle's transaction-only rollback surface, which
prevents a caller from accidentally passing the root auto-commit database
client and releasing the `FOR UPDATE` lock before the usage query. Tenant and
project IDs are snapshotted before the first await, and both lock and aggregate
result cardinality/shape fail closed.

## Changed areas

- `packages/database/src/document-storage-quota.ts`
- `packages/database/src/__tests__/document-storage-quota.test.ts`
- `packages/database/src/index.ts`

## Verification

- PASSED — focused quota helper tests, 19/19.
- PASSED — `@third-code-erp/database` typecheck.
- PASSED — independent review of transaction typing, lock order, scope
  snapshotting, exact bigint parsing, and malformed executor results.
- PASSED — diff and whitespace checks.

## Handoff

Agent 05 must call this helper inside every Core project-document mutation and
compare the returned exact totals against the shared product quota. Provider
I/O remains outside those database transactions. Web-owned compatibility
writers receive the same primitive in their later Agent 03 handoff.
