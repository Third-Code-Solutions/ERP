# M3.117 — Purchase Order mapping-template preflight

## Outcome

Database owners can create a local review skeleton for the known duplicate
Purchase Order group without exposing values in logs or mutating hosted state.

## Changed

- Added `scripts/plan-purchase-order-mapping-template.mjs`.
- Added pure template/path-safety helpers and three focused tests.
- Added package scripts and updated the duplicate-remediation runbook plus
  architecture/operations memory.

## Safety

- Repeatable-read, read-only database transaction.
- Explicit output path outside the repository/build/public output.
- Exclusive file creation; existing mapping files are never overwritten.
- Replacement numbers remain blank; no auto-renumbering or SQL repair.
- No provider, migration-history, Storage, or deployment action.

## Validation

- `pnpm test:purchase-order-mapping-template` — 3/3.
- `pnpm test:purchase-order-mapping` — 4/4.
- `git diff --check` — pass.
