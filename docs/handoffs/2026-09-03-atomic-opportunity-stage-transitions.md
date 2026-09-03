# Atomic opportunity stage transitions

## Delivery contract

Goal: make every allowed Pipeline opportunity stage transition commit the
opportunity update, semantic audit, SLA lifecycle, and idempotency state as one
tenant-safe operation. Board and conversion clients must receive a typed,
handled result and must never fall back to the legacy stage-first writer.

In scope:

- non-Won transitions initiated from Pipeline board and conversion views;
- Owner/Admin/Sales mutation authority and all-role read-only behavior;
- existing KYC, regression-reason, lost-reason, membership, tenant, replay, and
  concurrency rules;
- rollback/failure-injection tests at Core and Web boundaries;
- visible client handling for returned and rejected failures;
- rollback-contained or disposable browser proof without persistent demo-data
  mutation.

Out of scope:

- schema or dependency changes;
- pipeline-stage taxonomy changes;
- Viewer-sensitive product-policy decisions;
- production deployment, which remains governed by ADR-020;
- the separate rejected-command `unknown.command` logging defect.

## Reproduced P1

The active Web action sends only Won/Closed Won transitions to Core. Every
other stage first commits `opportunities.stage`, probability, and weighted TCV,
then writes the semantic `stage_change` audit separately, then stops/starts SLA
clocks while swallowing SLA errors. An audit rejection therefore leaves the
stage committed while the action fails; an SLA half-failure can leave the old
clock active or no clock at all while the action returns success.

The replacement authority already exists at
`POST /v1/crm/opportunities/:id/stage-transition`. Core holds membership and
opportunity locks, claims the idempotency key, validates transition/KYC/reason,
updates the opportunity, writes the semantic audit, rolls SLA state, performs
the Won handoff when applicable, and completes the command in one transaction.
The Web Core client is also already present.

## Acceptance criteria

1. Every allowed non-Won transition uses the Core transaction; selected-Core
   failure is returned without a local mutation or fallback.
2. Audit, SLA, or idempotency failure leaves opportunity and clocks unchanged.
3. Same-command retries replay safely, concurrent transitions serialize, and
   cross-command key reuse conflicts.
4. KYC, regression reason, lost reason, tenant isolation, and exact
   Owner/Admin/Sales authorization remain enforced.
5. Web validates the committed result before revalidation; both Pipeline views
   visibly handle returned and rejected action failures.
6. Focused Core/Web tests, type/lint/build gates, independent QA, and a safe
   browser matrix pass. A positive persistence test must be rollback-contained
   or use a disposable fixture.

## Sequential ownership

1. **Agent 05 — API & Backend Logic**
   - prove the existing Core contract supports every non-Won transition;
   - close contract, failure-injection, replay/concurrency, and tenant gaps
     within Agent 05 paths only;
   - run focused Core checks and write the handoff result here.
2. **Agent 03 — Next.js App Router Engineer**
   - remove the active non-Won local writer and route the server action through
     the proven Core contract;
   - validate typed results and retain fail-closed revalidation behavior;
   - run focused Web checks and write the handoff result here.
3. **Agent 11 — Pipeline / Sales UX Agent**
   - inspect both callers for returned and rejected failure handling;
   - make the minimum Pipeline component/test change needed for visible,
     accessible failure behavior;
   - run focused UI checks and write the handoff result here.
4. **Independent QA**
   - review the combined clean branch and return `GO` or `BLOCK` with direct
     evidence before browser verification.
5. **Browser verifier**
   - exercise all eleven supplied identities, exact allow/deny UI policy,
     error handling, navigation, console/network/server logs, and safe positive
     non-Won behavior where a disposable fixture is available.

Agents run sequentially and must not modify another agent's owned paths. No
schema change is expected; discovery of one requires an Agent 04 handoff before
implementation.

## Initial state

- Branch: `agent-05/atomic-stage-transitions`
- Base: `f90ecfab`, stacked above PR #23
- Working tree before this note: clean
- Source discovery: read-only; focused diagnostic tests previously passed, but
  the audit used host Node 24 and does not count as a release-qualified gate

→ Handoff to Agent 05. Reason: establish and, if necessary, repair the Core
non-Won transaction contract before Web selects it. Inputs: reproduced P1,
existing controller/service/client, PRD WO-11 gate, and acceptance criteria
above. Expected output: scoped source/tests, Node 22 verification, changeset
commit, and an explicit Agent 03 handoff or a documented blocker.

## Agent 05 — Core transaction authority

Verdict: `GO` for Agent 03. Core commit: `9496d282`.

