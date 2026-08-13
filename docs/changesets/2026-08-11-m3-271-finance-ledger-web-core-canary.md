# M3.271 - Protected finance-ledger Web/Core browser canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added a dedicated Playwright proof for the real Next `/finance/ledger` page.
The loopback harness runs a random PostgreSQL tenant, the compiled Nest API,
Supabase-compatible auth/profile endpoints, and a request-recording Core proxy.
The Web selector and Core selector are enabled only for that tenant inside the
harness.

## Evidence

- Unauthenticated ledger access redirects to `/auth/login`.
- The browser renders both immutable posted lines and exact PHP totals.
- Account filtering causes a second Core request with the exact account ID.
- Every Core request carries the session bearer token and bounded query.
- Desktop/mobile overflow, console/page-error, and blocked external traffic
  checks pass.
- Browser proof: 1/1 PASS.
- Web unit suite: 113 files / 782 tests PASS.
- Protected API ledger canary: 1/1 PASS.
- Forced root test: 4 package tasks PASS.
- Root typecheck, lint, production build, provider-spend, Web/DB boundary,
  workflow refs, actionlint, gitleaks, database-release, and managed-parity
  plan gates PASS.

## Safety boundary

The harness uses disposable PostgreSQL and removes its random tenant in
`afterEach`, with a signal fallback. The cleanup bypass is scoped to that
fixture because posted journal lines are intentionally immutable. Final local
fixture count: zero. No hosted Supabase SQL/object, Vercel/Railway deployment,
provider setting, credential, or paid action changed. Source evidence:
`dc20c17`.

## Next action

Keep both ledger selectors false/empty. Reconcile hosted/source migration
parity, readiness, exact release identity, rollback, and spend evidence before
a tenant canary or provider action.
