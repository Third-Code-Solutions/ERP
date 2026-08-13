# M3.65 — CRM opportunity detail read handoff

Date: 2026-08-05
Source commit: `3eb9e69ebfe4d078dc0061fe71ca4a09efe08572`
Provider: Railway production API only; Vercel intentionally untouched

## Scope

- Added the strict shared opportunity-detail result contract.
- Added Nest `GET /v1/crm/opportunities/:opportunityId` with explicit
  `opportunity.read` authorization and verified tenant scope.
- Repeated tenant predicates on account/project joins and PPRF, inspection,
  design, and change-request progress reads.
- Added a disabled Next adapter and tenant-safe legacy fallback; preserved the
  existing opportunity detail UI and copy.
- Added focused contracts, environment examples, and migration documentation.

## Validation

- Shared: 17 files, 176/176 tests.
- API: 67 files, 332/332 tests in the serial single-worker bounded run.
- Web: 77 files, 504/504 tests; focused adapter/query 89/89.
- Database: 41 files; 166 passed, 140 expected integration/RLS/Cortex skips.
- Workspace typecheck/lint, Nest build, Web production build (80/80 routes),
  and `git diff --check` passed.
- Initial concurrent API run had two unrelated 5-second timeouts; serial rerun
  passed without source changes.

## Release evidence

- GitHub `main` and `agent-02/third-code-erp-landing` both point to the source
  SHA under `kurtgav`.
- Railway deployment `e51c6641-5b68-443a-ac16-81bf3912531d` is `SUCCESS`, uses
  `apps/api/Dockerfile`, and starts `node apps/api/dist/main.js`.
- Live `/ready`: 200 (`database:ok`, `redis:ok`); `/health`: 200; unauthenticated
  opportunity detail: 401; startup logs map the new route.
- Supabase `aqqrtkmtcsfkbyyqxowv`: `ACTIVE_HEALTHY`, 55 hosted migrations vs 87
  source files; all inspected public tables have RLS enabled. No SQL/data
  mutation was made because this slice has no schema change and the ledger
  suffix is not yet reconciled.
- Vercel Git remains disconnected/disabled; no build or deployment was
  triggered.

## Rollback and next gate

Leave `ERP_OPPORTUNITY_READS_VIA_API=false` and its tenant allowlist empty, or
redeploy the previous successful Railway API source. No hosted state requires
repair. Before any canary or hosted migration, obtain recoverable Supabase
backup/dependency/audit evidence, replay the ordered ledger on disposable
PostgreSQL 17, prove protected browser behavior and rollback, and set an
explicit spend cap.