The existing Core transaction already enclosed membership and opportunity row
locks, idempotency claim/completion, KYC and transition validation, opportunity
update, semantic audit, and SLA stop/start. One API contract gap was reproduced
before remediation: an authorized `contract -> lost` request without a reason
returned a successful committed result. Core now rejects both `lost` and
`closed_lost` without a meaningful reason as `409 reason_required`, matching
the existing regression rule and Pipeline requirement.

The service test harness now models serialized row-lock waiters and transaction
rollback. Coverage proves:

- all 24 allowed non-Won edges from the shared transition table commit with a
  strict non-conversion result;
- Owner, Admin, and Sales are allowed while all ten other roles are denied
  before any command or workflow write;
- current tenant membership, linked-Account tenant scope, dual-track KYC,
  regression reason, Lost reason, and semantic Lost-reason audit content;
- semantic-audit, SLA-stop, SLA-start, and idempotency-completion failures leave
  zero committed effect;
- completed-command replay, invalid stored-result rejection, different-command
  key reuse conflict, and same-key concurrent replay with every effect committed
  exactly once.

The rollback-contained protected HTTP canary now also asserts that a missing
Lost reason returns 409 and leaves no idempotency row. It compiled successfully
but was not executed because this worktree has neither `DATABASE_URL` nor
`ERP_API_INTEGRATION_EXPECTED=1`; the test remained one explicitly reported
skip. No database, demo data, environment, dependency, shared contract, or
deployment state changed.

Node 22.23.2 / pnpm 10.33.0 verification:

- initial focused baseline: PASSED, 3 files / 84 tests;
- red reproduction: FAILED as expected, 1/1 — Lost without reason resolved
  successfully;
- final stage-transition service suite: PASSED, 63/63;
- focused plus neighboring CRM/auth suites: PASSED, 4 files / 128 tests;
- full API unit/contract suite: PASSED, 187 files / 912 tests;
- API typecheck: PASSED;
- full API source lint: PASSED;
- API production build: PASSED, webpack compilation successful;
- `git diff --check`: PASSED;
- Gitleaks 8.30.1: PASSED, 1,770 commits / no leaks;
- PostgreSQL HTTP integration: BLOCKED, 1 skipped for absent integration
  bindings.

→ Handoff to Agent 03. Reason: the Core non-Won transaction and result contract
are source-complete and release-gated; the active Web action still owns the
non-transactional local writer. Inputs: Core commit `9496d282`, the exact
`reason_required` error, `transitionOpportunityStageThroughCoreApi`, the
tenant selector, and the acceptance criteria above. Expected output: route all
non-Won Pipeline transitions through Core with a stable per-command idempotency
key, validate the returned opportunity/tenant/from/to/non-conversion shape,
never fall back after selected-Core failure, preserve handled errors, run Web
gates, append this handoff, and commit only Agent 03 paths plus documentation.

## Agent 03 — Web Core selection

Verdict: `GO` for Agent 11. Web source commit: `0ed1bdbc`.

The Pipeline server action now selects the existing tenant-scoped Core stage
writer for every transition before any stage work. The former non-Won local
select/update, semantic-audit write, and best-effort SLA rollover were removed.
Exact normalized reasons are forwarded to Core, and deterministic SHA-256
idempotency keys cover non-Won commands while preserving the established Won
key namespace for retry compatibility.

Successful non-Won results are accepted only when opportunity identity, tenant
identity, requested destination, a valid shared from/to transition edge,
`convertedToProject: false`, and null Project/checklist conversion fields all
agree. Won result validation and Project-path revalidation remain intact. A
disabled or throwing selector, typed Core rejection, adapter failure/throw, or
invalid result returns a handled error with zero local stage work and zero
cache revalidation.

Node 22.23.2 / pnpm 10.33.0 verification:

- red action suite: FAILED as expected, 14 new non-Won cases entered the legacy
  local writer while 13 existing tests passed;
- final focused action suite: PASSED, 27/27;
- focused plus neighboring Pipeline/Core-client suites: PASSED, 3 files / 212
  tests;
- Web plus all configured E2E TypeScript projects: PASSED;
- full Web source lint: PASSED;
- Web production build: PASSED, 89 static pages generated; webpack emitted
  non-fatal cache-string serialization warnings;
- `git diff --check`: PASSED;
- Gitleaks 8.30.1: PASSED, no leaks found.

No Core/API source, Pipeline UI component, shared auth, schema, dependency,
demo data, credential, environment, or deployment state changed.

→ Handoff to Agent 11. Reason: the Web action now fails closed through the
atomic Core authority for Won and non-Won transitions; both Pipeline callers
must visibly and accessibly handle returned and rejected action failures.
Inputs: Core commit `9496d282`, Web commit `0ed1bdbc`, the handled error strings,
and green Web action/adapter evidence above. Expected output: inspect board and
conversion callers, make only the minimum Agent 11 component/test changes,
run focused UI and browser-adjacent gates, update this handoff/changeset, and
hand off the combined branch to independent QA or record a blocker.

