# Database release preflight gate

## Outcome

PARTIALLY VERIFIED. The read-only release planner now has an explicit full
BUILD OPS mode so a current migration ledger cannot be mistaken for a complete
database release.

## Changes

- Added `--require-wo-02` to `scripts/plan-database-release.mjs`.
- Added `pnpm plan:database-release:full`, which requires a linear ledger and
  invokes the read-only WO-02 database verifier.
- Added `pnpm plan:provider-database-release`, which reads the provider-linked
  `origin/main` migration source and checks its pending suffix separately.
- The full planner reports the WO-02 verifier output and exits non-zero when
  audit coverage, audit identity, holiday-table shape/RLS/policies, or
  append-only rules fail.
- Updated the database release runbook with the stronger preflight command.

## Verification

- PASS — the existing planner unit suite remains unchanged and is covered by
  `pnpm test:database-release-plan`.
- PASS — the WO-02 SQL proposal gate remains covered by
  `pnpm test:wo-02-sql-proposal`.
- FAIL/BLOCKED — the current hosted target correctly fails the new full gate:
  71/86 audit coverage, missing `audit_log.entity_key`, and missing holiday
  table/RLS/policies/triggers.
- FAIL/BLOCKED — provider-source planning reports 55/124 applied migrations,
  69 pending, and one duplicate Purchase Order group.
- NOT RUN — no hosted DDL, migration, or data mutation.
