# BOM review resolution concurrency guards

## Outcome

Grain and location review resolutions now re-read the pending review and its
tenant-owned BOM line after acquiring the existing BOM row lock. Stale or
already-consumed reviews, missing line ownership, and locations deleted or
moved out of the project are rejected before any write or audit entry.

Line updates and review resolution updates both require exactly one affected
row. The review update retains its `status = 'pending'` compare-and-set
predicate; a lost CAS rolls back the line write, and audit before/after values
come from the locked current line snapshot.

Existing authorization, draft-only checks, parent validation, tenant scopes,
and action response errors remain unchanged.

## Verification

- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web test -- "src/app/(dashboard)/projects/[id]/bom/actions.test.ts"` (29/29).
- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec tsc --noEmit --pretty false`.
- PASSED: `pnpm --config.engine-strict=false exec eslint --max-warnings=0 "apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts"`.
- PASSED: `pnpm --config.engine-strict=false exec eslint --max-warnings=0 --no-warn-ignored "apps/web/src/app/(dashboard)/projects/[id]/bom/actions.test.ts"`.
- PASSED: `git diff --check`.
- Node 22.x is required by the repository; local verification uses Node
  24.16.0 with pnpm engine strictness disabled.

## Recovery

Reverting this action, test, and documentation change restores the previous review
resolution behavior. No migration or persisted-data change is included.