## Agent 11 — Pipeline failure UX

Verdict: `GO` for independent QA. Pipeline source commit: `7e8e0a60`.

Both Pipeline transition callers previously rendered returned `{ error }`
results but awaited the server action inside an async transition callback
without handling a rejected Promise. A transport/runtime rejection could
therefore escape as an unhandled rejection, show no failure state, and leave
the user without a retry path.

The two callers now share one small action-result runner. It clears stale
failure state before every attempt, maps a rejected action to a safe visible
message, preserves exact returned errors, and invokes success work only after
an error-free result. `StageAdvanceButton` continues to expose its inline
`role="alert"`; `PipelineBoard` routes failures to its existing `role="alert"`
banner. Neither surface refreshes or performs an optimistic stage write on a
returned or thrown failure. The board's exact `reason_required` fallback still
opens the regression-reason dialog, and Lost reason forwarding is unchanged.

The existing semantic buttons, keyboard behavior, `useTransition` pending
state, disabled controls, and reason-dialog `isSubmitting` guard remain the
double-submit protections. A retry clears the prior error, while a successful
retry refreshes exactly once. No component-library, route, server-action,
dependency, or cross-agent source changed.

Node 22.23.2 / pnpm 10.33.0 verification:

- deterministic red reproduction: FAILED as expected, 1/1 — a rejected action
  Promise escaped instead of resolving to handled failure state;
- final focused action-result suite: PASSED, 3/3;
- focused plus neighboring Pipeline suites: PASSED, 3 files / 44 tests;
- Web plus all configured E2E TypeScript projects: PASSED;
- full Web source lint: PASSED;
- Web production build: PASSED, 89 static pages generated;
- `git diff --check`: PASSED;
- Gitleaks 8.30.1 through the pinned repository wrapper: PASSED, 1,775 commits /
  no leaks.

The repository has no established DOM component-test dependency, and the
temporary custom browser harness proved only a harness-load timeout, so it was
discarded without source or dependency residue. Deterministic unit coverage and
the existing rendered `role="alert"` paths gate this scoped change; a real
browser exercise remains with the designated browser verifier.

→ Handoff to independent QA. Reason: the combined Core, Web action, and
Pipeline caller changes are source-complete and release-gated within their
owners' scopes. Inputs: commits `9496d282`, `0ed1bdbc`, and `7e8e0a60`, exact
red/green evidence above, and the unchanged reason/double-submit UX. Expected
output: review the combined clean branch and return `GO` or `BLOCK` with direct
evidence before the eleven-identity browser matrix and safe disposable-fixture
transition proof.

## Independent QA round 1

Verdict: `BLOCK`; no P1, two P2 findings at clean HEAD `b0043186`.

1. Core correctly requires a meaningful Lost/Closed Lost reason, but the
   conversion control still describes the reason as optional and permits blank
   submission. Board drag-to-Lost sends an avoidable blank command and then
   reuses regression-only dialog copy, incorrectly describing Lost as a
   backward regression. Caller-level tests do not prove blank prevention,
   trimmed single submission, or pending duplicate protection.
2. The authoritative `test:wo-11-contract` gate is red because its source
   oracle still expects the retired Web-local KYC implementation. The gate must
   inspect authoritative Core KYC enforcement and separately prove Web
   delegation with no local writer.

Independent green evidence: Core 128/128, Web 215/215, shared 56/56; API,
Web/E2E, and shared TypeScript; API/Web/shared source lint; API and 89-page Web
production builds; gitleaks over 1,776 commits; diff checks; and Playwright
discovery. The PostgreSQL HTTP integration remained one explicit skip because
the required isolated database bindings were absent. Browser verification was
withheld while blocked.

→ Handoff to Agent 11 remediation. Reason: align both Pipeline callers with the
required Lost-reason contract before changing the cross-surface WO-11 oracle.
Inputs: QA round-1 findings, existing Lost/regression dialogs, typed action
runner, and Core's 1,000-character boundary. Expected output: Lost-specific
accessible required-reason UX on both callers; zero request for blank input;
trimmed single submission; preserved regression wording; returned/rejected
failure visibility; pending duplicate protection; focused tests and gates;
then explicit handoff to the WO-11 contract owner.

## Agent 11 remediation — required Lost reason

Verdict: `GO` for the WO-11 contract owner. Pipeline remediation commit:
`60c73bac`.

QA P2 #1 is remediated in both Pipeline callers. The conversion control's former
optional inline prompt was replaced by a dedicated `LostReasonDialog` whose copy
states that a reason is required. Board drops to Lost now resolve to that same
Lost-specific dialog before any request; actual backward moves continue to use
the regression-specific heading, copy, and confirmation behavior.

