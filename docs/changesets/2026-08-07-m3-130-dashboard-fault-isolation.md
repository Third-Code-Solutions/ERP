# M3.130 dashboard fault isolation

## Changed

- Added an explicit degraded result to `loadDashboardForRole`.
- Executive analytics failures now fall back to the existing authorized Today
  view and a visible status notice.
- Added regression tests for fallback success and preserved failure behavior.
- Added no fake KPI defaults, new database writes, or provider behavior.

## Validation

- Web tests: 89 files / 579 tests passed.
- Typecheck, TS-only lint, production build (81/81 routes), migration-file
  verification, Actionlint, Gitleaks, controlled-release (5/5), and spend
  guard (4/4) passed in serial order.
- Parallel build/typecheck output was discarded after a shared `.next` race;
  ordered validation is the authoritative result.

## Boundary

No Supabase SQL/data, Vercel build, Railway deployment, feature flag, or
tenant-data write occurred.
