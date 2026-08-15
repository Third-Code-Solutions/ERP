# Production audit repairs — 2026-08-15

## Completion state

PARTIALLY VERIFIED. Source, local tests, local production build, and the
read-only live public-surface contract pass. The patch is not deployed, so the
authenticated hosted journeys were not re-run against this code.

## Changed

- Added route metadata for project Progress, Weekly reports, and Variation
  Orders pages so the browser title is specific instead of falling back to
  `ABI OPS`.
- Corrected the Deliveries plural label from `deliveryies` to `deliveries`.
- Made the closed Cortex provider-spend canary explicit to administrators
  without changing the fail-closed tenant/provider gate.
- Restored both documented root commands:
  `pnpm test:production-surface` and `pnpm verify:production-surface`.
- Extended the project route walk and focused deliveries/Cortex assertions.
- Raised the Cortex entity HTTP-contract harness timeout to the same bounded
  30-second limit used by other Nest contract specs, avoiding a false local
  failure during slow Windows initialization.

## Verification

- PASS — `pnpm test:production-surface` (4/4).
- PASS — `pnpm verify:production-surface -- --url https://thirdcode-erp.vercel.app`
  (live read-only public surface; current revision `dpl_VnDwWUiG`).
- PASS — `pnpm --filter @third-code-erp/web test` (901 passed, 4 skipped).
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — `pnpm --filter @third-code-erp/web build` (85/85 static pages).
- PASS — `pnpm verify:type-safety` (1,422 source files).
- PASS — App Router boundary checks (116 pages).
- PASS — production-data-boundary unit checks (5/5).
- PASS — BUILD OPS invariant checks (7/7).
- PASS — `git diff --check`.

## Remaining boundary

- NOT RUN — authenticated browser re-test of the patched routes, because this
  working tree was not deployed.
- BLOCKED — cleanup of existing hosted `E2E_` records in the non-demo tenant;
  no production deletion or data mutation was authorized. The existing
  read-only production-boundary gate remains required before promotion.
- NOT CHANGED — intentionally closed provider canary, staged asset rollout,
  budget approval controls, empty finance queues, and roadmap-gated features.
