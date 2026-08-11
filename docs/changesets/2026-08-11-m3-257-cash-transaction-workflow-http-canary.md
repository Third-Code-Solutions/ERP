# M3.257 — Cash transaction workflow HTTP canary

Date: 2026-08-11

## Change

Added a rollback-only integration canary for the Core cash transaction post
and reverse commands. The test uses real Nest guards and controllers,
transaction-bound PostgreSQL, two tenants, finance/viewer identities, and a
real supplier-bill allocation.

## Evidence

- Focused canary: 1/1 PASS.
- API integration: 52/52 files, 66 passed, 2 explicit Redis-restart skips.
- API typecheck, root lint, production build, and policy gates: PASS.
- Source commit: `ff7e683ca2ef5baf748646e6cc13a89c43d20d3e`.

## Operational boundary

No hosted Supabase SQL/data, Storage, Railway/Vercel deployment, credentials,
provider settings, or paid action changed. Keep
`ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED=false` and its tenant allowlist
empty until hosted parity, readiness, browser, rollback, and billing gates
are separately reconciled.
