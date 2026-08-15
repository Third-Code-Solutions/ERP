# Production evidence reconciliation — 2026-08-16

## Documentation correction

Updated the canonical deployment and database-release guidance to reflect the
current read-only provider-source plan at `b742c5d5`: PostgreSQL 17, 144/144
migrations applied, zero pending migrations, and zero duplicate Purchase Order
groups. Historical 55/124 findings remain in dated records for traceability.

## Current release boundary

- BLOCKED — the production-data scan still reports two E2E-prefixed rows under
  the non-demo tenant `e2e-qa-20260513-foreign`; no production data was
  changed.
- BLOCKED — the guarded GitHub workflow still lacks `VERCEL_TOKEN`,
  `RAILWAY_TOKEN`, and `SUPABASE_ACCESS_TOKEN`.
- NOT RUN — migrations, provider deployment, and authenticated post-deploy E2E
  remain correctly gated behind those checks.

## Verification

- PASS — read-only provider-source planner: 144/144, PostgreSQL 17, zero
  pending migrations, zero duplicate PO groups.
- PASS — repository `main` is clean and synchronized with `origin/main`.
