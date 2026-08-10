# M3.233 Notifications protected local HTTP canary

## Scope

Added a source-only integration canary for the existing Nest notification
read-state authority. It uses the real identity/capability guards,
notification service, request correlation middleware, audit service, and a
transaction-bound disposable PostgreSQL client.

## Evidence

- Focused canary: 1/1 tests passed.
- Disposable database: 116 migrations; 149/149 suites and 370/370 tests;
  zero pending/skips.
- Disposable API: 64/64 suites and 48/48 tests; zero pending/skips.
- Schema-before/after SHA-256 unchanged:
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.

The canary covers missing authentication, tenant/recipient isolation,
cross-tenant exclusion, request-id propagation, malformed input, audited
`mark_read`/`mark_all_read`, terminal disabled-feature behavior, and rollback.

## Release boundary

This is local evidence only. No Supabase SQL/data/Storage change,
Vercel/Railway deployment, provider setting, credential, or paid action
occurred. Keep all Core selectors closed until hosted parity, readiness,
protected browser evidence, rollback, and spend approval exist.
