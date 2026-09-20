# Executive dashboard polish

## Summary

- Reframed the executive dashboard with a responsive command-center hero, live status chips, and permission-aware actions.
- Added a stronger KPI visual hierarchy with reusable metric icon treatments and improved operational/analytics section rhythm.
- Refined dashboard tables, alerts, conversion bands, forecast legends, and responsive loading skeletons without changing routes, query contracts, or authorization behavior.

## Verification

- `pnpm --config.engine-strict=false exec eslint --max-warnings=0 <changed dashboard files>`
- `pnpm --config.engine-strict=false --dir apps/web test -- src/components/dashboard`
- `pnpm --config.engine-strict=false --dir apps/web test`
- `pnpm --config.engine-strict=false --dir apps/web typecheck`
- `pnpm --config.engine-strict=false --dir apps/web build`
- `pnpm --config.engine-strict=false test:wo-18-contract`
- `pnpm --config.engine-strict=false test:abi-ops-brand`
- `pnpm --config.engine-strict=false test:type-safety`
- `pnpm --config.engine-strict=false test:app-router-boundaries`

All checks passed on Node 24.16.0 with pnpm's engine guard disabled; the repository's required runtime remains Node 22.x.
