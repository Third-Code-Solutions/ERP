# Authentication boundary hardening — 2026-08-15

## Completion state

PARTIALLY VERIFIED. A live unauthenticated route walk identified four
tenant-scoped browser surfaces that were not included in the shared middleware
protected-route prefix list. The source fix and regression coverage are in
place and the branch passed hosted CI, but the live production revision has not
been replaced because the guarded promotion workflow is still missing provider
credentials and is correctly blocked by the production data boundary.

## Changed

- Added `/assets` and `/process` to the protected browser-route prefixes.
- Added `/inspection` and `/weekly-report` so tenant-scoped print pages cannot
  render anonymously outside the dashboard route group.
- Extended the route-boundary unit test with protected and public-prefix cases.
- Extended the authentication E2E matrix with `/assets`; the existing
  `/inspection` and `/weekly-report` cases now exercise the newly covered
  middleware prefixes.
- Made signup validation field-specific, focus the first invalid control, and
  expose `aria-invalid` only on the field that needs correction.
- Made the brand and type-safety scanners ignore generated Python cache
  directories so ignored build artifacts cannot prevent release checks from
  running.

## Verification

- PASS — direct TypeScript smoke of the route-boundary predicate (6 cases).
- PASS — `git diff --check`.
- PASS — `pnpm verify:abi-ops-brand` (2,665 files scanned).
- PASS — `pnpm verify:type-safety` (1,424 files scanned).
- PASS — `pnpm verify:app-router-boundaries` (116 pages).
- PASS — `pnpm verify:build-ops-invariants`.
- PASS — `pnpm ci:actionlint` and `pnpm verify:workflow-action-refs`.
- PASS — `pnpm test:abi-ops-brand`, `pnpm test:type-safety`,
  `pnpm test:app-router-boundaries`, `pnpm test:production-data-boundary`,
  `pnpm test:demo-tenant`, and `pnpm test:build-ops-invariants`.
- PASS — `pnpm --filter @third-code-erp/web test` (904 passed, 4 skipped).
- PASS — `pnpm turbo typecheck` (5/5 tasks).
- PASS — `pnpm turbo test --concurrency=1` (4/4 tasks; API 790 passed,
  web 904 passed, with documented integration skips).
- PASS — `pnpm build` (web 85/85 static pages and API webpack build).
- PASS — `pnpm ci:gitleaks` (no leaks found).
- PASS — hosted CI run `31892289507` at the repair SHA (lint, secret scan,
  BUILD OPS invariants, typecheck, unit tests, database reproducibility, and
  build). The workflow's E2E job was explicitly skipped for this pull request.
- PASS — read-only production boundary connectivity through the approved
  session pooler; result was `review_required` with two non-demo E2E rows.
- NOT RUN — authenticated live verification of the patch; the patch is not
  deployed.

## Production boundary

- BLOCKED — guarded production promotion. Fresh workflow run
  `31892885897` stopped at `Require production credentials`: `VERCEL_TOKEN`,
  `RAILWAY_TOKEN`, and `SUPABASE_ACCESS_TOKEN` are unavailable. Four verified
  secrets are present in the protected environment. No migration, data
  mutation, Railway deploy, or Vercel deploy occurred.
- BLOCKED — the existing production data-boundary finding remains unresolved;
  the read-only scan found one E2E-prefixed `cortex_nodes.title` row and one
  E2E-prefixed `projects.name` row under `e2e-qa-20260513-foreign`. No cleanup
  or production data mutation was performed.