Both reason textareas have programmatic labels, the HTML `required` state, and a
shared 1,000-character maximum matching Core. Blank or whitespace-only Lost
reasons cannot enable the dialog confirmation and are independently rejected by
the caller submission boundary with zero action call. Accepted reasons are
trimmed and forwarded exactly once.

The existing typed action-result runner remains the returned/rejected failure
authority. Each caller now owns a stable submission guard around it, so a second
attempt while the first Promise is unresolved performs no request. The guard is
released after returned error, rejected action, or success; the runner still
clears stale visible failure state at start, renders failures through the
existing accessible alerts, and runs refresh only after success. Won behavior,
semantic buttons, role controls, KYC UI policy, and absence of optimistic stage
persistence are unchanged.

Node 22.23.2 / pnpm 10.33.0 verification:

- red regression-markup proof: FAILED as expected, 1/1 — no programmatic label
  or 1,000-character boundary;
- red Lost-dialog proof: FAILED as expected because no Lost-specific component
  existed;
- red caller-submitter proof: FAILED as expected, 3/6 — blank, trimmed-single,
  and pending-duplicate behavior did not exist;
- red stage-intent proof: FAILED as expected, 2/8 — Lost versus regression was
  not classified by a shared caller boundary;
- final focused plus neighboring Pipeline suites: PASSED, 4 files / 52 tests;
- Web plus all configured E2E TypeScript projects: PASSED;
- full Web source lint through direct pinned Node/pnpm targets: PASSED;
- Web production build: PASSED, 89 static pages generated;
- `git diff --check`: PASSED;
- Gitleaks 8.30.1 through the pinned repository wrapper: PASSED, 1,778 commits /
  no leaks.

The repository has no DOM interaction test dependency. Component accessibility
and copy are covered through React's server renderer; blank, trimming,
returned/rejected error, retry clearing, and pending-duplicate behavior are
covered through the same typed submission boundary invoked by both callers.
This is deterministic release evidence, not a substitute for the deferred real
browser exercise. An initial package-manager wrapper invocation selected host
Node 24 and was rejected by the engine guard; every reported release gate above
was rerun with direct pinned Node 22.23.2 and pnpm 10.33.0 paths.

No scripts, server actions, routes/pages, Core/API, shared auth, schema,
dependency, demo data, environment, credential, or deployment state changed.

→ Handoff to the WO-11 contract owner. Reason: QA P2 #1 is closed and the
remaining QA block is the stale cross-surface `test:wo-11-contract` source
oracle. Inputs: remediation commit `60c73bac`, Core commit `9496d282`, Web action
commit `0ed1bdbc`, QA round-1 finding #2, and 52/52 Pipeline evidence above.
Expected output: update only the authoritative WO-11 contract gate to inspect
Core KYC enforcement and separately prove Web delegation/no local writer, run
its neighboring release gates, append this handoff, and return to independent
QA.

## WO-11 contract-oracle remediation

Verdict: QA P2 #2 closed; returned to independent QA. Contract commit:
`50339af8`.

The stale Web-local KYC string oracle was replaced by structural TypeScript AST
checks. The gate now verifies Core tenant-scoped linked-Account and KYC-track
resolution, dual-track and legacy KYC behavior, shared transition and reason
rules, and Core ownership of persistence, semantic audit, and SLA rollover. A
separate Web validator proves one Core delegate covers every stage, selected-
Core failures remain closed, returned identity/edge fields are checked, and no
local stage writer or fallback remains.

Four mutation-sensitivity fixtures prove the gate turns red when Core KYC
enforcement, Account tenant scoping, Web Core delegation, or no-fallback
behavior is removed. The verifier uses the already-installed TypeScript
compiler API and adds no dependency.

Node 22.23.2 / pnpm 10.33.0 verification: initial gate RED 0/1 as reproduced;
final gate PASSED 5/5; Core 63/63; Web action and neighbors 226/226; API/Web
TypeScript, root and explicit script lint, API/Web builds, gitleaks over 1,781
commits, and diff checks passed. PostgreSQL integration remains blocked by
absent isolated bindings.

## Independent QA round 2

Verdict: `BLOCK`; the first two P2s are resolved, but one additional P2 was
found by the all-edge review at clean HEAD `3e1f3eba`.

The conversion view's `StageAdvanceButton` still treats valid
`negotiation -> bom_submission` and legacy
`resubmission -> bom_submission` regressions as ordinary actions and sends no
reason. Core correctly returns `reason_required`, but this surface exposes no
regression dialog or recovery path. Existing conversion-page tests mock the
button, while helper tests did not cover its caller wiring.

