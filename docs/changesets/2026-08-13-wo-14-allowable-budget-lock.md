# WO-14 — Allowable Budget approval and baseline lock

## Status

Implemented and locally verified. Hosted Supabase promotion remains release-gated.

## Changed

- Added `project_budgets.original_gp_margin_bps` as an immutable basis-point snapshot.
- Captured the linked BOM margin only when the dual Commercial + Finance approval reaches `approved`.
- Hardened the Project Budget trigger so every baseline field is immutable outside the trusted workflow.
- Scoped superseded-parent validation to revision creation/parent changes, allowing the atomic final approval transition to supersede the old baseline before approving the new revision.
- Wrapped the existing workflow functions to clear the transaction-local workflow context at the public boundary. Direct statements in the same transaction cannot inherit workflow authority.
- Cost tracking now uses the approved budget margin snapshot when present; older records continue to fall back to BOM-derived margin.
- Added a bounded local production-browser smoke helper using the repository’s existing Playwright release/auth checks.

## Verification

- Shared types: PASS.
- Database types: PASS.
- Web types: PASS.
- Shared tests: 128/128 PASS.
- Database migration contract: PASS.
- Disposable PostgreSQL 17 + Redis 7.4.9 lane: 66 migrations, 259/259 database tests, API integration 3/3, reproducibility/static gates PASS.
- Web tests: 359 PASS, 2 pre-existing external-worker skips.
- Next production build: PASS, 80 routes.
- Local production browser smoke on `http://localhost:3000`: 4/4 PASS.
- Standalone-copy smoke: NOT COMPLETED; isolated dependency setup exceeded the bounded 180-second timeout before application assertions.

## Release boundary

No hosted database write or deployment was performed. The migration must remain pending until the hosted migration/data compatibility blockers are resolved and the authorized promotion runbook is executed.
