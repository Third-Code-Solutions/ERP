# M3.236 Project read/list protected local HTTP canary

## Scope

Extended the existing Nest project integration canary with protected read and
list requests. It covers tenant/project predicates, identity and capability
guards, bounded pagination, deterministic filters/order, search, and response
totals without opening either Web selector.

## Evidence

- Focused project API canary: 1/1 test passed.
- Root `pnpm test`: 173/173 files and 750/750 tests passed.
- Root typecheck, production build, and lint passed.
- Disposable database: 116 migrations; 149/149 suites and 370/370 tests;
  zero pending/skips.
- Disposable API: 66/66 suites and 49/49 tests; zero pending/skips.
- Schema-before/after SHA-256 unchanged:
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.

## Release boundary

This is local evidence only. No schema migration, Supabase SQL/data/Storage
change, Vercel/Railway deployment, provider setting, credential, or paid
action occurred. Keep `ERP_PROJECT_READS_VIA_API=false` and
`ERP_PROJECT_LISTS_VIA_API=false` with empty allowlists until hosted parity,
readiness, protected browser evidence, rollback, and spend approval exist.
