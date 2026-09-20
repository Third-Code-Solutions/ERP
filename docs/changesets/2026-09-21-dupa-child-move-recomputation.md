# DUPA child-move recomputation

## Outcome

Fixed PRD I-05 for child rows moved between DUPAs. The existing trigger only
recomputed the destination on UPDATE, leaving the previous parent's persisted
totals and downstream BOQ unit rate stale. An additive migration replaces the
trigger function so a changed `dupa_id` recomputes both parents in ascending UUID
text order. The existing recomputation function locks its parent with `FOR UPDATE`;
deterministic ordering avoids an opposite-move pair acquiring A/B and B/A parent
locks. INSERT, DELETE, ordinary UPDATE, tenant constraints, RLS,
audit hooks and function grants retain their existing behavior.

The canonical WO-06 arithmetic discrepancy, configurable VAT defaults and
O-01/O-14/source-workbook sign-off boundaries remain unresolved and unchanged.

## Verification

- PASSED: `node --test scripts/verify-wo-06-migration.test.mjs` (2 tests).
- The static regression checks both branches of deterministic parent lock
  ordering. The database behavior probe was rerun after that adjustment; a
  concurrent two-session stress test was not run.
- PASSED: `node --check scripts/verify-wo-06-database-behavior.mjs`.
- Regression reproduced before the fix: old parent direct cost remained `700`
  instead of `500` after moving its `200`-centavo material contribution.
- PASSED after applying the migration: transactional WO-06 database behavior
  probe, including material, labour and equipment moves in both directions,
  both parents' totals/H and H-derived BOQ line amounts, plus existing cascade,
  crew refresh, VAT, audit and classified-work controls.
- Runtime target: fresh local `erp_dupa_move_20260921` database on the
  `ThirdCodeERP-Test` WSL PostgreSQL instance at loopback port 54322. Only schema
  was copied from the existing local CI database; no data was copied. Probe
  fixtures were rolled back. This is focused local evidence, not a full clean
  migration replay or hosted verification. Probe runner was Node 24.16.0.
- PASSED: `git diff --check`. The temporary database was verified to have zero
  tenants and DUPAs after rollback, then removed; the source CI database was
  not modified.

## Deployment and recovery

No hosted migration, deploy, push or commit was performed. The migration changes
only a function definition and restates its existing execute grants. If local
recovery is required, restore the previous `dupa_recompute_from_child()` function
definition from `20260812180000_wo_06_dupa_engine.sql`; this restores the previous
behavior but also restores the known stale-parent defect. No data rollback or
schema destruction is necessary.
