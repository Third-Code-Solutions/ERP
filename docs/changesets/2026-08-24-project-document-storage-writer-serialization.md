# Project document storage writer serialization

## Scope

- Added one Core quota boundary shared by every current project-scoped document
  create and delete service.
- Routed legacy document intake, public signing, DocuSeal completion,
  project-linked inspection photos, and document deletion through the same
  exact tenant/project row lock already used by upload reservations.
- Kept pre-project inspection photos outside project quota and allowed
  quota-reducing deletion even when a project is already over its limit.
- Preserved exact idempotent replay before quota enforcement so a committed
  request remains replayable after later usage changes.
- Repaired public-signing replay ordering and re-derived the project from the
  transaction-locked source before quota enforcement, aligning BOM lock order
  with DocuSeal and preventing stale-project charging or cross-writer deadlock.

## Concurrency decisions

- Byte counts are validated as positive safe integers and compared as `bigint`
  against the exact project quota.
- The database helper remains the only project-row write lock and computes
  committed document bytes plus active, unexpired reservation bytes while that
  lock is held.
- Document intake performs an unlocked tenant/project existence check before
  claiming idempotency, then acquires the exclusive quota lock only for a new
  write. This avoids concurrent shared-to-exclusive lock upgrades.
- Deletion locks its document and then the exact project before removing any
  quota-affecting row; exact replay returns before either lock.

## Verification

- PASSED: complete API document-domain suite, 21 files / 138 tests.
- PASSED: focused writer/quota tests, 6 files / 35 tests.
- PASSED: API TypeScript check.
- PASSED: scoped source ESLint check (test files are intentionally ignored by
  the repository ESLint configuration).
- PASSED: `git diff --check`.
- PASSED: final independent Core source review after repairing replay state,
  source/project locking, and source-to-project lock ordering findings.
- NOT RUN: committed-fixture cross-session database contention matrix; the
  independent design is recorded for the local disposable Supabase CI lane.
- NOT RUN: hosted provider or browser validation.

## Deployment

Not deployed. Existing Core write gates remain default-off with empty tenant
allowlists. The Web upload flow and remaining direct Web document writers have
not yet been cut over, and no provider, database, GitHub, or Redis state was
mutated.
