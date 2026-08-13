# M3.246 - Document intake protected HTTP canary

Date: 2026-08-10
Status: source-only milestone; hosted cutover closed

## Change

- Added the protected HTTP canary at
  `apps/api/integration/document-intake.http.integration.spec.ts`.
- Added the migration/Drizzle contract regression at
  `packages/database/src/__tests__/document-intake-workflow.test.ts`.
- Proved Core-owned tenant/project binding before the canonical document row,
  replay ledger, and semantic audit are committed.

## Evidence

- Focused HTTP canary: 1/1 PASS.
- Migration contract: 3/3 PASS.
- Root API: 173 files/751 tests PASS.
- Root Web: 111 files/768 tests PASS.
- Root shared types: 54 files/323 tests PASS.
- Root database: 64/68 files, 230/373 tests PASS, with 143 expected skips
  because no `DATABASE_URL` was supplied to the root command.
- Disposable PostgreSQL 17/Redis 7.4.9 lane: 117 migrations; database
  373/373 tests; API integration 42/42 files and 58/58 tests; zero skips.
- Typecheck 5/5, lint 2/2, and production build PASS.

## Release boundary

`ERP_DOCUMENT_INTAKE_WRITES_ENABLED=false` and
`ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS` remain empty. No schema migration,
hosted Supabase SQL/data, Vercel/Railway deployment, provider setting,
credential, or paid action changed. Before any hosted canary, reconcile hosted
parity, exact release identity/readiness, protected browser evidence, rollback,
audit-recovery tenant, and billing approval.

Implementation source-only commit/push SHA:
`ee358dcb164bcead2a54995a51f64d55016c7c7c`.
