# QA/QC hold points and IWR

## Outcome

Added the first Core-authoritative QA/QC execution slice. Projects now have a
tenant-scoped inspection-work-request register with hold/witness classification,
plan references, versioned draft editing, and an auditable lifecycle:
planned → ready → submitted → accepted or rejected.

## Changed areas

- Added `quality_hold_points` schema/migration with composite tenant foreign keys,
  lifecycle metadata checks, forced RLS, revoked client privileges, accepted-state
  immutability, and database audit trigger.
- Added strict shared Zod contracts for bounded filters, create/update commands,
  transitions, and result envelopes.
- Added Core list/create/update/ready/submit/accept/reject routes with membership
  checks inside transactions, idempotent create replay, optimistic concurrency,
  assignment tenant validation, and semantic audit events.
- Added project `/quality` route with URL filters, capability-aware forms,
  responsive read-only role view, loading/error states, and Manila-local dates.
- Added opt-in Playwright role matrix for seeded demo roles.

## Verification

- Shared-types typecheck and quality/authorization tests: PASSED (9 tests).
- Database typecheck and migration authority tests: PASSED (4 tests).
- Core API typecheck, source lint, and quality service/controller/protected tests:
  PASSED (12 tests).
- Web quality Core-client/action tests: PASSED (7 tests).
- Web source lint and E2E TypeScript config check: PASSED.
- Full Web typecheck: BLOCKED by pre-existing generated `.next/types` imports for
  unrelated routes; no quality source error was reported.
- Live PostgreSQL/RLS ACL verification, running Core API, browser execution, and
  real all-role E2E: NOT RUN in this environment.

## Explicit limits

Attachments, plan binary/document pinning, and automatic punchlist creation remain
separate follow-on work. The existing punchlist surface is preserved unchanged.
