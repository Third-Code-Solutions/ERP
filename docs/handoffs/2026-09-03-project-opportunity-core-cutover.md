# Project-detail Opportunity Core cutover

## Delivery contract

Goal: retire the mounted Project-detail Opportunity stage writer so every stage
mutation uses the same tenant-safe Core authority as Pipeline. Project detail
must preserve readable Opportunity data for all roles while exposing working
mutation UI only to the established Owner/Admin/Sales policy.

This is a distinct mounted entry point discovered after the Pipeline cutover;
it does not reopen the already-verified Pipeline callers.

In scope:

- `OpportunityPanel` stage controls and response/error behavior;
- the Project-detail Opportunity server action and page-owned permission prop;
- authoritative handling of the panel's bundled TCV/GP/date values without a
  pre-Core local write;
- canonical shared transition edges and existing Lost/regression reason UX;
- exact thirteen-role control/action policy;
- mounted-entry-point contract coverage, independent QA, and safe browser
  verification across all supplied identities.

Out of scope:

- stage taxonomy or role-policy changes;
- schema or dependency changes unless an API contract gap is proven and routed
  through the required owner;
- Viewer-sensitive read-policy decisions;
- hosted demo mutation or production deployment;
- queued rejected-command `unknown.command` logging remediation.

## Reproduced P1

The Project page renders `OpportunityPanel` for every role allowed to read
Opportunity data. The panel imports a second `transitionStage` action and owns
an incompatible transition table that permits `negotiation -> closed_won`.
The action directly commits stage/probability/TCV/GP/weighted TCV, writes the
semantic audit afterward in a separate transaction, and performs no shared
edge validation, tenant-linked KYC gate, required reason handling, idempotency,
SLA rollover, Won conversion, checklist, or notification work.

Audit failure can therefore leave a committed stage, and Owner/Admin/Sales can
create a terminal Won state without the Project handoff invariants. For the
other ten roles, mutation controls are still rendered; a resolved
`{ error: 'Forbidden' }` is ignored and the form closes as if successful.
Pinned Node 22 probes reproduced both the direct writer and the invalid Won
edge while WO-11 5/5, Project role projection 13/13, and the existing Web action
lane 226/226 remained green because no gate enumerates this mounted writer.

## Agent 01 path assignment

For this slice, Agent 11 explicitly owns
`apps/web/src/components/opportunities/` and its focused tests. The registry did
not previously assign this feature directory precisely. Agent 11 may consume
shared Pipeline primitives but must not modify `components/pipeline/` without a
separate handoff. Agent 03 retains the Project route/action and permission-prop
boundary. Agent 05 retains Core/API/shared command contracts.

## Acceptance criteria

1. The Project-detail stage path has no direct Opportunity stage write, local
   transition table, separate stage audit, or fallback. Every transition uses
   the tenant-selected Core adapter and shared edge rules.
2. TCV/GP/closing-date edits are never committed before Core stage success.
   Retain them only through an existing or minimally extended atomic authority;
   otherwise separate the UX without silently dropping user input and record a
   product-safe migration.
3. Lost and real regressions use the established distinct, accessible,
   required, 1,000-character reason flows with blank/oversized/duplicate zero-
   call behavior.
4. Owner/Admin/Sales see working create/advance controls. The other ten roles
   see read-only Opportunity data with no mutation controls. Both server
   actions still deny unauthorized direct calls before effects.
5. Returned or thrown transition failures remain visibly accessible, keep the
   panel/form recoverable, cause no refresh or persistent effect, and clear
   stale state before retry. Valid success refreshes Project detail; Won also
   validates and refreshes the returned Project.
6. A source/AST contract enumerates every mounted Opportunity stage-mutation
   entry point and fails if a direct writer, duplicate transition table, or
   unguarded caller is added.
7. Focused Core/Web/UI/role tests, WO-11, type/lint/build/security gates,
   independent QA, and the supplied-account browser matrix pass. Positive
   persistence must use an explicitly isolated rollback-contained fixture.

## Sequential ownership

1. **Agent 05 — API & Backend Logic**
   - inspect whether an existing Core command atomically accepts the panel's
     TCV/GP/closing-date edits with stage transition;
   - if not, decide and implement the smallest domain-safe API contract within
     Agent 05 paths, or explicitly hand off a no-API-change separation plan;
   - prove the contract and commit before Web work.
2. **Agent 03 — Next.js App Router Engineer**
   - retire the local Project action writer, select Core without fallback, and
     pass exact mutation permissions from the Project route;
   - preserve direct-action defense and strict result/revalidation behavior.
