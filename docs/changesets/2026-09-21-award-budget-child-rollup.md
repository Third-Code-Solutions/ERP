# WO-13 signed-BOM award budget child rollup

## Outcome

Signed-BOM award baseline creation now validates every BOM line before any
award-side effect and projects only positive-priced, non-group top-level rows
into the project budget. Attached `material_line` rows remain represented by
their classified `work_item` parent, so their costs cannot be counted twice;
missing or unresolved hierarchy rows fail closed while preserving the selected
top-level line IDs used by downstream references.

## Verification

- `node apps/web/node_modules/vitest/vitest.mjs run --config vitest.config.ts --pool=threads --maxWorkers=1 --reporter=verbose src/lib/operations/award-automation.test.ts` — PASSED (5 tests).
- `pnpm --config.engine-strict=false --filter @third-code-erp/web test -- src/lib/operations/award-automation.test.ts` — NOT USED for the final result; the repository's configured `forks` pool stalled under the available Node 24 runtime. The direct Vitest invocation above passed with a single-thread pool.
- `pnpm --config.engine-strict=false --filter @third-code-erp/web exec tsc --noEmit --pretty false` — PASSED (Node 24; repository requires Node 22).
- `pnpm --config.engine-strict=false exec eslint --max-warnings=0 --no-ignore apps/web/src/lib/operations/award-automation.ts apps/web/src/lib/operations/award-automation.test.ts` — PASSED.
- `git diff --check` — PASSED. Database-backed integration tests remain to be run by the parent CI environment.

## Recovery

Revert the award worker, focused tests, and this changeset together. No schema,
migration, or deployment change is included.
