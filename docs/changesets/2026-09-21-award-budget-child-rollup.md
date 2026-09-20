# WO-13 signed-BOM award budget child rollup

## Outcome

Signed-BOM award baseline creation and BOM header recalculation now share one
top-level commercial-line projection. Attached `material_line` rows remain
represented by their classified `work_item` parent, so persisted TCV, raw cost,
GP, down-payment invoice, and project budget lines cannot count the child twice.
Award loading validates every BOM line before side effects; missing or
unresolved hierarchy rows fail closed while preserving selected top-level IDs.

## Verification

- `pnpm --config.engine-strict=false exec vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 --reporter=verbose src/lib/operations/award-automation.test.ts` — PASSED (6 tests), including budget-line and down-payment amount assertions.
- `node ../../apps/web/node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=1 --reporter=verbose src/bom/__tests__/calculations.test.ts` — PASSED (36 tests), including shared parent/material TCV, raw-cost, and GP rollup assertions.
- `pnpm --config.engine-strict=false exec vitest run --config vitest.config.ts --pool=threads --maxWorkers=1 --reporter=verbose src/app/(dashboard)/projects/[id]/bom/actions.test.ts` — PASSED (29 tests).
- `pnpm --config.engine-strict=false --filter @third-code-erp/web test -- src/lib/operations/award-automation.test.ts` — NOT USED for the final result; the repository's configured `forks` pool stalled under the available Node 24 runtime. The direct Vitest invocation above passed with a single-thread pool.
- `pnpm --config.engine-strict=false --filter @third-code-erp/web exec tsc --noEmit --pretty false` — BLOCKED by pre-existing workspace dependency/type failures under the available Node 24/junction setup; no new errors were reported in the changed award/helper paths before the baseline cascade.
- `pnpm --config.engine-strict=false exec tsc --noEmit --pretty false` (shared-types) — PASSED.
- `pnpm --config.engine-strict=false exec eslint --max-warnings=0 --no-ignore` (all changed TypeScript files) — PASSED.
- `git diff --check` — PASSED. Database-backed integration tests remain to be run by the parent CI environment.

## Recovery

Revert the award worker, shared commercial-line helper, focused tests, and this
changeset together. No schema, migration, or deployment change is included.
