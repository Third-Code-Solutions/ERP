# RFQ terminal-transition Nest adapter

Date: 2026-08-13

## Changed

- Added strict shared contracts for RFQ completion, cancellation, and the
  tenant-scoped transition result.
- Added authenticated NestJS endpoints for RFQ completion and cancellation.
- Added tenant-locked, audit-atomic transition authority with quote-coverage
  validation and terminal-state guards.
- Added a disabled-by-default Next.js cutover flag and Core API client for
  complete/cancel commands. Existing Server Action behavior remains the
  default.
- Added environment examples, HTTP/unit tests, and disposable database
  integration coverage.

## Verification

- PASS: shared contract tests, 5/5.
- PASS: API unit/HTTP suite, 48/48.
- PASS: API build and typecheck.
- PASS: web RFQ/Core API focused suite, 21/21.
- PASS: disposable PostgreSQL 17 + Redis 7.4.9 lane, 242/242 database tests,
  3/3 API database integrations, zero skips.
- NOT RUN: hosted deployment, hosted feature-flag enablement, or production
  migration. The rollout flag remains disabled by default.
