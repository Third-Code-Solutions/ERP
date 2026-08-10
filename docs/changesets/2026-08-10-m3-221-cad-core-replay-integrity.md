# M3.221 Disposable CAD Core replay integrity

## Change

Strengthened the CAD database integration fixture with exact worker-contract
result parity, exact 65,000-cent totals, document-owned replacement, one
idempotency record on replay, zero draft BOMs, cross-tenant rejection, and
outer-transaction rollback assertions.

## Evidence

- Disposable PostgreSQL 17/Redis 7.4.9 lane: 116 migrations applied.
- Database tests: 149 suites, 370/370 tests passed, zero skips.
- Focused CAD database integration: 1/1 passed.
- Schema before/after SHA-256 matched
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.
- Redis emitted known memory-overcommit warning; lane still passed.

No Supabase, Vercel, Railway, deployment, or paid action occurred.

## Open gate

This is strict worker-contract/Core evidence only. Run actual Web parser output
through protected Web/Core HTTP in disposable runtime before any canary.
