# Daily site diary

## Outcome

Added a clean-room daily site diary for execution projects. It records one tenant-scoped entry per project calendar day, supports draft editing and explicit submission, and preserves submitted records as immutable evidence.

## Changed areas

- Added `site_diary_entries` schema/migration with composite tenant foreign keys, one-project-day and client-request uniqueness, version/submit metadata checks, forced RLS, client privilege revocation, submitted-entry immutability trigger, and audit trigger.
- Added shared Zod contracts for bounded date/status filters, create/update/submit commands, and strict result envelopes.
- Added Core API list/create/update/submit routes with transaction-time membership checks, idempotent create replay, project/date conflicts, optimistic concurrency, submit validation, and semantic audit events.
- Added authenticated `/projects/[id]/diary` route with URL-persisted filters, loading/error states, capability-gated create/edit/submit forms, PH timezone date handling, and read-only role behavior.
- Added opt-in Playwright role visibility matrix for all seeded demo roles.

## Verification

- Shared-types typecheck and site-diary/authorization tests: PASSED (12 tests).
- Database typecheck and migration authority tests: PASSED (8 tests).
- Core API typecheck and diary/project-RFI tests: PASSED (22 tests).
- Web diary/Core-client/action tests: PASSED (7 tests across two files).
- Focused Web source ESLint: PASSED.
- Web E2E TypeScript config check: PASSED.
- `git diff --check`: PASSED (whitespace warnings only for pre-existing CRLF-normalization candidates).
- Full Web typecheck: BLOCKED by pre-existing generated `.next/types` imports for unrelated routes; no diary source error was reported.
- Live PostgreSQL/RLS ACL verification, running Core API, browser execution, and real all-role E2E: NOT RUN in this environment.

## Explicit limits

Attachments, GPS, timesheets, schedule links, HSE incident investigations, and QA/QC hold points remain separate slices.
