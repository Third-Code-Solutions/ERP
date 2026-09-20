# Invoice allocation and Auth compensation reconciliation

## Scope

Close two P1 consistency defects found during the post-CI review:

1. Invoice allocation must use the maximum validated numeric suffix, not
   lexical invoice-number ordering. Core and the retained Web writer share the
   same tenant/month advisory lock and the same exact `BigInt` formatter.
2. Auth lifecycle compensation must not apply a stale pre-rollback state after
   a newer lifecycle command commits. Core and Web reacquire the shared tenant
   lock, reread durable `users.account_status`, and reconcile Auth to that
   committed state.

## Verification contract

- Shared invoice-number unit coverage crosses `999` → `1001` and preserves
  suffixes beyond JavaScript's safe-integer range.
- Core lifecycle unit coverage models failed command A, committed suspension B,
  then A's compensation; Auth remains suspended.
- Web suspension coverage models the same durable-state interleaving.
- Existing full API/Web/shared suites and hosted CI remain release gates.

No migration or dependency was added. Production remains held by the existing
backup/PITR, encrypted logical/storage backup, isolated restore-drill, and
coordinated-release gates.
