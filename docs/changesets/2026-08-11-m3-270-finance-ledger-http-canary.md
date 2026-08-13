# M3.270 - Protected finance-ledger Core HTTP canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added `apps/api/integration/finance-ledger.http.integration.spec.ts`.
The opt-in suite starts the real Nest finance-ledger controller/service with
JWT and capability guards over a transaction-bound database. It seeds two
random tenants, creates draft journals, posts them through
`public.post_journal_entry`, reads the immutable lines, then forces an outer
rollback.

## Evidence

- 401 for missing/unknown authentication and 403 for a viewer.
- 503 when the Core selector is disabled.
- Exact tenant and account filtering, centavo totals, and page 1/page 2
  pagination.
- Foreign-tenant account is invisible and the seeded tenant is absent after
  rollback.
- Focused ledger HTTP canary: 1/1 PASS.
- Related journal HTTP canary: 1/1 PASS.
- API suite: 174 files / 760 tests PASS.
- Forced root test: 4 package tasks PASS.
- Root typecheck, lint, production build, provider-spend, Web/DB boundary,
  workflow refs, actionlint, gitleaks, database-release, and managed-parity
  plan gates PASS.

## Safety boundary

The integration suite runs only when `DATABASE_URL` is set and
`ERP_API_INTEGRATION_EXPECTED=1`; this run used local disposable PostgreSQL.
`ERP_FINANCE_LEDGER_READS_ENABLED` and its tenant allowlist remain closed in
production. No hosted Supabase SQL/object, Vercel/Railway deployment, provider
setting, credential, or paid action changed. Source evidence: `d5d4277`.

## Next action

Keep the selector closed. Reconcile hosted/source migration parity, readiness,
exact release identity, rollback, and spend evidence before a tenant canary or
provider action.
