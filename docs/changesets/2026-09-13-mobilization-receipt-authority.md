# Controlled mobilization receipts and site-start gate

## Changes

- Current actor/tenant/capability admission is locked inside each mounted command.
  The project serializes first receipt creation; readiness is locked before
  record/start decisions. Dates are strictly validated instead of defaulting an
  invalid supplied value to today. Omitted dates retain existing behavior.
- Confirmed responses carry project/input/date or original start receipts. Exact
  retries do not duplicate semantic audit, including a receipt retried after site
  start. Changed evidence remains immutable. Cache failures preserve committed
  success; uncertain failures carry an explicit exact-retry flag.
- ADR-033 retires direct client table mutation while preserving tenant reads/RLS.
  A forward-only invoker guard checks active authority, canonical manage/override
  roles and actor attribution, and prevents started evidence/override rewrites.
  No security-definer function or new dependency is introduced.
- The existing database positive fixtures now carry the controlled actor stamp;
  their four-return, cross-tenant and override assertions remain intact.
- The panel separates saved receipts from edits, validates scoped responses,
  preserves exact uncertain retries, reconciles refreshed server data without
  discarding dirty fields and respects override capability. Received inputs no
  longer display outstanding overdue risk. Loading, failure, refresh warning,
  keyboard and mobile states use the existing layout.

## Verification

- PASSED: 46 actual PostgreSQL cases without skips: 18 mounted-action tests and
  28 direct database authority cases. Covers all canonical roles, invalid dates,
  forged attribution, direct client denial, tenant scope, concurrency, final-input
  versus start ordering, replay, audit rollback and refresh failures.
- PASSED: 3 existing WO-16 database cases, database types and dedicated integration
  types. Main independently reviewed the migration and reran the combined suite.
- PASSED: independent server review; added RED regressions for malformed timezone
  offsets and receipt replay after start, then corrected both.
- PASSED: action source ESLint, WO-16 static contract, Actionlint and BUILD OPS.
- PASSED: 2 mobilization component tests and 6 Chromium journeys; integrated with
  neighboring award tests, 4 component tests and 10 browser journeys passed with
  no skips. Includes Strict Mode, receipt binding, unsaved counts, exact retries,
  same-project refresh, project replacement, permissions and mobile keyboard use.
  The 320px screenshot was visually inspected. Browser action boundaries are
  controlled; this is not hosted Auth/Storage or all-role live proof.
- PASSED: final Web and dedicated integration type checks. Fresh branch CI,
  full migration reconstruction/schema diff and hosted verification remain pending.

## Release

Not deployed. New migration was applied only to the existing synthetic loopback
PostgreSQL test database; no production SQL or data changed. A stopped local WSL
database was recovered using its existing data directory, without reset/deletion.
The release runbook records the required compatible Web/migration release unit.
Production backup/restore evidence and pending migrations still gate promotion.

Predecessors PR85 and PR86 passed all ten CI jobs. Downloaded artifacts were
checked: PR85 database 508/API 257/Web 2/browser 94/trusted PR 1; PR86 database
508/API 273/Web 2/browser 98/trusted PR 1, all without skips and with empty schema
diffs. These predecessors do not prove this new slice or hosted all-role behavior.
The complete ERP roadmap remains unfinished.

## CI manifest correction

Initial PR87 CI failed the unchanged managed-Supabase parity-plan unit gate:
the source manifest omitted the new mobilization migration. The same failure
was reproduced locally. The source count/head and ordered pending suffix now
include the migration with its compatible Web release and recovery constraints.
The dated provider snapshot remains unchanged; this does not claim a hosted
apply. No verifier or application behavior was weakened to resolve the failure.
