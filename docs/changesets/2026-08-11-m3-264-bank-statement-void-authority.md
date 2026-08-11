# M3.264 — Bank-statement void authority

Date: 2026-08-11
Status: source-only, locally verified; hosted/provider release blocked by
parity and spend gates

## Outcome

Nest Core now owns a fail-closed bank-statement void command:

`POST /v1/finance/reconciliation/:statementId/void`

The command requires `finance.manage_cash`, a strict reason body (3–500
trimmed characters), and an opaque `Idempotency-Key`. It re-authorizes the
tenant, locks the visible statement, calls the existing trusted PostgreSQL
void function, persists a force-RLS/service-role-only request result, and
writes semantic audit in one transaction. Replays return the durable result;
reuse for a different statement or payload conflicts. The selector and tenant
allowlist are false/empty by default. The existing Web action remains
unchanged, and Python/AI remains advisory-only.

## Changed files

- `packages/shared-types/src/erp-api/finance.ts`
- `packages/shared-types/src/erp-api/finance.test.ts`
- `packages/database/src/schema/enums.ts`
- `packages/database/src/schema/bank-statement-void-requests.ts`
- `packages/database/src/schema/index.ts`
- `packages/database/src/__tests__/bank-statement-void.test.ts`
- `supabase/migrations/20260812130000_bank_statement_void_workflow.sql`
- `apps/api/src/config/environment.ts`
- `apps/api/src/config/environment.spec.ts`
- `apps/api/src/finance/finance-reconciliation-workflow.pipe.ts`
- `apps/api/src/finance/finance-reconciliation-workflow.controller.ts`
- `apps/api/src/finance/finance-reconciliation-workflow.service.ts`
- `apps/api/integration/finance-reconciliation-workflow.http.integration.spec.ts`

## Verification

- Focused local PostgreSQL HTTP canary: PASS, 1/1.
- Root tests: PASS, shared 54/54 files and 327/327 tests; database 68/72
  files with 239 passed and 143 environment-skipped; Web 111/111 files and
  768/768 tests; API 173/173 files and 756/756 tests.
- Protected API integration: PASS, 55/55 files; 69 passed and two intentional
  Redis-restart skips.
- Typecheck, lint, production build: PASS.
- Database contract, managed-parity plan, release plan, Web/DB boundary,
  workflow references, actionlint, and provider-spend guard: PASS.

## Release boundary

The migration was applied only to the disposable local CI PostgreSQL
database. Managed Supabase remains at 55/122 migrations (67 pending) in 15
review batches. No hosted SQL/data, Storage, Railway/Vercel deployment,
provider setting, credential, or paid action changed. Keep the void selector
closed until isolated hosted replay, release identity, readiness, protected
browser, rollback, and spend evidence are approved.

Source evidence SHA: `04fdf12fb90ae30b97f0655ca2a37d6a720741f3`.
