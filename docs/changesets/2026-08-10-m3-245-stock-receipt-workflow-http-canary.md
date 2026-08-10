# M3.245 — Stock Receipt post/reverse protected HTTP canary

Date: 2026-08-10
Status: source-only milestone; hosted cutover closed

## Change

- Added the protected HTTP canary at
  `apps/api/integration/stock-receipt-workflow.http.integration.spec.ts`.
- Added a tenant-scoped receipt preflight before workflow-request claiming in
  `apps/api/src/inventory/stock-receipt-workflow.service.ts` for both post and
  reverse commands.
- The preflight fixes the observed cross-tenant composite-FK 500 and preserves
  the concealed 404 boundary.

## Evidence

- Focused canaries: 3/3 PASS.
- Root API: 173 files/751 tests PASS.
- Root Web: 111 files/768 tests PASS.
- Root shared types: 54 files/323 tests PASS.
- Root database: 63/67 files, 227/370 tests PASS, with 143 expected skips
  because no `DATABASE_URL` was supplied to the root command.
- Disposable PostgreSQL 17/Redis 7.4.9 lane: 117 migrations; database
  149/149 suites and 370/370 tests; API integration 41/41 files and 57/57
  tests; zero skips.
- Typecheck 5/5, lint 2/2, and production build PASS.

## Release boundary

Both post/reverse feature flags and tenant lists remain false/empty. No schema
migration, hosted Supabase SQL/data, Vercel/Railway deployment, provider
setting, credential, or paid action changed. Before any hosted canary, reconcile
hosted parity, exact release identity/readiness, protected browser evidence,
rollback, audit-recovery tenant, and billing approval.

Source-only commit/push SHA: to be filled after commit and push.
