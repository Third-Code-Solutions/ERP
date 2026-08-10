# M3.235 Project-comment read authority

## Scope

Added the bounded Nest `GET /v1/projects/:projectId/comments` read authority
with a strict shared query/result contract, tenant/project predicates,
deterministic ordering, bounded pagination, and author projection. The Web
comments page has an exact-tenant, fail-closed Core adapter; the existing
direct query remains the compatibility path while the selector is disabled.

## Evidence

- Shared read contract: 2/2 tests passed.
- API controller: 6/6 tests passed.
- Protected HTTP canary: 1/1 test passed.
- Web Core client: 7/7 tests passed.
- Root `pnpm test`: 173/173 files and 750/750 tests passed.
- Root typecheck, production build, and lint passed.
- Disposable database: 116 migrations; 149/149 suites and 370/370 tests;
  zero pending/skips.
- Disposable API: 66/66 suites and 49/49 tests; zero pending/skips.
- Schema-before/after SHA-256 unchanged:
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.

## Release boundary

No schema migration was required. This is local evidence only. No Supabase
SQL/data/Storage change, Vercel/Railway deployment, provider setting,
credential, or paid action occurred. Keep
`ERP_PROJECT_COMMENT_READS_VIA_API=false` and its allowlist empty until hosted
parity, readiness, protected browser evidence, rollback, and spend approval
exist.
