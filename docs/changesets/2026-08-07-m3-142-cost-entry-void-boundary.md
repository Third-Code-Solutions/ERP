# M3.142 - Core Cost Entry void boundary

## Scope

Design and implement a reversible, tenant-scoped Core boundary for Cost Entry
correction. Physical deletion stays prohibited for Core-created records.

## Changes

- Add `voided_at`, `voided_by`, and bounded `void_reason` metadata.
- Add service-only `cost_entry_delete_requests` idempotency/snapshot ledger.
- Add closed NestJS `DELETE /v1/projects/:projectId/cost-entries/:costEntryId`.
- Require locked `cost.record` membership, manual source, tenant/project scope,
  one transaction, one audit event, and exact replay.
- Exclude voided rows from active Web cost reads and revoke direct authenticated
  cost writes in the source migration.

## Explicit boundary

The API flag is false with an empty tenant allowlist. The legacy Web delete
action is not migrated. Restore is represented by the pre-void snapshot and
requires a separately reviewed operator command; no hosted migration occurred.

## Validation

Focused deletion API 8/8; shared 3/3; database migration/schema 3/3; Web
91/591; shared 27/230; database 48/52 files with 186 passed/141 skipped; API
114/489; production build 81/81 routes; typecheck/lint, migration verifier
(99 files), Actionlint, Gitleaks, controlled-release 5/5, and provider-spend
4/4 passed. Database skips require `DATABASE_URL`; hosted providers remain
closed.
