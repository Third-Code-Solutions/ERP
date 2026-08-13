# M3.277 - Protected finance-cash Web/Core browser canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added a dedicated Playwright proof for the real Next `/finance/cash` page.
The loopback harness starts disposable PostgreSQL, the compiled Nest API with
cash reads enabled for one random tenant, Supabase-compatible auth/profile
endpoints, and a request-recording Core proxy.

## Evidence

- Unauthenticated access redirects to `/auth/login`.
- The authenticated page renders posted receipt/disbursement, draft, and
  reversed cash evidence with exact centavo KPI and table values.
- The proxy records one Core request with the session bearer, UUID request ID,
  and bounded `page=1&limit=500` query with all optional filters null.
- Row ordering, internal/reference labels, status amounts, and responsive
  desktop/mobile layout are asserted.
- Unexpected loopback contracts, unblocked console/page errors, and external
  font traffic are checked; final matching fixture count is zero.
- Browser proof: 1/1 PASS by direct config and package script.
- Web unit suite: 113 files / 782 tests PASS; root forced tests, typecheck,
  lint, production build, provider-spend, Web/DB boundary, workflow refs,
  actionlint, gitleaks, database-release, and managed-parity-plan gates PASS.

## Safety boundary

The harness uses random disposable local PostgreSQL data and cleans its tenant
through the explicit test endpoint plus process-signal fallback. Web/Core/API
cash selectors remain false/empty outside the harness. No hosted Supabase
SQL/object, Vercel/Railway deployment, provider setting, credential, or paid
action changed.

Source evidence: `afa659b`.

## Next action

Keep `ERP_FINANCE_CASH_READS_VIA_API=false` with an empty tenant list and
`ERP_FINANCE_CASH_READS_ENABLED=false` with an empty Core allowlist. Require
hosted/source parity, readiness, exact release identity, authenticated
production smoke, rollback, and spend evidence before opening one tenant. Do
not apply hosted SQL or trigger provider builds.
