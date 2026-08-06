# M3.129 self-hosted free database lane

## Changed

- Ran the approved WSL PostgreSQL 17.10/Redis 7.4.9 replay lane.
- Applied all 97 migrations plus deterministic seed from zero.
- Verified the catalog, 51 database test files / 324 tests with zero skips,
  Nest transaction integration, and unchanged schema dumps.
- Retried pinned Supabase CLI `2.109.1`; Docker shadow-database availability
  remains an explicit open gate.

## Validation

- `scripts/ci/run-wsl1-database-lane.ps1` - pass.
- `scripts/ci/stop-wsl1-database-lane.ps1` - cleanup pass.
- `npm exec --yes supabase@2.109.1 -- db diff --db-url ...` - stopped before
  inspection because `dockerDesktopLinuxEngine` is unavailable.

## Boundary

No hosted Supabase SQL/data, Vercel build, Railway deployment, feature flag,
or tenant-data write occurred. The next action is the pinned CLI diff in the
approved Docker/CI lane.
