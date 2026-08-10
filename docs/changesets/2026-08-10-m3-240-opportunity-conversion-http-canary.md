# M3.240 Won-opportunity project conversion protected local HTTP canary

## What changed

- Added `apps/api/integration/opportunity-conversion.http.integration.spec.ts`.
- Exercised the real Nest `POST /v1/crm/opportunities/:opportunityId/convert-to-project`
  boundary with identity, capability, transaction, idempotency, audit, and
  rollback behavior.
- Proved atomic project creation and opportunity backlink, twelve-item
  pre-construction checklist creation, dependency-aware SLA clocks, role
  notifications, semantic audit rows plus database-trigger rows, replay, key
  reuse conflict, tenant concealment, and rollback.

## Validation

- Focused canary: 1/1 PASS.
- Root `pnpm test`: 173 files / 750 tests PASS.
- Root typecheck: 5/5 tasks PASS.
- Root lint: 2/2 tasks PASS.
- Production build: PASS (Next.js 15.5.18 and Nest webpack).
- Disposable PostgreSQL 17 / Redis 7.4.9 lane: 116 migrations; database
  149/149 suites and 370/370 tests; API integration 72/72 suites and 52/52
  tests; zero skips.
- Direct canary rerun against the disposable runtime: 1/1 PASS.
- Web/DB boundary, provider-spend, managed-Supabase parity, workflow-reference,
  actionlint, and `git diff --check` guards: PASS.

No schema migration, hosted Supabase write, Vercel/Railway deployment,
provider setting, credential, or paid action occurred. The server write flags,
Web selector, and tenant allowlists remain fail-closed; this is source-only
local evidence.
