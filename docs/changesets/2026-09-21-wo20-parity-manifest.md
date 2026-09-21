# Managed Supabase parity manifest — WO-20 inventory reversal guards

## Changed

- Reconciled `docs/operations/managed-supabase-parity-plan.json` with the 176-migration source tree after adding `20260921130000_wo_20_inventory_reversal_balance_guards.sql`.
- Recorded the migration as the newest source-only pending batch. The manifest now reports 157 hosted-applied migrations and 19 source migrations pending hosted recovery rehearsal and approval.
- Kept `hostedApplyApproved` false because this changeset records release evidence only; it does not authorize a hosted migration.

## Verification

- `node scripts/verify-managed-supabase-parity-plan.mjs`
- `node --test scripts/verify-managed-supabase-parity-plan.test.mjs`
- `git diff --check`

## Operational boundary

The verifier compares the manifest to repository source only. It does not query or mutate Supabase. Hosted application remains a separate reviewed release action with backup/PITR, recovery rehearsal, lock/grant preflight, and protected deployment approval.
