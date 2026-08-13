# M3.243 Asset maintenance protected HTTP canary

## Scope

Add disposable protected HTTP evidence around existing Nest asset-maintenance
history creation and read authority:

- `POST /v1/assets/:assetId/maintenance`
- `GET /v1/assets/:assetId/maintenance`

## Evidence

- Real Supabase identity and `asset.read` /
  `asset.maintenance.manage` capability guards.
- Strict body and `Idempotency-Key` validation with disabled feature
  fail-closed behavior.
- Exact tenant/asset scope, cross-tenant concealment, history reads, replay,
  key conflict, semantic audit, forced-RLS/service-only table privileges, and
  rollback.
- Focused database plus HTTP canaries: 2/2 PASS. Root API 173/173 files and
  751/751 tests, shared 54/54 files and 323/323 tests, typecheck 5/5, lint
  2/2, production build 82/82 pages, disposable 117-migration lane with
  database 149/149 suites and 370/370 tests, and API integration 39/39 files
  and 55/55 tests all passed without skips.

## Release boundary

Source-only. No selector, schema, hosted Supabase state, Railway/Vercel
deployment, provider setting, credential, or paid action changed. Keep all
asset-maintenance flags and tenant lists false/empty until hosted parity,
readiness, protected browser evidence, rollback, exact SHA, and spend approval
are complete.
