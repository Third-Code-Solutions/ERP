# Hosted migration source reconciliation

## Outcome

PARTIALLY VERIFIED. The unexpected target migration was not ignored or marked
as applied manually. Its exact recorded SQL was recovered read-only from the
Supabase migration ledger and restored to the local workspace snapshot.
Provider-linked `origin/main` is a separate, newer source and remains
unreconciled.

## Changes

- Added `supabase/migrations/20260729233017_notification_outbox_foundation.sql`.
- Preserved the target migration version and name exactly.
- Updated the blocker record to distinguish resolved ledger parity from the
  still-blocked production release gates.
- Recorded that local `HEAD` is 603 commits behind `origin/main`; the provider
  source contains 124 migration files, while the local workspace contains 55.
- Recorded the provider branch-action failure while applying
  `20260801090000_purchase_order_create_idempotency.sql`, including the
  duplicate tenant-scoped PO-number precondition.

## Verification

- PASS — normalized SQL is an exact match to the target ledger's stored
  `statements` value.
- PASS — local workspace migration ledger: 55 files, linear timestamps.
- PASS — target migration ledger: 55 applied versions, same head.
- PASS — `scripts/plan-database-release.mjs --json`: `status=current`, no
  ledger blockers.
- PASS — full read-only `scripts/verify-database-repro.mjs`: 30 protected
  tables and all checked RLS, policy, index, trigger, privilege, constraint,
  function, and ledger invariants.
- BLOCKED — provider-linked `origin/main` has 124 migration files and is 603
  commits ahead of the local `HEAD`; provider-source parity is not established.
- PASS — provider-source read-only planner independently reports 124 source
  migrations, 55 applied, 69 pending, source head `20260812150000`, and one
  duplicate PO group. Its conservative pending-SQL review flags 52
  `drop-object` and 21 `transaction-control` occurrences.
- NOT RUN — applying SQL, history repair, destructive data cleanup, provider
  source promotion, or production deployment.