QA round-2 green evidence: Pipeline 52/52, Web/Core-client 223/223, Core
128/128, shared 56/56, WO-11 contract 5/5, API/Web/E2E/shared TypeScript,
source and verifier lint, 89-page Web build, gitleaks over 1,781 commits, and
diff checks. The database integration stayed blocked and browser verification
was withheld.

→ Handoff to Agent 11 remediation round 2. Reason: make the conversion caller
classify every destination before a request and provide the existing required
regression-reason flow for both affected BOM edges. Inputs: QA round-2 finding,
shared reason classifier/submitter, `RegressionReasonDialog`, and corrected
Lost behavior. Expected output: zero request before a valid regression reason;
blank/over-limit zero calls; trimmed single submission with
`reasonRequired: true`; no Lost regression; caller-wiring tests and focused
gates; explicit return to independent QA.

## Agent 11 remediation round 2 — conversion regressions

Verdict: runtime behavior corrected; returned to independent QA. Pipeline
commit: `aefde4fc`.

`StageAdvanceButton` now canonicalizes its current stage and classifies every
single, menu, and Lost destination before an action. Both canonical and legacy
BOM regression edges open `RegressionReasonDialog` with zero pre-reason call;
Lost retains its dedicated dialog, and ordinary forward/Won moves remain
direct. Valid regression confirmation uses the required synchronous guarded
submitter, while blank and over-limit reasons are rejected before the action.

Node 22.23.2 / pnpm 10.33.0 verification: four intended caller-routing reds;
final Pipeline 59/59; Web/E2E TypeScript, full source lint, 89-page build,
WO-11 contract 5/5, gitleaks over 1,784 commits, and diff checks passed.

## Independent QA round 3

Verdict: `BLOCK`; runtime behavior is correct, but the explicit mutation-
sensitive caller-wiring evidence is not satisfied.

The new `stage-advance-button` tests invoke the exported destination router and
submitter but do not inspect or render `StageAdvanceButton`. Removing the
component's `requestDestination -> routeStageAdvanceDestination` connection,
changing its three destination-control paths back to direct calls, or removing
the rendered `RegressionReasonDialog` confirmation wiring leaves all new tests
green. The pre-fix red proved the helper did not exist, not that the actual
caller stayed wired to it.

QA round-3 green evidence: Pipeline 59/59, Web/Core-client 230/230, Core
128/128, shared 56/56, WO-11 5/5, sequential Web/E2E TypeScript, and the
89-page Web build. Source lint, gitleaks, and diff evidence remain green. The
PostgreSQL lane stayed blocked and browser verification was withheld.

→ Handoff to Agent 11 remediation round 3. Reason: bind the existing behavior
tests to the actual component without adding a dependency. Inputs:
`StageAdvanceButton`, the installed TypeScript compiler API, QA's exact four
mutation targets, and the existing helper tests. Expected output: a structural
caller validator plus in-memory mutation cases proving every destination path
uses `requestDestination`, that it invokes the shared router, and that the
regression dialog renders with `onConfirm={confirmRegression}`; focused gates
and return to independent QA.

## Agent 11 remediation round 3 — caller evidence

Verdict: test-evidence defect closed; returned to independent QA. Test commit:
`9e728084`.

A Pipeline-owned TypeScript AST validator now parses the actual
`StageAdvanceButton` TSX. Its tests sever, in memory, each of the three
destination-control calls, the request-to-classifier link, and both regression
and Lost dialog confirmation bindings; each mutant fails with its specific
invariant. The validator also accepts benign multiline/comment/whitespace
formatting. No runtime component changed.

Node 22.23.2 / pnpm 10.33.0 verification: validator 7/7, Pipeline 66/66,
Web/E2E TypeScript, focused and full Web source lint, 89-page build, WO-11
5/5, gitleaks over 1,787 commits, and diff checks passed. Prettier remains not
installed; no dependency was added.

## Independent QA round 4

Verdict: `GO` for browser verification at clean HEAD `1980475b`; no in-scope
P1/P2 remains.

QA independently severed all six caller links and observed the expected
validator failures, then applied a benign formatting mutation with zero
issues. Review confirmed mutations stay in memory and the validator/test use
no write, rename, or delete API. The actual component keeps all three click
paths and both dialog confirmation bindings.

Independent green evidence: Pipeline 66/66, Core transition/guard 96/96, Web
Core client 171/171, shared contracts 56/56, WO-11 5/5, Web/E2E TypeScript,
full Web source lint, 89-page build, gitleaks over 1,787 commits, diff checks,
and clean status. PostgreSQL HTTP integration remains blocked without explicit
isolated bindings.

