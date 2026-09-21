# WO-20 inventory reversal balance guards

## Outcome

Added the additive migration
`20260921130000_wo_20_inventory_reversal_balance_guards.sql`. Receipt and
movement reversal RPCs now acquire the existing deterministic
`tenant_id:warehouse_id:material_item_id` advisory locks, aggregate the full
reversal footprint per warehouse/item, and reject a projected negative
quantity or value before journal, ledger, or status mutations begin.

Valid untouched reversals, repeated-reversal rejection, append-only evidence,
and tenant-bound actor checks remain unchanged. Receipt reversal checks group
multiple receipt lines for the same item; movement reversal checks the complete
movement footprint so multiple source rows cannot bypass the balance guard.

## Regression coverage

- Static migration contract checks verify both RPCs use ordered advisory locks,
  projected quantity/value checks, and value-specific failures.
- Real Postgres probes cover a 10-unit receipt followed by 6-unit consumption
  (receipt reversal rejects atomically), a mixed-price receipt reversal that
  would create negative value (rejects atomically), and a mixed-price positive
  adjustment reversal (rejects atomically).
- Existing valid receipt and movement reversal tests remain in place.

## API handoff

→ Handoff to Agent 05. Reason: the database RPC error boundary now distinguishes
quantity and value balance failures while preserving the existing RPC
signatures. Inputs: migration
`20260921130000_wo_20_inventory_reversal_balance_guards.sql` and the existing
`reverse_stock_receipt` / `reverse_stock_movement` contracts. Expected output:
keep API error mapping truthful for the new `23514` balance failures; no API or
web edits are included in this database slice.

## Verification

- PASSED: focused database Vitest suites for
  `inventory-stock-ledger.test.ts` and `stock-movements.test.ts` — 43/43
  tests, including runtime probes against disposable PostgreSQL 17 clone
  `erp_wo20_inventory_reversal_20260921`; probe rows were wrapped in the
  existing rollback harness.
- PASSED: `pnpm --config.engine-strict=false --filter
  @third-code-erp/database typecheck` (Node 24.16.0 environment warning only;
  repository requires Node 22.x).
- PASSED: `node scripts/verify-database-repro.mjs --files-only` — 176 ordered
  migration files, unique timestamps, and repository security/seed invariants.
- PASSED: `node --test scripts/verify-database-repro-policy-contract.test.mjs`
  (3/3).
- PASSED: `git diff --check`.
- NOT GREEN: `pnpm --config.engine-strict=false
  test:managed-supabase-parity-plan` detects the expected source-only migration
  suffix but the checked-in `docs/operations/managed-supabase-parity-plan.json`
  still records 175 source files through `20260921120000`. Updating that
  release-evidence manifest is outside this bounded Agent 04 slice and must be
  reconciled by the release/operations owner before CI parity gates can pass.

Known gap: no multi-session contention stress was run. The existing database
fixture helper deliberately keeps each probe inside one rollback transaction;
the deterministic advisory-key ordering is covered by the migration contract
and the single-session runtime balance probes.

The disposable clone was based on the local `erp_test` schema and received the
WO-20 migration plus the already-required warehouse-state guard migration before
the runtime suite. No hosted database was contacted or changed.

## Deployment and recovery

No hosted migration, deploy, merge, or production data mutation is authorized
or performed in this slice. Recovery is forward-only at the schema level:
restore the prior function definitions from the two source migrations if the
additive migration must be reverted. No table or historical ledger data is
dropped or edited.
