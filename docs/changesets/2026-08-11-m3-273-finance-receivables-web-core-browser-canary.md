# M3.273 - Protected finance-receivables Web/Core browser canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added a dedicated Playwright proof for the real Next `/finance/receivables`
page. The loopback harness starts disposable PostgreSQL, the compiled Nest
API with receivables reads enabled for one random tenant, Supabase-compatible
auth/profile endpoints, and a request-recording Core proxy.

## Evidence

- Unauthenticated access redirects to `/auth/login`.
- The authenticated page renders two posted invoice rows, exact PHP balances,
  overdue/current KPI labels, and customer/project links from Core data.
- The proxy records one Core request with the session bearer, request ID, and
  bounded `page=1&limit=500` query; no direct browser database write is used.
- Unexpected loopback contracts, unblocked console/page errors, and external
  font traffic are checked; desktop and mobile overflow remain within one px.
- Browser proof: 1/1 PASS; final matching fixture count: zero.
- Existing finance-ledger browser proof: 1/1 PASS.
- Web unit suite: 113 files / 782 tests PASS.
- Root forced tests, typecheck, lint, production build, provider-spend,
  Web/DB boundary, workflow refs, actionlint, gitleaks, database-release, and
  managed-parity plan gates PASS.

## Safety boundary

The harness uses random disposable local PostgreSQL data and cleans its tenant
through the explicit test endpoint plus signal fallback. Web/Core/API
receivables selectors remain false/empty outside the harness. No hosted
Supabase SQL/object, Vercel/Railway deployment, provider setting, credential,
or paid action changed.

## Next action

Keep `ERP_FINANCE_RECEIVABLES_READS_VIA_API=false`, its tenant list empty,
`ERP_FINANCE_RECEIVABLES_READS_ENABLED=false`, and its Core tenant list empty.
Require hosted/source parity, readiness, exact release identity, authenticated
production smoke, rollback, and spend evidence before opening one tenant.
Do not apply hosted SQL or trigger provider builds.
