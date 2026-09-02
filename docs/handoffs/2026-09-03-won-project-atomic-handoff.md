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

## Agent 03 closeout

Status: complete at source commit `dd856efa`; Core files remained unchanged in
this phase and Agent 11 was a no-op.

Implementation:

- Won and Closed Won exit the Web action through the exact stage-write Core
  selector and atomic transition adapter before any local database work;
- selector denial, typed Core failure, adapter unavailability, thrown errors,
  and semantically invalid success all return a user-visible error with zero
  local stage, audit, SLA, or legacy-conversion fallback effect;
- a successful response must match the tenant, opportunity, and requested
  stage and include committed Project/checklist identifiers plus the conversion
  marker;
- exact normalized retries use a tenant-scoped Core ledger key derived from a
  SHA-256 command fingerprint; distinct terminal commands use distinct keys;
- success returns `projectId` and revalidates the pipeline and committed Project
  paths; non-Won transitions keep the existing local path;
- the existing pipeline list and board already consume `{ error }`, so no
  component or Agent 11 source change was required.

Verification:

- pipeline action baseline: PASSED, 3/3; final focused suite: PASSED, 14/14;
- Core selector, transition adapter, and WO-13 contract: PASSED, 3/3;
- App Router boundary tests: PASSED, 2/2;
- complete Web/E2E and shared-types TypeScript: PASSED;
- full Web source ESLint: PASSED;
- Web production build: PASSED, 89/89 pages;
- gitleaks and diff checks: PASSED.

Rollout remains fail closed and requires the Web selector plus both Core write
gates and all matching tenant allowlists. No environment setting or deployment
was changed. Browser mutation was not attempted before independent QA and a
safe disposable-fixture decision.

→ Handoff to independent QA. Reason: both source phases are committed and the
active Web path now consumes the Core authority. Inputs: Core commit
`b9aa2d93`, Web commit `dd856efa`, this acceptance contract, and all focused
evidence. Expected output: an independent `GO` or `BLOCK` after security,
tenant, KYC, transaction/idempotency, fail-closed, test, and regression review.

## Independent QA round 1

Verdict: `BLOCK`; browser verification must not start.

Confirmed findings:

- P1: Core `opportunity.stage_change` and `opportunity.convert` grant
  Commercial, Service Delivery, PM, and Estimator in addition to Owner, Admin,
  and Sales. Direct Core callers can therefore execute the Won handoff even
  though the Web boundary correctly denies them.
- P2: conversion tenant-qualifies the Account lookup but accepts a missing row,
  then copies the original `opportunity.account_id` into the new Project. With
  the schema's single-column foreign key, a malformed tenant-A opportunity can
  therefore retain a tenant-B Account reference under valid tenant-A KYC
  tracks.
- tests deny only Viewer and use valid same-tenant Account links, so neither
  defect was covered.

Required remediation:

1. Make both Core Won mutation capabilities exactly Owner/Admin/Sales and prove
   all thirteen role outcomes at the central map, controller/service boundary,
   and no-effect transaction boundary.
2. Require a linked Account to resolve in the authenticated tenant before KYC
   evaluation and before copying the ID into a Project.
3. Add a real PostgreSQL cross-tenant Account-reference rollback case.
4. Add same-key cross-actor replay tests proving current membership is always
   revalidated, denied/revoked actors receive no replay, authorized replay
   creates one effect, and tenant ledger keys remain isolated.

Round-1 evidence passed Core 30 tests, Web client/action 185 tests, shared
authorization/stage 38 tests, WO-13 contract, two real PostgreSQL integrations,
API/Web/E2E type checks, API/Web builds, gitleaks, and diff checks. Independent
ESLint was blocked by a missing workspace `eslint-plugin-react-hooks` link;
source-phase direct API/Web lint had already passed through the pinned virtual
store.

→ Handoff back to Agent 05. Reason: both blockers are Core authorization and
tenant-integrity defects. Inputs: this QA report, central capability map, Core
controllers/services, stage/conversion unit tests, and PostgreSQL HTTP
integrations. Expected output: exact all-role denial, tenant-qualified Account
failure, cross-actor/tenant replay safety, real rollback evidence, and a new
Core-only source commit before QA round 2.

## Agent 05 QA remediation closeout

Status: complete at source commit `1ac2334a`; Web and documentation files were
unchanged in this source phase.

Implementation:

- `opportunity.stage_change` and `opportunity.convert` now grant exactly Owner,
  Admin, and Sales in the central capability map consumed by both controller
  guards and transaction services;
- both services revalidate current locked membership and require each non-null
  linked Account to resolve by ID plus authenticated tenant before claiming an
  idempotency record, evaluating KYC, or writing Project/handoff state;
- all thirteen roles are covered at the central, controller-guard, stage, and
  direct-conversion boundaries with zero-effect denial assertions;
- same-key replay coverage now includes authorized cross-actor replay,
  denied/revoked current membership, and separate-tenant isolation;
- the PostgreSQL integrations construct a tenant-A opportunity with valid
  tenant-A tracks but a tenant-B Account reference and prove complete rejection
  without retained stage, ledger, Project, checklist, item, notification,
  audit, SLA, or backlink effects.

Verification:

