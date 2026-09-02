# Won-to-Project atomic handoff

## Goal

Make the browser pipeline's Won transition use the existing Core transaction so
the opportunity stage, Project handoff, required checklist/intents, and audit
records either commit together or leave no state change. A failed handoff must
be visible to the user and must never be reported as success.

## Evidence and severity

Severity: P1.

The active Web action currently updates `opportunities.stage` before calling
the legacy conversion helper. It catches all conversion failures, logs a
warning, and still returns success. The helper performs Project, backlink,
checklist, notification, and audit writes sequentially. The repository already
contains an atomic Core transition authority and a gated Web client, but the
browser pipeline does not call them.

This contradicts PRD WO-13, which requires the award transaction to be atomic
and reversible, and the capability matrix's transactional-server-action claim.

## Scope

In scope:

- validate the existing Core opportunity-stage transition transaction and its
  authorization, idempotency, concurrency, rollback, audit, and error contract;
- add missing regression tests at each write boundary;
- wire the Web pipeline action to the Core authority for Won transitions;
- make Core/conversion failure return a user-visible error without locally
  persisting the Won stage;
- return the committed `projectId` on successful Won conversion and refresh the
  affected pipeline/Project route state;
- retire the active legacy best-effort conversion path when safe;
- verify owner, admin, and sales behavior plus denied-role boundaries.

Out of scope:

- schema or migration changes unless discovery proves they are unavoidable;
- changing stage definitions, role policy, award automation scope, or Viewer
  semantics;
- production deployment, demo-account mutations, or irreversible data repair;
- expanding WO-13 beyond the records already implemented by the Core authority.

## Acceptance criteria

1. A successful Won transition commits the stage and Project handoff in one
   database transaction and returns the created or already-linked `projectId`.
2. A failure after any write boundary rolls back the whole transaction, leaves
   the opportunity at its prior stage, and returns a typed user-visible error.
3. Retries are idempotent; concurrent submissions cannot duplicate Projects,
   checklists, notification intents, or audit effects.
4. Unauthorized callers cannot transition or convert and no query/write work
   occurs after denial.
5. The Web action does not run the local stage update or the legacy
   non-transactional conversion for Won transitions.
6. Pipeline list and board preserve their existing error UI and refresh only
   from committed state. A successful result exposes `projectId` without
   requiring a second conversion call.
7. Focused Core and Web regression tests, affected type checks/lint, production
   builds, and secret scan pass.
8. Built-browser verification covers authorized success/error behavior using
   reversible or disposable data only. If live mutation cannot be safely
   performed, the exact browser evidence limit is reported as `BLOCKED`.

## Ordered handoff

1. Agent 05 — API & Backend Logic
   - inspect the Core stage-transition and Project-conversion services;
   - make the atomic authority complete and typed within existing schema;
   - add rollback, idempotency, concurrency, authorization, and result-contract
     tests;
   - write its source commit and explicit handoff before Web files change.
2. Agent 03 — Next.js App Router Engineer
   - consume the validated Core contract from the pipeline server action;
   - remove the Won path's local stage-first/best-effort behavior;
   - preserve typed errors and committed-state refresh behavior;
   - add Web action/client regression coverage and write its source commit.
3. Agent 11 — Pipeline/Sales UX Agent
   - no-op unless discovery proves existing list/board error handling cannot
     present the typed failure or consume the committed result;
   - if needed, make only the smallest pipeline UI adjustment and test it.
4. Independent QA
   - review security, tenant isolation, transactionality, idempotency, failure
     rollback, role policy, and test adequacy; return `GO` or `BLOCK`.
5. Browser verifier
   - run only after QA `GO`; verify owner/admin/sales and at least one denied
     role in a production build without leaving persistent test state.
6. Product/PRD Guardian
   - record verified status and a dated changeset; PRD text is unchanged because
     this repair implements the existing WO-13 requirement.

## Handoff

→ Handoff to Agent 05. Reason: the Core transaction is the authoritative
business-logic boundary and must be proved complete before Agent 03 consumes it.
Inputs: PRD WO-13, this note, the current Core transition/conversion services,
the Web Core client, and the reproduced swallowed-error path. Expected output:
an atomic, typed, idempotent Core contract with failure-injection regression
coverage, committed separately from Web wiring.

## Agent 05 closeout

Status: complete at source commit `b9aa2d93`; Web files remain unchanged.

Findings and implementation:

- the existing stage and Project conversion authorities already share one
  database transaction, including ledgers, stage/SLA changes, Project/backlink,
  checklist/items, notification intents, audits, and request completion;
- the Core KYC gate was not behaviorally equivalent to the live Web pipeline:
  it checked only Account KYC, so a valid PPRF with two approved tracks could
  fail while incomplete tracks could pass under an approved Account;
- Core now requires both tenant-scoped canonical Finance tracks when any track
  exists and uses Account KYC only for trackless legacy opportunities;
- no schema, dependency, environment value, account, fixture, or deployment
  configuration changed.

Verification:

- baseline conversion/controller tests: PASSED, 8/8;
- final neighboring CRM tests: PASSED, 44/44;
- real local PostgreSQL 17 stage/conversion HTTP integrations: PASSED, 2/2,
  with all fixture writes contained by an outer rollback;
- ten injected conversion write-boundary failures: PASSED, each leaving no
  committed effect and permitting a clean retry;
- serialized concurrent replay: PASSED, with Project, backlink, checklist,
  items, notification, audits, and completion occurring once;
- stage-owned rollback, owner/admin/sales authorization, Viewer denial,
  dual-track/legacy KYC, rollout gates, typed errors, and replay: PASSED;
- API TypeScript, full API source ESLint, Nest production build, WO-13 contract,
  gitleaks, and diff checks: PASSED.

The package lint wrapper itself selected host pnpm 11 instead of the pinned
pnpm 10.33 runtime and failed before ESLint; the identical full API source
ESLint target passed directly through pinned Corepack pnpm.

→ Handoff to Agent 03. Reason: the Core atomic contract and failure behavior
are now verified. Inputs: source commit `b9aa2d93`, the
`transitionOpportunityStageThroughCoreApi` adapter, its exact Web/Core rollout
gates, and the active pipeline action. Expected output: route Won/Closed Won
through Core without a local stage-first fallback, return the committed
`projectId`, surface failures through the existing error UI, and refresh only
committed Project/pipeline state.
