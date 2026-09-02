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
