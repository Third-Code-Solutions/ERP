# M3.276 - Protected finance-cash Core HTTP canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added a closed-by-default, opt-in HTTP proof for the Nest
`/v1/finance/cash-transactions` route. The disposable PostgreSQL fixture
creates two random tenants with cash accounts, business accounts, vendors,
posted, draft, and reversed cash evidence, then exercises the real controller,
JWT guard, capability guard, query pipe, and read service.

## Evidence

- Missing/unknown authentication returns 401; a viewer returns 403.
- Invalid from/to ranges return 400 and a disabled selector fails closed with
  503.
- Exact posted receipt/disbursement centavo aggregates and draft/posted/
  reversed counts are asserted.
- Bounded pagination, status, direction/date, and cash-account filters are
  asserted, including exact row values and ordering.
- A foreign tenant's cash account is invisible to tenant A; tenant B receives
  only its own draft evidence and aggregates.
- The outer transaction always rolls back; the final matching fixture count is
  zero.
- Focused HTTP canary: 1/1 PASS; API unit suite: 174 files / 760 tests PASS;
  root tests, typecheck, lint, production build, provider-spend, Web/DB
  boundary, workflow refs, actionlint, gitleaks, database-release, and
  managed-parity-plan gates PASS.

## Safety boundary

The integration suite is opt-in and requires `DATABASE_URL` plus
`ERP_API_INTEGRATION_EXPECTED=1`. It only uses disposable local PostgreSQL;
production selectors and tenant lists remain false/empty. No hosted Supabase
SQL/object, Vercel/Railway deployment, provider setting, credential, or paid
action changed.

Source evidence: pending source commit pin.

## Next action

Keep `ERP_FINANCE_CASH_READS_ENABLED=false` and its tenant list empty, and
keep `ERP_FINANCE_CASH_READS_VIA_API=false` with an empty tenant list. Add the
authenticated `/finance/cash` browser proof, then require hosted/source
parity, readiness, exact release identity, authenticated smoke, rollback, and
spend evidence before opening one tenant. Do not apply hosted SQL or trigger
provider builds.
