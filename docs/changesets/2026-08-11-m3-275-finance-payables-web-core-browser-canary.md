# M3.275 - Protected finance-payables Web/Core browser canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added a dedicated Playwright proof for the real Next `/finance/payables` page.
The loopback harness starts disposable PostgreSQL, the compiled Nest API with
payables reads enabled for one random tenant, Supabase-compatible auth/profile
endpoints, and a request-recording Core proxy.

## Evidence

- Unauthenticated access redirects to `/auth/login`.
- The authenticated page renders two posted supplier bills, one draft bill,
  exact PHP open/payable amounts, open-payable/past-due/draft KPIs, and five
  aging cards.
- The proxy records one Core request with the session bearer, UUID request ID,
  and bounded `page=1&limit=500` query with no unintended dimensions.
- Dynamic posted internal bill numbers and the draft vendor bill number are
  rendered; table ordering and status/open amounts are asserted.
- Unexpected loopback contracts, unblocked console/page errors, and external
  font traffic are checked; desktop and mobile overflow remain within one px.
- Browser proof: 1/1 PASS; final matching fixture count: zero.
- Web unit suite: 113 files / 782 tests PASS; root forced tests, typecheck,
  lint, production build, provider-spend, Web/DB boundary, workflow refs,
  actionlint, gitleaks, database-release, and managed-parity-plan gates PASS.

## Safety boundary

The harness uses random disposable local PostgreSQL data and cleans its tenant
through the explicit test endpoint plus process-signal fallback. Web/Core/API
payables selectors remain false/empty outside the harness. No hosted Supabase
SQL/object, Vercel/Railway deployment, provider setting, credential, or paid
action changed.

Source evidence: `b515034`.

## Next action

Keep `ERP_FINANCE_PAYABLES_READS_VIA_API=false` with an empty tenant list and
`ERP_FINANCE_PAYABLES_READS_ENABLED=false` with an empty Core allowlist.
Require hosted/source parity, readiness, exact release identity,
authenticated production smoke, rollback, and spend evidence before opening
one tenant. Do not apply hosted SQL or trigger provider builds.
