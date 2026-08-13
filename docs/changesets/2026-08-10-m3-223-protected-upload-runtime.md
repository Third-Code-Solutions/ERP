# M3.223 - Disposable protected upload-complete runtime

## Delivered

- Test-only API Vitest auth aliases for the cross-package Web route harness.
- Disposable integration around the real Web `/api/upload/complete` route,
  real DXF parser, protected Nest Core HTTP, and disposable PostgreSQL.
- Successful document recording and tenant-scoped scope totals.
- Terminal Core-unavailable behavior with zero compatibility-writer scope rows.

## Evidence

- Self-hosted PostgreSQL 17/Redis 7.4.9 lane: 116 migrations.
- Database tests: 370/370, no skips.
- API integration: 30/30 files, 45/45 tests; upload runtime 1/1.
- Storage/session were bounded doubles; no hosted provider or deployment was
  touched.

## Follow-up

Provider-neutral Storage contract and controlled browser upload evidence remain
open. Keep production selectors closed under the spend lock.
