# ABI OPS brand regression guard

Date: 2026-08-13

## Changed

- Replaced stale local seed and CI demo-tenant identifiers with `abi-ops-local`
  and `local-admin@abiops.invalid`.
- Updated the implementation prompt and generated weekly-report lockup to use
  ABI OPS copy and the `A` mark.
- Added `scripts/verify-abi-ops-brand.mjs` plus Node tests for active source,
  configuration, seed, and built-web legacy identity detection.
- Added the guard to hosted CI and self-hosted verification workflows.
- Updated operations documentation to mark the inert procurement adapter as
  source-complete and disabled pending M1 controls.

## Verification

- PASS: ABI OPS brand contract, 1,789 active/build text files scanned.
- PASS: focused web branding/report tests, 2/2.
- PASS: web regression, 362 passed, 3 environment-gated skips.
- PASS: shared-types 130/130; API unit/E2E contract 51/51.
- PASS: database disposable lane, 264/264; API database integration 3/3.
- PASS: Next production build, 80 routes.
- PASS: local production Chromium smoke, 4/4.
- PASS: actionlint, workflow action refs, invariant tests, and gitleaks.
- NOT RUN: hosted deployment, hosted feature-flag enablement, or production
  migration. Provider release planner remains blocked by migration divergence
  and duplicate Purchase Order data; no hosted SQL was executed.
