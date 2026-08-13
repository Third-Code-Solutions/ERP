# API Vitest bootstrap timeout

## Scope

Make the NestJS API test runner deterministic when parallel workers compile
the HTTP contract suites.

## Change

- Added `apps/api/vitest.config.ts` with a 15-second test timeout and
  30-second hook timeout.

## Verification

- PASS `pnpm --filter @third-code-erp/api test` — 9 files, 44 tests.
- PASS `pnpm --filter @third-code-erp/api typecheck`.
- PASS `DATABASE_URL=local ERP_API_INTEGRATION_EXPECTED=1 pnpm --filter @third-code-erp/api test:integration` — 3 database journeys with rollback.
- PASS `pnpm --filter @third-code-erp/api build`.
- PASS direct local production artifact smoke: `/health` returned 200,
  `/ready` returned database/Redis ready, and unauthenticated
  `/v1/process/health` returned 401.
- PASS `scripts/ci/smoke-api.ps1` with local PostgreSQL 17 and Redis 7.4.9.
- PASS Chromium authenticated ABI OPS shell E2E 1/1; verified sidebar,
  organization label, breadcrumb, and zero browser errors.
- PASS Chromium viewer permission E2E 1/1; traversed the protected surface,
  including `/process`, with no console/page errors and explicit unavailable
  process-health behavior when the Core API is not configured.
- BLOCKED Docker container smoke: Docker CLI is installed but the local daemon
  did not respond.
