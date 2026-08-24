# Project document-storage contention matrix

## Scope

- Added a committed PostgreSQL fixture for the minimum tenant, actor, project,
  document, and reservation schema needed by the shared quota transaction.
- Added a no-skip integration matrix that launches the repository-pinned
  PostgreSQL 16 image and applies the authoritative upload-reservation
  migration before exercising the real Drizzle quota-lock helper.
- Used dedicated one-connection clients and PostgreSQL backend PIDs to prove
  that a contender is in a database `Lock` wait on the winning transaction,
  rather than inferring serialization from elapsed time.

## Covered behavior

- Reservation versus reservation: the first 50 MiB reservation brings a
  project from 450 MiB to the exact 500 MiB boundary; the blocked contender
  recomputes usage after commit and is rejected without a second ledger row.
- Reservation versus intake in both winner orders: exactly one 50 MiB writer
  commits at the boundary and the other is rejected without oversubscription.
- Exact idempotent reservation replay creates no second row; release is
  terminal and replay-safe; a released reservation stops consuming quota and
  permits a 50 MiB intake at the exact boundary.
- A separate tenant already at 500 MiB is excluded from the target aggregate,
  and a mismatched tenant/project scope returns no locked project.

## Verification

- PASSED: focused disposable PostgreSQL matrix, 1 file / 3 tests.
- PASSED: full local database Vitest run, 83 files / 296 tests; 9 files / 160
  pre-existing credential- or environment-gated tests remained skipped because
  the local shell had no `DATABASE_URL`. The new matrix has no skip path.
- PASSED: existing upload-reservation migration verifier against its pinned
  disposable PostgreSQL image.
- PASSED: `@third-code-erp/database` TypeScript check.
- PASSED: `git diff --check`.
- NOT RUN: hosted Supabase or provider mutation; this test owns and removes only
  its uniquely named disposable local container.

## Deployment

Not deployed. No production schema, service, provider, or hosted data was
changed.
