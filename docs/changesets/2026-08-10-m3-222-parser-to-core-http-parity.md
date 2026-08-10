# M3.222 Disposable actual parser-to-Core HTTP parity

## Change

Added a test-only API Vitest resolver and cross-package integration harness.
The harness runs the real Web DXF parser on `mep-sample.dxf`, sends its strict
worker response through the server-only Web adapter to a protected Nest HTTP
controller, and commits against transaction-bound disposable PostgreSQL. The
Storage/session boundary is a bounded test double.

## Evidence

- Unauthenticated Core HTTP returned 401.
- Authenticated parser-to-Core commit passed.
- Idempotent replay returned the same result.
- Exact parsed count/totals, document-only replacement, manual and
  cross-tenant preservation, cross-tenant 404, zero draft BOMs, audit actor,
  and outer rollback passed.
- Disposable PostgreSQL 17/Redis 7.4.9 lane: 116 migrations.
- Database tests: 370/370 passed, zero skips.

Redis emitted the known memory-overcommit warning. No Supabase, Vercel,
Railway, deployment, or paid action occurred.

## Open gate

This does not certify hosted Storage, the protected Next upload route, browser
behavior, or a production canary. Run `/api/upload/complete` in disposable
runtime next.
