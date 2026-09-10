# Project submittals / CDE register

## Outcome

Added a clean-room project document-control register for submittals. Teams can
create drafts, submit revisions, start a controlled review, and record an
auditable approval or rejection with due dates, spec sections, disciplines, and
plan references.

## Changed areas

- Added `project_submittals` schema/migration with tenant/project/user foreign
  keys, lifecycle metadata checks, forced RLS, revoked direct client privileges,
  approved-record immutability, and database audit trigger.
- Added strict shared Zod contracts for filters, draft edits, submission, review,
  and decisions (rejection requires a reason).
- Added Core list/create/update/submit/start-review/review routes with transaction
  membership checks, idempotent creates, optimistic concurrency, assignment
  validation, state-machine gates, and semantic audit events.
- Added project `/submittals` route with status filters, responsive forms,
  read-only roles, loading/error states, and Manila-local timestamps.
- Added opt-in Playwright all-role visibility matrix.

## Verification

- Database typecheck/static migration tests: PASSED (3 tests).
- Shared contract tests: PASSED (3 tests).
- Core service/controller tests: PASSED (8 tests); API typecheck and source lint: PASSED.
- Web Core-client/action tests: PASSED (7 tests); full Web lint: PASSED; E2E TS config: PASSED.
- Full Web typecheck: BLOCKED by pre-existing generated `.next/types` imports for
  unrelated routes; no submittal source error was reported.
- Live PostgreSQL/RLS ACL verification, running Core API, browser execution, and
  real demo-account E2E: NOT RUN in this environment.

## Explicit limits

Binary uploads, document attachment linking, transmittal bundles, and plan-file
pinning remain separate storage/document-control slices. Existing Documents and
upload routes are preserved.
