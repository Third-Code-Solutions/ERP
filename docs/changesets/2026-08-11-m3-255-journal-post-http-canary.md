# M3.255 Journal Post HTTP Canary

## Scope

Added protected rollback-only HTTP evidence for the existing Core manual
journal-post command. The canary exercises the real Nest controller/service,
JWT/capability guards, two tenants, finance/viewer roles, tenant-scoped
PostgreSQL, and Redis-backed idempotency boundaries.

## Evidence

- Focused canary: 1/1 PASS on local PostgreSQL 17/Redis 7.4.9.
- API integration: 50/50 files, 64 tests PASS; two Redis-restart cases are
  explicit skips under the 15-second timeout.
- Typecheck, lint, production build, provider-spend, Supabase parity,
  database-release, Web/DB boundary, workflow action-reference, and actionlint
  gates PASS.
- The service now preflights the tenant-scoped journal before audit or request
  claim, preventing a cross-tenant composite-FK 500.
- No hosted SQL/data, Storage, Railway/Vercel deployment, provider setting,
  credential, or paid action changed.

## Safety boundary

Keep journal-post writes disabled and the tenant allowlist empty until hosted
parity, release identity, readiness, protected browser evidence, rollback, and
billing gates are independently reconciled.
