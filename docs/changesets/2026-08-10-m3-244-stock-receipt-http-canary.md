# M3.244 Stock Receipt protected HTTP canary

## Scope

Add disposable protected HTTP evidence around existing Nest Stock Receipt
draft creation:

- `POST /v1/inventory/stock-receipts`

## Evidence

- Real Supabase identity and `inventory.manage` capability guard.
- Strict receipt body and `Idempotency-Key` validation with disabled-feature
  fail-closed behavior.
- Exact tenant/PO/material/UOM/warehouse scope, cross-tenant concealment,
  replay, key conflict, receipt-line persistence, semantic audit, RLS/browser
  privilege boundaries, and rollback.
- Focused database plus HTTP canaries: 2/2 PASS. Root API 173/173 files and
  751/751 tests, shared 54/54 files and 323/323 tests, typecheck 5/5, lint
  2/2, production build 82/82 pages, disposable 117-migration lane with
  database 149/149 suites and 370/370 tests, and API integration 40/40 files
  and 56/56 tests all passed without skips.

## Release boundary

Source-only. No selector, schema, hosted Supabase state, Railway/Vercel
deployment, provider setting, credential, or paid action changed. Keep the
receipt-create flag and tenant list false/empty until hosted parity, readiness,
protected browser evidence, rollback, exact SHA, and spend approval are
complete. Current source migration enables RLS and revokes browser privileges
for the create-request table but does not force RLS; hardening requires a
separate reviewed migration.
