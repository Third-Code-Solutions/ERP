# Document opportunity/project integrity

## Scope

- Retained the existing nullable `(tenant_id, opportunity_id)` document foreign
  key so pre-project documents remain tenant-bound.
- Added the parent unique key `(tenant_id, id, project_id)`, child lookup index
  `(tenant_id, opportunity_id, project_id)`, and nullable `MATCH SIMPLE`
  composite foreign key. Project-linked documents can now reference only an
  opportunity linked to the same tenant and project.
- Removed the Drizzle-only single-column opportunity reference because no
  corresponding runtime constraint exists.
- Created the additive migration with Supabase CLI 2.109.1. It fails closed on
  a missing/malformed retained foreign key, legacy correlation mismatches, and
  same-name object collisions before validating the new constraint.

## Verification

- PASSED: disposable PostgreSQL 16 migration verifier, including legacy-data
  preflight, atomic malformed-name collisions, migration/reparent concurrency,
  post-migration intake `FOR UPDATE` blocking, exact SQLSTATE `23503`, nullable
  cases, tenant/project negatives, reparenting, cascades, and live catalog
  shape/action/validation checks.
- PASSED: database focused Vitest, 2 files / 10 tests.
- PASSED: database TypeScript check and scoped production/verifier ESLint.
- PASSED: diff and trailing-whitespace checks.
- PASSED: independent Agent 04 review and orchestrator PostgreSQL/Vitest rerun.

## Release and rollback

- Apply the migration before relying on opportunity association for any
  project-linked document writer. A preflight failure means legacy rows or a
  same-named object require explicit inspection; do not bypass it.
- The migration contains narrow rollback guidance for the new constraint and
  indexes. The retained tenant/opportunity foreign key is not removed.

## Handoff

→ Handoff to Agent 13. Reason: the schema invariant and disposable migration
proof are complete. Inputs: the additive migration, fail-closed preflights, and
the package verifier command. Expected output: stage the migration ahead of
dependent application release, run the verifier in the release lane, and stop
on any target-data or catalog mismatch rather than weakening the constraint.