→ Handoff to browser verifier. Reason: the combined Core, Web, Pipeline UX,
contract, and mutation-sensitive caller evidence have independent QA approval.
Inputs: clean HEAD `1980475b`, all eleven supplied identities, the exact
3-allow/8-supplied-deny policy, Lost/regression/forward behaviors, and QA's
browser plan. Expected output: built-browser identity/visibility/navigation
matrix; regression/Lost pre-request validation, trimmed single-submit,
returned/transport failure and retry checks; console/network/server-log review;
and positive persistence only against an explicitly disposable or rollback-
contained fixture. Estimator/PM remain blocked without identities.

## Browser verification round 1

Verdict: `BLOCK / NO-GO` at clean HEAD `efa1c491`; one UI acceptance failure.

All eleven supplied identities passed login, identity, readable conversion and
board data, exact 3-allow/8-supplied-deny control visibility, accessible read-
only status, refresh/history, and sign-out. Canonical Negotiation-to-BOM and
Lost opened their distinct required dialogs before any request. Blank,
whitespace, and forced 1,001-character inputs made zero calls. Valid reasons
were trimmed; rapid pointer/keyboard attempts produced one request. Forward
and Won stayed direct. Typed and transport failures showed accessible alerts,
made no optimistic stage move, and caused no success refresh.

The failed retry probe delayed Core for five seconds. At 1.6 seconds after the
retry began, the prior typed alert and reason dialog were still visibly
present. The alert changed only when the new rejection completed. The helper's
`onStart` seam is therefore not equivalent to visible React behavior when its
state update is batched inside the async transition.

Eight browser POSTs targeted only an unused/disposable local Core endpoint:
seven reached in-memory fake Core processes and one exercised transport
failure. No hosted Core request or demo mutation occurred. Final stages,
ledgers, and Project count matched baseline. Page exceptions, unexpected HTTP
responses, non-CSP console errors, and Web server errors were zero; 52 console
entries were the known local HTTP CSP/RSC fallback noise. Browser, servers,
ports, artifacts, and temporary environment links were cleaned; Git stayed
clean.

Blocked evidence remains: no legacy `resubmission` fixture, no isolated
PostgreSQL binding for positive persistence/concurrency/rollback, and no
Estimator/PM identities.

→ Handoff to Agent 11 remediation round 4. Reason: stale visible error must
clear before the async transition boundary so retry state changes immediately,
without losing the dialog input or failure recovery. Inputs: browser timing
evidence, both callers, typed runner/submitter, and existing accessible alerts.
Expected output: synchronous pre-transition stale-error clearing proven at the
actual caller wiring; no request/success behavior regression; focused tests,
mutation-sensitive evidence, and return to independent QA plus a targeted
browser rerun.

## WO-11 contract owner — authoritative Core/Web oracle

Verdict: `GO` for independent QA. Contract-gate commit: `50339af8`.

QA P2 #2 is remediated without changing product source. The former oracle read
the retired Web-local KYC implementation and failed on its absent downstream
stage constant. The gate now uses the repository's installed TypeScript
compiler AST to inspect the two actual authorities:

- Core `transitionInTransaction` must resolve a linked Account by Account ID and
  authorized tenant, fail closed when the link is invalid, read KYC tracks by
  Opportunity and tenant, require every canonical approved track when any track
  exists, and use approved/not-required Account KYC only for the no-track legacy
  branch;
- Core must retain the shared transition table, regression/Lost reason rule,
  Opportunity persistence, semantic audit, and SLA stop/start inside its
  transaction method;
- Web `advanceOpportunityStage` must select Core for the profile tenant, invoke
  exactly one Core stage delegate before any Won/non-Won result branch, return
  selected-Core failures, validate returned identity and non-Won edge, and have
  no local Opportunity update, audit, SLA, or legacy conversion fallback.

The AST helpers are intentionally self-contained in the existing verifier: no
shared parser utility exists in `scripts/`, no dependency was added, and the
two exported domain validators are directly exercised with mutation fixtures.
Those fixtures prove the gate turns red if Core KYC enforcement or linked-
Account tenant scoping is removed, if Web delegation is removed, or if a Web-
local Opportunity writer is introduced.

Pinned Node 22.23.2 / pnpm 10.33.0 verification:

- baseline `pnpm test:wo-11-contract`: FAILED as expected, 0/1 —
  `WO-11 invariant missing: downstream stage set`;
- final `pnpm test:wo-11-contract`: PASSED, 5/5;
- focused Core stage-transition suite: PASSED, 63/63;
- Web action lane: PASSED, 21 files / 226 tests, including 27/27 Pipeline
  action cases;
- API and Web typechecks: PASSED;
- root application-source lint and explicit no-ignore lint for both changed
  scripts: PASSED;
- API production build: PASSED;
- Web production build: PASSED, 89 static pages generated;
- syntax checks for both changed scripts: PASSED;
- Prettier: NOT RUN because no Prettier binary is installed in this repository.

