# Finance navigation and UX polish

Date: 2026-08-15

## Summary

- Finance sidebar routes now resolve one most-specific active destination on nested pages.
- Collapsed sidebar links expose their labels and descriptions through native hover titles.
- Finance routes share a compact, responsive local navigation rail for Finance, Receivables, Payables, Cash, and Reconciliation.
- Finance routes now have segment-level loading skeletons and safe retry/recovery UI.
- No accounting posting, allocation, reconciliation, database, or route contract was changed.

## Verification

- PASS: targeted Finance and sidebar navigation tests, 20 assertions.
- PASS: web TypeScript lint/typecheck.
- PASS: isolated web production build.
- PASS: full web Vitest suite with a 20-second per-test timeout: 143 files passed, 898 tests passed, 4 intentional skips.
- BLOCKED: Finance browser canary could not start because disposable Postgres at `127.0.0.1:54322` is unavailable and Docker Desktop is stopped.

## Rollback

Revert the files in this changeset. The existing Finance routes and accounting contracts remain unchanged.
