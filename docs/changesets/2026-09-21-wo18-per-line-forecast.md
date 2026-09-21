# WO-18 — Preserve per-line forecast in project cost and management rollups

## Scope

- Added an optional explicit forecast input to the shared project cost snapshot,
  retaining the aggregate max fallback for existing callers.
- Passed the WO-17 cost-control forecast rollup into the project cost page and
  management dashboard GP-erosion alert path.
- Added regression coverage for mixed lines where 100k/200k and 100k/0
  commitment/actual pairs roll up to 300k forecast, producing 100k GP and
  2,500 bps danger erosion on a 400k TCV with 200k original GP.
- Preserved tenant predicates, authorization gates, posted supplier-bill
  actual lineage, and integer-centavo calculations.

## Verification

- PASS — focused shared-types and cost-control tests: 2 files, 17 tests.
- PASS — focused project cost page and management dashboard tests: 2 files,
  3 tests.
- PASS — `packages/shared-types` typecheck.
- PASS — `apps/web` typecheck.
- PASS — WO-17 and WO-18 contract verification scripts.
- PASS — `git diff --check`.
- BLOCKED — focused ESLint invocation; the available workspace install is
  missing `eslint-plugin-react-hooks` from its dependency links.

## Limitations

- No schema, migration, API route, authorization, audit, or hosted data was
  changed. This branch was not merged or deployed.
