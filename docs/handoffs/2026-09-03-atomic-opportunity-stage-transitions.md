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