No Core/API/Web product source, route/UI, shared auth, schema, dependency, demo
data, environment, credential, or deployment state changed. The PostgreSQL HTTP
integration remains BLOCKED exactly as before because `DATABASE_URL` and
`ERP_API_INTEGRATION_EXPECTED=1` are absent; this gate supplies deterministic
source-contract and existing mocked behavior evidence, not fabricated live DB
proof.

→ Handoff to independent QA. Reason: both round-1 P2 findings now have scoped
remediations and the authoritative WO-11 gate is green and mutation-sensitive.
Inputs: Core `9496d282`, Web `0ed1bdbc`, Pipeline `7e8e0a60`, Lost UX
`60c73bac`, this contract-gate commit, and the exact checks above. Expected
output: independently rerun the combined branch, return `GO` or `BLOCK` with
direct evidence, then release the designated browser identity/failure matrix
only on `GO`.

## Agent 11 remediation round 2 — conversion regressions

Verdict: `GO` for independent QA. Pipeline source commit: `aefde4fc`.

`StageAdvanceButton` now routes every single-button, menu, and Lost destination
through a caller-owned destination router. The router canonicalizes the current
stage with `STAGE_LEGACY_MAP`, then calls `getStageTransitionReasonKind` before
any action can run. Canonical `negotiation -> bom_submission` and legacy
`resubmission -> bom_submission` therefore open the existing
`RegressionReasonDialog` and return with zero request. Lost/Closed Lost still
open `LostReasonDialog`, while forward and Won destinations retain the existing
direct guarded submission path and allowed menu options.

Regression confirmation uses the existing synchronous guarded submitter with
`reasonRequired: true`. The shared dialog and submitter continue to reject blank,
whitespace-only, and over-1,000-character input with zero action call; a valid
reason is trimmed and forwarded exactly once. Returned and rejected action
failures still reach the existing inline alert, stale failure clears on retry,
and refresh remains success-only. Pending/double-submit protection, semantic
buttons, keyboard behavior, role visibility, and corrected Lost behavior are
unchanged.

The new caller-module tests are intentionally above the generic classifier:
they prove both affected source stages route to the regression prompt without
calling advance, Lost routes only to its Lost-specific prompt, and ordinary
forward work remains direct. The same caller suite proves invalid required
reasons make zero calls and a valid reason is forwarded once after trimming.

Pinned Node 22.23.2 / pnpm 10.33.0 verification:

- caller-routing red: FAILED as expected, 4/4 — the conversion caller had no
  destination router and could not expose either regression prompt;
- final focused plus neighboring Pipeline suites: PASSED, 5 files / 59 tests;
- Web plus all configured E2E TypeScript projects: PASSED;
- full Web source lint: PASSED;
- Web production build: PASSED, 89 static pages generated;
- authoritative WO-11 contract: PASSED, 5/5;
- `git diff --check`: PASSED;
- Gitleaks 8.30.1 through the pinned repository wrapper: PASSED, 1,783 commits /
  no leaks.

The repository still has no DOM interaction-test dependency. This round uses a
public destination router in the caller module plus the same guarded submission
boundary invoked by the component, so the missing caller classification is
deterministically covered without adding test infrastructure. Real browser
interaction remains the designated verifier's gate.

No action, Core/API, script, shared package, auth, route/page, schema,
dependency, demo data, environment, credential, or deployment state changed.

→ Handoff to independent QA. Reason: the final known P2 conversion-regression
gap is closed at the caller boundary and all requested release gates are green.
Inputs: source commit `aefde4fc`, prior Core/Web/Pipeline/contract commits, the
4-case red and 59-case green evidence above, and the unchanged environment-
blocked PostgreSQL integration boundary. Expected output: rerun the combined
branch and return `GO` or `BLOCK` with direct evidence, then release browser
verification only on `GO`.

## Agent 11 remediation round 3 — caller-wiring release evidence

Verdict: `GO` for independent QA. Pipeline test commit: `9e728084`.

The runtime component was already correct and was not changed. A focused
validator now parses the actual `StageAdvanceButton` TSX with the repository's
installed TypeScript compiler. It structurally requires the single-forward,
menu-stage, and Lost destination calls to use `requestDestination`; requires
that function to invoke `routeStageAdvanceDestination`; and requires the
rendered Regression and Lost dialogs to retain their respective
`confirmRegression` and `confirmLost` bindings.

The test reads the real component once and performs all six mutations on
in-memory source strings only. Replacing any destination call, the shared-router
call, or either dialog confirmation binding makes the validator report the
specific severed connection. The existing behavioral router and guarded-
submitter tests remain unchanged.

Pinned Node 22.23.2 / pnpm 10.33.0 verification:

