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
