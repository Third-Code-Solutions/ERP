# M3.231 Today read authority

## Scope

- Added shared `TodayQuery` and `TodayCommandCenterResult` contracts.
- Added Nest `GET /v1/today` with tenant/assignee scoping, Manila server-time
  boundaries, bounded task/project reads, and `today.read` capability policy.
- Added Web Core adapter and disabled-by-default exact tenant canary.
- Preserved the existing direct dashboard query as the compatibility path.

## Validation

- Shared Today contract: 2/2 tests.
- API Today contract: 5 files, 8 tests; standalone API suite 173/173 files,
  749/749 tests.
- Web Today adapter: 3/3 tests; Web suite 110/110 files, 759/759 tests.
- Root typecheck, sequential lint, and production build: PASS.
- Disposable lane: 116 migrations; DB 149/149 files, 370/370 tests, zero
  skips; API integration 30/30 files, 45/45 tests; schema hash unchanged at
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.
- A concurrent root test attempt had 8 load-sensitive 5-second HTTP timeouts;
  a bounded standalone rerun passed all API tests.

## Operations boundary

No Supabase SQL/data/Storage mutation, migration apply/repair, Vercel/Railway
deployment, provider setting, credential change, or paid action occurred.
Keep `ERP_TODAY_READS_VIA_API` disabled until protected canary evidence exists.
