# M3.150 - Managed Supabase parity plan

## Scope

- Refresh managed migration, project, branch, catalog, advisor, log, duplicate,
  export, and branch-cost evidence without mutation.
- Capture all 48 pending migrations in one machine-readable, source-ordered
  manifest.
- Separate review batches from production authorization.
- Define zero-cost-first rehearsal, recovery, identity, Storage, rollback,
  canary, and spend gates.

## Changed source

- Managed parity JSON manifest and detailed operations plan.
- Pure manifest validator, CLI verifier, four unit tests, and package scripts.
- Current hosted database release runbook.
- Architecture, capability, work-log, decision, migration, and next-action
  records.

## Validation

- Managed parity manifest: 55/103 applied, 48 pending, six batches; passed.
- Manifest unit tests: 4/4 passed.
- Database release planner tests: 9/9 passed.
- Purchase Order duplicate planner tests: 4/4 passed.
- Full workspace tests, lint, typecheck, and Nest/Next production build:
  passed.
- Actionlint, Gitleaks, workflow-action verification, controlled-release 5/5,
  provider-spend 4/4, 103-file migration verification, and diff checks:
  passed.
- Live read-only planner: PostgreSQL 17, linear 55/103, no unexpected or
  out-of-order history, `review_required`.
- Live redacted duplicate planner: one group, 12 records, `review_required`.
- Provider mutation count: zero.

## Release and rollback

No database or application release is approved. New managed branch cost is
currently `$0.01344/hour`; none was created. Rollback is source-only: revert
the M3.150 commit. Managed rollback is not applicable because no SQL, branch,
data, Storage, variable, flag, or deployment changed.
