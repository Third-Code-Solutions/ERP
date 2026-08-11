# M3.278 - Protected bank-reconciliation Web/Core browser canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added a dedicated Playwright proof for the real Next `/finance/reconciliation`
page. The loopback harness starts disposable PostgreSQL, the compiled Nest API
with reconciliation reads enabled for one random tenant,
Supabase-compatible auth/profile endpoints, and a request-recording Core
proxy.

## Evidence

- Unauthenticated access redirects to `/auth/login`.
- The authenticated page renders draft, reconciled, and voided statements with
  exact references, closing balances, match progress, statuses, and KPI cards.
- The proxy records one Core request with the session bearer, UUID request ID,
  and bounded `limit=500` query.
- Unexpected loopback contracts, unblocked console/page errors, and external
  font traffic are checked; desktop and mobile overflow remain within one px.
- Browser proof: 1/1 PASS by direct config and package script.
- Web unit suite: 113 files / 782 tests PASS; root forced tests, typecheck,
  lint, production build, provider-spend, Web/DB boundary, workflow refs,
  actionlint, gitleaks, database-release, and managed-parity-plan gates PASS.
- Final matching fixture count: zero.

## Safety boundary

The harness uses random disposable local PostgreSQL data and cleans its tenant
through the explicit test endpoint plus process-signal fallback. Workflow
authority is not claimed by this browser fixture; the existing Core HTTP
canary remains authoritative for protected reconciliation operations.
Web/Core/API reconciliation selectors remain false/empty outside the harness.
No hosted Supabase SQL/object, Vercel/Railway deployment, provider setting,
credential, or paid action changed.

Source evidence: `6092fa5`; fixture-scope hardening: `9e498d5`.

## Next action

Keep `ERP_FINANCE_RECONCILIATION_READS_VIA_API=false` with an empty tenant list
and `ERP_FINANCE_RECONCILIATION_READS_ENABLED=false` with an empty Core
allowlist. Require hosted/source parity, readiness, exact release identity,
authenticated production smoke, rollback, and spend evidence before opening
one tenant. Do not apply hosted SQL or trigger provider builds.
