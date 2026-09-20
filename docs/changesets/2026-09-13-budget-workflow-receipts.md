# Atomic budget workflow receipts

## Changes

- Submit, Commercial/Finance approval, rejection and revision now validate their
  runtime inputs and lock current actor, tenant and scoped budget authority.
  Canonical project advisory locking precedes the budget row lock, matching the
  existing SQL workflow order, including uppercase UUID inputs.
- Existing SQL workflow decisions and semantic audit commit in one transaction.
  Exact retries reconcile durable receipts; keyed revision retries retain the
  original child even after later edits. Reusing a key with another reason fails;
  a new key permits a later legitimate revision. Legacy unkeyed revision callers
  are retained without promising safe replay after an uncertain response.
- Preserve ADR-018 creator/distinct-approver rules, explicit Owner override,
  final-approval baseline replacement, money calculations and line identities.
  Cache refresh failures report committed success with a warning.
- The budget page distinguishes Owner identity from both-lane capability.
  The workspace confirms Owner baseline locking, blocks submission of unsaved
  edits, preserves dirty fields across refreshes and retains exact uncertain
  commands. Receipt validation binds operation, project, source, result and key;
  messages distinguish lane approval, final approval and later replay states.
- Required credential-free browser CI includes budget workflow coverage. No
  dependency, schema, migration or production-data change is introduced.

## Verification

- PASSED: main independently ran 37 actual PostgreSQL mounted-action tests,
  without skips. Covers foreign tenant/wrong project, inactive actor/tenant,
  current database roles, creator and distinct-actor rules, Owner override,
  concurrent approvals, keyed replay and all five audit/refresh failure paths.
- PASSED: canonical advisory lock ordering with a third connection acquiring
  the budget row while the uppercase command waits on the project lock.
- PASSED: final Finance audit failure preserves the prior approved baseline;
  failure after semantic audit insertion rolls back the full transaction.
- PASSED: dedicated integration TypeScript check and existing WO-14 budget-lock
  static verification. Original atomicity regressions were reproduced before
  correction; lane-forgery and canonical-lock unit regressions also preceded fixes.
- PASSED: 31 focused Web tests without skips, full Web and E2E TypeScript
  checks, and source ESLint. A test fixture's unchecked-index type failure was
  corrected without weakening compiler settings.
- PASSED: 11 Chromium journeys covering dirty drafts, single-flight commands,
  exact uncertain retries, scoped receipts, advanced lifecycle replay, lane and
  Owner controls, cache warnings, same-project budget replacement and mobile
  keyboard operation. Main visually inspected the 320px screenshot.
- Browser RED evidence exposed deferred React event reads that reset dirty
  settings; input values are now captured before state updates. Main review
  also fenced unmounted/obsolete command responses and clears uncertain
  commands when their authoritative budget scope disappears. New tests prove
  old success/error/uncertain responses cannot interfere with a new command.

## Release boundary

Not deployed. Existing draft creation, draft save and cost-code commands remain
outside this workflow-only hardening claim. Browser tests use controlled action
boundaries and do not prove hosted authentication, Storage or all-role live E2E.
The complete ERP roadmap remains unfinished. Fresh branch CI is required before
merge or promotion.

Predecessor PR87 passed all ten CI jobs. Main checked its downloaded artifacts:
database 508/API 319/Web 2/browser 104/trusted PR 1, without skips, and empty
schema diff. That evidence does not substitute for this branch's CI.

Production promotion remains gated by the existing database recovery runbook
and five pending migrations. No backup, restore drill, migration application,
merge or production deployment is claimed by this changeset.
