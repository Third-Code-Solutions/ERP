# Sidebar scope and route verification — 2026-08-18

## Status

**PARTIALLY VERIFIED.** Ordinary navigation no longer advertises the inactive
Asset register, while all retained visible sidebar destinations have fresh
authenticated hosted-browser evidence. The source change has not been pushed
or deployed because the repository-wide release gate remains dirty.

## Changes

- Reconciled every sidebar item against `docs/PRD.md` v1.4 and the accepted
  Cortex, Finance, inventory, budget, and stock-control ADRs. No PRD-backed
  capability was removed for visual brevity.
- Removed **Assets** from ordinary sidebar visibility. Its route and existing
  capability guard remain in place for the protected tenant rollout; it is
  intentionally fail-closed until hosted asset-schema parity, RLS/audit
  review, and canary evidence are complete.
- Added `sidebar-route-smoke.spec.ts`, an opt-in Playwright smoke that derives
  all destinations from `visibleNavSections('admin')`, includes Settings, and
  fails on bad navigation, runtime errors, same-origin failed requests, or
  controlled-rollout states.
- Corrected the existing authenticated project-route smoke so captured browser
  console errors fail the test instead of only being logged. Its project
  fixture is supplied explicitly from the isolated test tenant.

## Verification

- PASS — `pnpm --filter @third-code-erp/web test`: 946 passed; two existing
  disposable-database integration tests skipped.
- PASS — `pnpm --filter @third-code-erp/web lint`.
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — `pnpm --filter @third-code-erp/web build` (Next.js 15.5.23).
- PASS — hosted Chromium sweep of all 28 currently visible sidebar routes,
  using the isolated demo admin at `https://thirdcode-erp.vercel.app`.
- PASS — hosted Chromium role-access matrix for all 11 deterministic demo
  roles, including notification access and protected-route enforcement.
- PASS — hosted Chromium project-route smoke across 23 dashboard, project
  detail, procurement, inventory, finance, reports, and settings destinations,
  using a GUID-validated isolated demo project with zero console/page errors.
- BLOCKED — local browser parity cannot receive `ERP_CORE_API_URL` through the
  current Vercel OAuth credential; its notification request returns 503.
  The hosted notification check passed, so this is a local configuration
  boundary rather than a confirmed deployed failure.
- FAILED — repository-wide `git diff --check` remains red on 19 unrelated
  pre-existing whitespace diagnostics; this changeset itself is clean.

## Release boundary

No commit, push, deployment, migration, provider-configuration change, or
hosted business-data mutation occurred.
