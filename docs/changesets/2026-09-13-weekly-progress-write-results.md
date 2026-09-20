# Weekly progress write results and WAR operation guards

## Changed

- Core create, recapture and WAR lock explicitly return aliased weekly-period
  columns. Removed the three unsafe casts that concealed snake_case/camelCase
  mismatches and caused successful SQL writes to roll back during serialization.
- `20260912170407_weekly_progress_trigger_operation_guards.sql` replaces only
  the two existing guard function bodies, correcting `TG_OP` comparison casing.
  PostgreSQL supplies uppercase operation names. Signatures, security-invoker
  mode, search paths, predicates, errors, triggers, grants and stored data are
  otherwise unchanged. Source: [PostgreSQL trigger variables](https://www.postgresql.org/docs/17/plpgsql-trigger.html).
- Added actual-PostgreSQL regression tests with UUID-isolated synthetic fixtures
  and real service/AuditService/Drizzle execution. Create, recapture and lock are
  committed and read back. Guard attempts and the positive open-period delete
  are rollback-isolated, retaining all fixtures and immutable audit history.
- Corrected the original handoff's overstatement of end-to-end guarantees.
- CI follow-up synchronizes the existing parity manifest with 173 source / 16
  pending migrations. The new guard batch remains explicitly unapproved for
  hosted application; dated applied-ledger evidence is unchanged.

## Verification

- RED observed by the test author before the service repair: create, recapture
  and lock each failed at `cutoffAt.toISOString()`; tenant denial passed. The
  linked-evidence mutation also unexpectedly succeeded.
- After the service repair and before the migration, the expanded suite had six
  passes and five failures: linked UPDATE/DELETE, late INSERT, moving evidence
  into a locked week, and permitted open-period DELETE.
- PASSED: final main-agent combined run 22/22 with no skips (11 real PostgreSQL
  cases plus 11 neighboring API tests). Report:
  `C:/Users/MSI/AppData/Local/Temp/erp-weekly-progress-main-final.json`.
- PASSED: 11 neighboring API unit/controller tests, four shared contract tests,
  existing static migration test, API typecheck, strict standalone integration
  typecheck, focused source ESLint, whitespace checks and history secret scan
  (2013 commits, no findings). Local Node 24.16.0 differs from CI Node 22.
- Independent review found no required corrections in the projection, migration
  or final exact-error assertions. This was source review, not a test rerun.

## Recovery and boundaries

Apply only after the inherited release gates and exact-target preflight pass.
The migration is transactional and data-preserving. Abort before commit on
failure; after commit, retain the repaired guards and roll forward if further
correction is needed. Do not restore the vulnerable lowercase comparisons as a
rollback. Application rollback must not disable the database guards.

No hosted migration, production data change, deployment, browser mutation or
all-role weekly-progress E2E is claimed here. Local PostgreSQL uses synthetic
historical service timestamps to exercise capture and lock without altering the
database clock. This is not a production clock-boundary or concurrency test.

Historical capture replay, client retry-key retention, lock replay semantics,
fresh lifecycle admission and canonical cutoff/evidence-week binding remain
unfinished. The complete construction ERP and retained-history Suspend workflow
are not declared complete. Inherited backup/Storage recovery and Supabase preview
capacity holds remain in force.
