# Project RFI register

## Outcome

Added a clean-room project-level RFI register for construction execution correspondence. The feature is deliberately separate from the pre-Won inspection RFI register and keeps Core as the authority for reads and mutations.

## Changed areas

- Added tenant-scoped `project_rfis` schema/migration with composite tenant foreign keys, deterministic numbering, request-token uniqueness, optimistic versioning, restrictive client RLS, and append-only audit trigger.
- Added shared Zod contracts for list filters, create, answer, close, reopen, and result envelopes.
- Added Core API list/create/answer/close/reopen routes with transaction-time membership checks, tenant/project predicates, idempotent create replay, version conflicts, and semantic audit entries.
- Added authenticated `/projects/[id]/rfis` route with URL-persisted status/priority filters, pagination, accessible create/answer/close/reopen controls, loading/error states, and read-only role behavior.
- Added an opt-in Playwright role matrix for all seeded demo roles.

## Verification

- Database typecheck and static authority tests: PASSED (8 tests).
- Shared-types typecheck and project-RFI tests: PASSED (9 tests).
- Core API typecheck and project-RFI controller/service tests: PASSED (17 tests).
- Web project-RFI/Core-client tests: PASSED (7 tests).
- Web E2E TypeScript config check: PASSED.
- Focused Web source ESLint: PASSED.
- `git diff --check`: PASSED.
- Full Web typecheck: BLOCKED by pre-existing generated `.next/types` imports for unrelated routes; no project-RFI source error was reported.
- Live PostgreSQL/RLS ACL verification, running Core API, browser execution, and real all-role E2E: NOT RUN in this environment.

## Follow-up

The member-picker/assignee directory, attachments, submittals/transmittals, schedule links, and CDE document revision workflow remain separate slices. The opt-in E2E requires `E2E_PROJECT_RFI_AUTH=1` and `E2E_PROJECT_ID`.
