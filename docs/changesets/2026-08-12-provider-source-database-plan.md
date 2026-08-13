# Provider-source database release planner

## Outcome

PARTIALLY VERIFIED. Added a read-only planner against the migration source
that Supabase's Git-linked branch actually follows.

## Changes

- Added `scripts/plan-provider-database-release.mjs`.
- Added pure source-summary logic and tests in
  `scripts/lib/provider-source-plan.*`.
- Added `pnpm plan:provider-database-release`.
- The planner now reports each duplicate group's tenant, Purchase Order
  number, and row count in its read-only output.
- Updated the database release runbook to require provider-source planning
  when Git-linked migrations are involved.

## Verification

- PASS — pure provider-source summary tests pass.
- PASS — the planner reads `origin/main` without changing Git or the database.
- BLOCKED — the current provider source has 124 migrations, the target has 55
  applied, 69 are pending, and one duplicate tenant PO-number group blocks the
  first pending migration.
- BLOCKED — provider-linked `origin/main` contains no WO-02 calendar or WO-03
  process/SLA table implementation; those changes remain only in the dirty
  local workspace until source authority is reconciled.
- NOT RUN — migration application, data repair, branch creation, or production
  deployment.

## Latest duplicate-number evidence

The read-only provider audit identified one concrete blocker group: tenant
`2b2b039c-b066-412b-af4c-564f2af6097e` contains 12 synthetic E2E Purchase
Order rows numbered `PO-0002`. Four have delivery schedules, none have stock
receipts or supplier bills, and the rows span draft, approval, issuance, and
issued states. This is documented in
`docs/blockers/2026-08-12-purchase-order-number-reconciliation.md`.

This does not authorize deletion, renumbering, or consolidation. An owner must
approve the canonical mapping before the uniqueness migration can be replayed
on a disposable restore and considered for the hosted target.
