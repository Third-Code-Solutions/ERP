# M3.234 Project-comment protected local HTTP canary

## Scope

Added a source-only integration canary for the existing Nest project-comment
create/delete authority. It uses the real identity/capability guards,
idempotent services, request correlation middleware, audit service, and a
transaction-bound disposable PostgreSQL client.

## Evidence

- Focused canary: 1/1 tests passed.
- Disposable database: 116 migrations; 149/149 suites and 370/370 tests;
  zero pending/skips.
- Disposable API: 66/66 suites and 49/49 tests; zero pending/skips.
- Schema-before/after SHA-256 unchanged:
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.

The canary covers authentication and capability denial, tenant/project
isolation, mention resolution, idempotent replay/conflict, request-id
propagation, audited create/delete, disabled-tenant behavior, and rollback.

## Release boundary

This is local evidence only. No Supabase SQL/data/Storage change,
Vercel/Railway deployment, provider setting, credential, or paid action
occurred. Keep all Core selectors closed until hosted parity, readiness,
protected browser evidence, rollback, and spend approval exist.
