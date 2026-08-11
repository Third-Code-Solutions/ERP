# M3.256 Journal Reverse HTTP Canary

## Scope

Added protected rollback-only HTTP evidence for the existing Core journal
reversal command. The canary exercises the real Nest controller/service,
JWT/capability guards, two tenants, finance/viewer roles, posted journal
fixtures, tenant-scoped PostgreSQL, and Redis-backed idempotency boundaries.

## Evidence

- Focused canary: 1/1 PASS on local PostgreSQL 17/Redis 7.4.9.
- API integration: 51/51 files, 65 tests PASS; two Redis-restart cases are
  explicit skips under the 15-second timeout.
- Typecheck, lint, production build, provider-spend, Supabase parity,
  database-release, Web/DB boundary, workflow action-reference, and actionlint
  gates PASS.
- Existing Core visibility preflight is verified before audit/request claim;
  no product source fix was required.
- No hosted SQL/data, Storage, Railway/Vercel deployment, provider setting,
  credential, or paid action changed.

## Safety boundary

Keep journal-reversal writes disabled and the tenant allowlist empty until
hosted parity, release identity, readiness, protected browser evidence,
rollback, and billing gates are independently reconciled.
