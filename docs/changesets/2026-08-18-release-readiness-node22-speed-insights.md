# Release readiness: Node 22, Speed Insights, whitespace, and icn1 — 2026-08-18

## Status

**PRE-PROMOTION CANDIDATE.** The repository changes below passed the available
local release gates under Node 22.23.2. This document does not claim production
deployment, migration, authenticated E2E, `icn1` placement, or real-user p75
evidence; those are recorded only after the canonical promotion workflow has
completed successfully.

## Changes

- Removed the 19 pre-existing trailing-whitespace diagnostics without changing
  their program semantics. The repository-wide patch is now whitespace-clean.
- Declared Node `22.23.2` through `.nvmrc` and `.node-version`; the root
  package manifest now requires `22.x`, and `.npmrc` enables strict engine
  validation. The workstation-wide Node 24 installation was deliberately left
  untouched; validation used an isolated official Node 22 runtime.
- Added ADR-024 and production-only `@vercel/speed-insights` instrumentation
  beside the existing Vercel Analytics adapter. It has no custom dimensions and
  sends no tenant, user, project, document, financial, or prompt data.
- Added a layout contract test that prevents duplicate or non-production
  Speed Insights mounts.
- Replaced direct `pnpm turbo test` workflow calls with the existing root
  `pnpm test` script, which serializes package test execution. This removes the
  observed cross-package timing failure while retaining each package's test
  command.
- Updated the BUILD OPS workflow contract to require that serialized root test
  command, and moved the WO-08 importer static contract's persistence
  assertions to the ERP Core service. The Web multipart adapter is now
  explicitly tested as a Core-only authority boundary.
- Reconciled three stale CI source contracts with the consolidated authority
  design: WO-08a now verifies that Web AI extraction delegates to ERP Core,
  WO-12 verifies that Core owns tenant-scoped inspection-photo metadata and
  audit state, and WO-18 requires the batched cost-control totals query that
  avoids a dashboard N+1 regression. The gates also forbid restoring direct
  Web persistence or the former per-project dashboard query.
- Preserved the existing `apps/web/vercel.json` request for `icn1`; placement
  will be verified from a newly deployed immutable artifact, not inferred from
  source configuration.

## Local verification

- PASS — Node `v22.23.2` plus `pnpm install --frozen-lockfile`.
- PASS — the default Node `v24.16.0` is rejected by `engine-strict` because the
  repository requires Node `22.x`.
- PASS — `git -c core.safecrlf=false diff --check`.
- PASS — focused Cortex and layout telemetry tests (6 tests).
- PASS — Web lint, typecheck, unit tests (949 passed, 2 disposable-database
  skips), and production build (85 routes).
- PASS — root lint, Turbo typecheck, serial root test suite, and root build.
  The serial suite completed 798 API tests, 949 Web tests with 2 documented
  disposable-database skips, 263 database tests with 160 environment-gated
  skips, and 393 shared-types tests.
- PASS — ABI OPS brand, type-safety, App Router boundary, BUILD OPS invariant,
  actionlint, workflow-action-reference, provider-spend-guard, and Turbo cache
  contract checks.
- PASS — the CI unit-test source-gate sequence through WO-18, including the
  corrected WO-08a, WO-12, and WO-18 authority/performance contracts.
- PASS — production dependency audit reported no known high-or-higher
  vulnerabilities; both repository-history and staged-diff Gitleaks scans
  reported no findings.

## Promotion boundary

- The production secret names required by the guarded workflow are present in
  GitHub's `Production` environment; secret values were neither read nor
  exposed.
- The `Production` environment currently has no provider-enforced protection
  rules, and `main` has no branch-protection rule. This release will still use
  a traceable pull request and the canonical `workflow_dispatch` promotion
  path. A separate organization-approved policy is required before claiming a
  provider-enforced review or deployment approval gate.
- Vercel Observability query access remains plan-gated. Speed Insights supplies
  the production all-plan real-user Core Web Vitals path, but p75 remains
  unavailable until a deployed artifact receives and ingests real navigation
  samples.
