# M3.247 - Document-processing command authority

Date: 2026-08-10
Status: source-only milestone; hosted cutover closed

## Change

- Added the protected HTTP canary at
  `apps/api/integration/document-processing.http.integration.spec.ts`.
- Changed `DocumentProcessingController` to enqueue only newly-created jobs;
  idempotent queued replays return durable status without another BullMQ call.
- Changed `DocumentProcessingService` to write one semantic
  `document_processing_job` create audit event inside the creation transaction.
- Added a unit regression for queued replay transport deduplication.

## Evidence

- Focused HTTP canary: 1/1 PASS; controller contract: 6/6 PASS; processing
  service/database/processor checks: 13/13 PASS.
- API integration: 43/43 files and 59/59 tests PASS.
- Root API: 173 files/752 tests PASS.
- Root Web: 111 files/768 tests PASS.
- Root shared types: 54 files/323 tests PASS.
- Root database: 64/68 files, 230/373 tests PASS, with 143 expected skips
  because the root command had no `DATABASE_URL`.
- Disposable PostgreSQL 17/Redis 7.4.9 lane: 117 migrations; 151/151 suites
  and 373/373 database tests PASS with zero skips.
- Typecheck 5/5, lint 2/2, and production build PASS.

## Release boundary

Keep the document-processing jobs, worker bridge, evidence commit, and draft
BOM flags disabled with empty tenant lists. No schema migration, hosted
Supabase SQL/data, Vercel/Railway deployment, provider setting, credential, or
paid action changed. Before any hosted canary, reconcile hosted parity, exact
release identity/readiness, protected browser evidence, rollback,
audit-recovery tenant, and billing approval.

Implementation source-only commit/push SHA:
`05b727eacb4b6ade52cde91f111a01d84712386e`.