- initial validator import: FAILED as expected because the validator did not
  exist;
- final validator suite: PASSED, 7/7, including six mutation cases;
- focused plus neighboring Pipeline suites: PASSED, 6 files / 66 tests;
- Web plus all configured E2E TypeScript projects: PASSED;
- focused validator lint and full Web source lint: PASSED;
- Web production build: PASSED, 89 static pages generated;
- authoritative WO-11 contract: PASSED, 5/5;
- `git diff --check`: PASSED;
- Gitleaks 8.30.1 through the pinned repository wrapper: PASSED, 1,787 commits /
  no leaks;
- Prettier: NOT RUN because this repository does not install a Prettier binary.

No production runtime, action, Core/API, script, shared package, auth,
route/page, schema, dependency, demo data, environment, credential, or
deployment state changed.

→ Handoff to independent QA. Reason: the round-3 P2 was release-evidence only,
and the real caller is now protected by semantic, mutation-sensitive source
validation. Inputs: test commit `9e728084`, the 7/7 validator result, the 66/66
behavioral result, and the unchanged runtime commits. Expected output:
independently sever the six validated connections or rerun the supplied
mutants, then return `GO` or `BLOCK` with direct evidence.

## Agent 11 remediation round 4 — urgent retry alert clearing

Verdict: `GO` for independent QA and targeted browser rerun. Pipeline source
commit: `e66ca6d1`.

The browser failure was caused by each stale-alert clear running from the typed
runner's `onStart` callback after the caller had already entered React's async
`startTransition`. React deferred that state update with the transition, so the
prior failure remained visible during a delayed retry.

Both actual callers now clear their own stale failure synchronously before
calling `startTransition`: `StageAdvanceButton.advance` calls `setError(null)`,
and `PipelineBoard.performAdvance` calls `clearBanner()`. The existing submitter,
dialog state and reason input lifecycle were not moved or cleared to mask the
problem. The `onStart` behavior remains intact, so pending/disabled state,
single-call protection, Lost/regression flows, returned/thrown failure display,
retry behavior, and success-only refresh are unchanged.

The TypeScript-AST validator now requires each clear as a direct caller
statement before its `startTransition`. Its in-memory mutants move each clear
after the transition and are rejected independently. A delayed returned-error
behavior test additionally proves the failure becomes the visible alert and
the success callback remains unused; the existing rejected-error case remains
green.

Pinned Node 22.23.2 / pnpm 10.33.0 verification:

- caller-ordering red: FAILED as expected with both missing pre-transition
  issues;
- final focused plus neighboring Pipeline suites: PASSED, 6 files / 70 tests;
- Web plus all configured E2E TypeScript projects: PASSED;
- focused changed-source lint and full Web source lint: PASSED;
- Web production build: PASSED, 89 static pages generated;
- authoritative WO-11 contract: PASSED, 5/5;
- `git diff --check`: PASSED;
- Gitleaks 8.30.1 through the pinned repository wrapper: PASSED, 1,791 commits /
  no leaks.

No action, Core/API, script, shared package, auth, route/page, schema,
dependency, demo data, environment, credential, or deployment state changed.

→ Handoff to independent QA and targeted browser verification. Reason: both
callers now make the stale-error clear urgent before React's transition
boundary, with mutation-sensitive evidence. Inputs: source commit `e66ca6d1`,
the exact five-second delayed retry probe from browser round 1, and the 70/70
focused result. Expected output: rerun the delayed StageAdvanceButton inline
alert and PipelineBoard banner retries; verify each prior alert disappears
while the request remains pending, dialog/input behavior is unchanged, and the
new returned/thrown failure appears without refresh.

## Independent QA round 5

Verdict: `GO` for targeted browser rerun at clean HEAD `93d26465`; no P1/P2.

QA confirmed both urgent clears execute as direct statements before
`startTransition`, that board clearing also cancels the stale banner timer, and
that dialog/reason state remains unchanged. Returned and thrown failures still
reach accessible alerts; synchronous duplicate suppression, invalid-reason
zero-call behavior, zero failure refresh, and success-only refresh remain.

Independent in-memory probes removed and reordered each caller clear and
observed the expected invariant failures; benign multiline/comment/whitespace
formatting remained valid. Focused Pipeline 70/70, Web/E2E TypeScript, full Web
source lint, WO-11 5/5, the 89-page production build, diff checks, and clean
status passed. PostgreSQL integration remains blocked without isolated
bindings.

→ Handoff to targeted browser rerun. Reason: reproduce the five-second retry
on both alert surfaces and prove the prior alert disappears immediately while
pending, then the new failure appears without refresh. Preserve dialog input,
exercise returned and transport failures, count single requests, inspect
console/network/server output, and avoid hosted mutation.