3. **Agent 11 — Opportunity panel UX**
   - replace the duplicate stage form/table with established shared state and
     reason/error/pending behavior under the path assignment above;
   - keep read-only data complete and mutation controls exact by role.
4. **Contract owner and independent QA**
   - enumerate all mounted stage writers and challenge the combined branch.
5. **Browser verifier**
   - run all eleven supplied identities, safe local-Core failure/retry probes,
     and isolated persistence only when a disposable fixture exists.

Agents run sequentially and do not edit another owner's paths. Discovery of a
schema change requires an Agent 04 handoff and stops this sequence.

## Initial state

- Branch: `agent-03/project-opportunity-core-cutover`
- Base: `4d95e510`, stacked above PR #24
- Working tree before this note: clean
- No source, data, configuration, dependency, or deployment change made during
  discovery

→ Handoff to Agent 05. Reason: resolve the bundled financial-field authority
before the Web writer is removed. Inputs: reproduced mounted P1, existing Core
stage command, panel form/action, PRD WO-11/WO-13 constraints, and acceptance
criteria above. Expected output: evidence-backed API/no-API decision, scoped
tests and source only if required, Node 22 gates, commit, and explicit Agent 03
handoff or blocker.

## Agent 05 result — atomic commercial-field authority

Decision: extend the existing Core stage-transition command. There is no
authoritative Core Opportunity update mutation to call first or compose with;
`OpportunitiesController` exposes reads only. Separating the panel's stage
submission from its TCV, GP, and closing-date edits would therefore either
silently discard established input or reintroduce a second write transaction.
The legacy mounted transition payload already treats the four values as one
user operation, so the smallest domain-safe contract is the existing locked
stage transaction.

Source commit: `cb3d7b3d` (`fix(crm): retain opportunity commercial edits on
stage change`).

The strict shared command now optionally accepts:

- `tcvCents`: non-negative safe integer;
- `gpCents`: signed safe integer, preserving legitimate negative GP;
- `closingDate`: RFC 3339 datetime with an explicit offset.

Omitted values preserve the locked Opportunity row. Supplied values are written
with stage, probability, closing/lost state, and exact weighted TCV inside the
existing transaction. Weighted TCV uses a `BigInt` intermediate so multiplication
cannot silently exceed JavaScript's precise-integer range. Commercial before/
after values are included in the semantic stage audit, while the already-
canonical command hash covers the new fields for replay, key-reuse rejection,
and serialized same-key concurrency. The strict result shape is unchanged.

No schema, dependency, Web, data, environment, credential, or deployment change
was required.

### Agent 05 evidence

- TDD contract red: 1 failed / 8 passed because all three commercial keys were
  rejected; final contract suite passed 9/9.
- TDD service red: 2 failed / 65 passed because TCV/GP/date were not persisted
  and weighted TCV used the old TCV; final service suite passed 67/67.
- The service suite proves field preservation, cent rounding, signed GP,
  semantic audit, validation before transaction, command-hash key reuse,
  same-key concurrency, and rollback across audit, SLA stop/start, and request
  completion failures.
- Full shared suite passed 66 files / 442 tests.
- Shared and API TypeScript, scoped source ESLint, API production build,
  whitespace checks, and pinned Gitleaks 8.30.1 over 1,794 commits passed.
- The broad API suite was not completed: an unrelated delivery-controller case
  timed out while the frozen offline install and suites ran concurrently. Its
  isolated rerun passed 24/24. No full-suite pass is claimed.
- The protected PostgreSQL HTTP canary compiles and is extended to assert the
  enriched request plus persisted TCV/GP/weighted/date state, but remained one
  environment-gated skip because `DATABASE_URL` and
  `ERP_API_INTEGRATION_EXPECTED=1` were unavailable. No live database proof is
  claimed.

→ Handoff to Agent 03. Reason: the Core command now owns the panel's complete
atomic stage operation. Inputs: source commit `cb3d7b3d`, optional camelCase
fields above, unchanged strict result, and the existing Core selector/client.
Expected output: remove the Project action's direct Opportunity update and
separate audit/SLA behavior; convert the panel's `YYYY-MM-DD` date control to an
explicit-offset RFC 3339 `closingDate`; forward `tcvCents`, signed `gpCents`, and
`closingDate` with `newStage` through selected Core using one stable idempotency
command and no fallback; preserve omitted fields; validate the committed result
before success-only revalidation; retain exact Owner/Admin/Sales direct-action
authorization. Do not add a pre-Core financial write.