- shared authorization: PASSED, 32/32;
- focused Core guard/controller/conversion/stage: PASSED, 87/87;
- neighboring CRM: PASSED, 68/68;
- real PostgreSQL 17 conversion/stage rollback integrations: PASSED, 2/2;
- shared/API TypeScript, API source ESLint, Nest production build, WO-13
  contract, gitleaks over 1,761 commits, and diff checks: PASSED.

Optional integration-only raw TypeScript and `eslint --no-ignore` probes are
not authoritative repository gates: integrations are excluded from the API
tsconfig/ESLint config and exposed pre-existing harness/CLI typing outside that
configuration. The integration specs themselves execute successfully through
Vitest against PostgreSQL 17. Prettier was not available in this worktree.

→ Handoff to independent QA round 2. Reason: the two round-1 blockers are
remediated in a distinct Core/shared commit. Inputs: `1ac2334a`, both previous
source commits, round-1 findings, the all-role matrices, and real PostgreSQL
adversarial cases. Expected output: `GO` or `BLOCK` after independently proving
role exactness, tenant safety, replay authorization/isolation, rollback,
Web/Core fail-closed integration, and regression gates.

## Independent QA round 2

Verdict: `GO`; no remaining in-scope P1/P2 finding at combined clean HEAD
`bd4d9c83`.

Independently verified:

- exact Owner/Admin/Sales allow and ten-role deny behavior at the central map,
  real controller metadata/guard, and both transaction services;
- denial occurs before persistent effects;
- linked Accounts resolve by ID plus authenticated tenant before ledgers, KYC,
  Project, or backlink work;
- the real PostgreSQL tenant-A tracks plus tenant-B Account case returns 409 and
  leaves every enumerated stage/handoff effect absent;
- authorized cross-actor replay, denied/revoked membership, and same-key
  cross-tenant isolation;
- one Won transaction, dual-track and legacy KYC, Web/Core rollout gates,
  semantic response binding, no local Won fallback, and unchanged non-Won
  behavior;
- shared authorization 32/32, focused Core 87/87, complete CRM 68/68, Web
  action/client 185/185, PostgreSQL integrations 2/2, all authoritative
  TypeScript/source ESLint/build/WO-13/gitleaks/diff gates, and 89/89 Web pages.

Agent 11 remains a no-op. Browser and deployment verification were not part of
the read-only QA phase.

→ Handoff to browser verifier. Reason: independent QA is `GO`. Inputs: combined
HEAD, supplied demo roles, existing demo data, Web/Core rollout gates, and the
requirement to inspect console/network/server behavior. Expected output: run
the built Web and Core services, confirm authorized/denied visibility and
direct API boundaries, exercise a real successful Won conversion only when a
clearly disposable or explicitly demo-safe candidate exists, record any
persisted demo effect exactly, and otherwise mark the positive browser mutation
`BLOCKED` while still verifying fail-closed and navigation behavior. Never
delete append-only audit data or weaken a gate for the test.

## Browser verification round 1

Verdict: `NO-GO / PARTIAL`; Agent 11 is no longer a no-op.

Passed evidence at combined HEAD `f6d68fbc`:

- Core and Web production builds started on isolated ports with tenant-only
  ephemeral rollout gates;
- all eleven supplied identities passed login, identity, dashboard, Pipeline
  navigation, board render, refresh, history navigation, and sign-out;
- Owner, Admin, and Sales reached expected 409 business validation on unique-key
  direct stage/conversion calls against the Negotiation fixture;
- Commercial, Design, Service Delivery, Finance, Procurement, Safety, CX, and
  Viewer received 403 from both direct Core mutation endpoints;
- the board showed mutation controls only to Owner/Admin/Sales and a read-only
  marker to the other eight roles;
- final database counts and the Negotiation opportunity remained unchanged;
  no ledger, stage, Project, checklist, notification, audit, SLA, or backlink
  effect was created by this round.

Failed evidence:

- `/pipeline/conversion` rendered six visible/enabled stage-mutation controls
  to each of the eight supplied denied roles, despite the safe server/API
  boundary. Commercial, Procurement, Safety, CX, and Viewer were explicitly
  confirmed enabled; Design, Service Delivery, and Finance had the same visible
  control count.

Positive Won mutation remains `BLOCKED`: the demo tenant has no Contract-stage
opportunity. Its Negotiation candidate is tied to an active Project but has no
Account/KYC tracks, signed contract, legacy contract document, or checklist.
Advancing it would alter a business-significant fixture and Core conversion
would reject the missing contract prerequisite.

Diagnostics contained no page exception, navigation HTTP failure, or Core
exception. Local HTTP produced known CSP HTTPS-upgrade/RSC fallback noise and
aborted prefetches. Rejected Core requests were structured but labeled
`unknown.command`; this observability issue is recorded for later remediation
and does not weaken the authorization boundary.

Estimator and PM browser coverage remains blocked because no identities were
supplied.

→ Handoff to Agent 11. Reason: the conversion table fails authorization-aware
control visibility while its mutation authority is already safe. Inputs:
round-1 browser matrix, `opportunity.advance_stage`, the conversion server page,
and the existing board's read-only pattern. Expected output: hide or replace all
stage mutation controls for denied roles, preserve read-only data access and
Owner/Admin/Sales controls, add all-role render coverage, and commit the
smallest pipeline UI change before QA round 3.
