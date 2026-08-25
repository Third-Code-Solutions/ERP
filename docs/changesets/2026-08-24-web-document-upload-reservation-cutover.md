# Web document upload reservation cutover

## Outcome

The project-document browser upload flow can now use the Core reservation
ledger end to end behind exact-tenant, default-off Web selectors. Selected
requests never fall back to legacy signing or metadata completion. No selector
was enabled, no provider setting was changed, and nothing was deployed.

## Implementation

- Added separate Web issuance and lifecycle selectors. Both require the exact
  lowercase `true` global value and an exact UUID allowlist; wildcard or mixed
  malformed lists fail closed.
- Routed selected signing through Core with a stable per-project/file-attempt
  idempotency key. Selected completion accepts only `reservationId`; release has
  a dedicated authenticated, capability-gated DELETE boundary.
- Added a shared canonical-path validator binding exactly three path segments
  to tenant, project, reservation UUID, and a safe 1-200 character filename.
- Strictly validate signing, completion, and release bodies and reject
  authority-shaped extra fields, foreign tenants, substituted reservation IDs,
  nested paths, backslashes, and traversal markers.
- Mapped Core failures to Web-owned messages. Provider/Core diagnostics are not
  forwarded to the browser. Core calls preserve a validated `x-request-id`, use
  a 40-second outer deadline above the provider's 30-second deadline, and emit
  structured Web outcomes for reserve, complete, and release.
- Added browser recovery for finalization retry without a second Storage PUT,
  explicit release, cleanup retry, and fresh signing identity after cleanup.
  Pending recovery blocks replacement uploads and has keyboard/screen-reader
  status and alert semantics.
- Reworked the controlled browser fixture around the real reservation contract,
  canonical path, deterministic session, actual profile auth contract, and the
  existing local verification tenant/project.
- Documented exact enablement, rollback, active-reservation drain, terminal
  cleanup drain, read-only psql readback, correlation, and roll-forward steps in
  `docs/runbooks/document-upload-reservation-cutover.md`.

## Changed areas

- Web upload sign, complete, and reservation-release routes and regressions.
- Web Core adapter, canonical-path validation, correlation logging, and tests.
- CAD/document upload hook and UI recovery/accessibility states.
- Controlled Playwright spec, harness, and configuration.
- Root/Web environment examples and environment/runbook documentation.

## Verification

- **PASSED** — focused reservation Web suite: 6 files, 228 tests.
- **PASSED** — full Web Vitest rerun: 159 files and 1,022 tests; two existing
  integration suites skipped because their disposable database/hardening
  prerequisites were not supplied.
- **PASSED** — the extractor test that timed out during an earlier concurrent
  full-suite run: 8/8 in isolation, followed by a clean full-suite rerun.
- **PASSED** — Web source and all configured Web E2E TypeScript projects.
- **PASSED** — scoped ESLint for changed production source. Repository ignore
  rules exclude the controlled E2E files from meaningful ESLint coverage.
- **PASSED** — controlled reservation Playwright suite: 5/5 in 30.4 seconds
  under Node 22 and local Chrome.
- **PASSED** — `git diff --check`; only expected Windows LF-to-CRLF notices.
- **PASSED** — independent boundary review: no remaining actionable finding.
- **NOT RUN** — production/provider smoke tests; activation remains default off
  and was not authorized.

## Remaining boundaries

The controlled Playwright run requires local Postgres on port 54322 with the
existing `Local Verification Project` fixture and local Chrome. Hosted
activation still requires an approved release identity, environment readback,
one exact-tenant canary, and the runbook drain checks. The repository's separate
AUD-007 public-workbook P0 remains unresolved and continues to prohibit push,
PR, or production promotion in this remediation session.
