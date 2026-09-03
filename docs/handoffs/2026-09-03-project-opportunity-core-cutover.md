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

## Agent 03 result — Project route Core cutover

Source commit: `9f83cbd8` (`fix(projects): route opportunity transitions
through core`).

The mounted Project-detail stage action no longer reads or updates the
Opportunity locally and no longer writes a separate Web audit or SLA effect.
After exact `opportunity.advance_stage` authorization, it validates the full
form command, requires the tenant selector, and delegates exactly once to
`transitionOpportunityStageThroughCoreApi`. Selector disablement/throw,
transport rejection, typed Core failure, and invalid returned identity,
tenant, edge, destination, or conversion shape all return handled errors with
no local write or revalidation fallback.

The action forwards the canonical stage plus supplied TCV, signed GP, trimmed
reason, and closing date. Blank fields remain omitted. The Project panel's
Philippine date-only value is calendar-validated and normalized to
`YYYY-MM-DDT00:00:00+08:00`; focused coverage formats the resulting instant in
`Asia/Manila` and proves the selected calendar day does not drift. A SHA-256
key over Opportunity identity and the normalized complete command provides
stable exact-retry idempotency while distinguishing commercial-field changes.

Only a fully validated success revalidates the source Project, Dashboard, and
Pipeline board/coverage/conversion paths. A validated Won conversion also
revalidates and returns the committed Core Project. The Project route now
derives `canCreate` and `canMutate` with the central `can()` policy and passes
both to `OpportunityPanel`; tests enumerate all thirteen roles and prove the
exact Owner/Admin/Sales allow set and ten-role deny set.

### Agent 03 evidence

- TDD red: 18 failed / 10 passed. The mounted action wrote the local database,
  accepted an invalid edge, ignored Core failures, and rejected the panel's
  date-only input; all ten unauthorized-role direct calls were already denied.
- Focused and neighboring Web tests: PASSED, 5 files / 94 tests (Project
  Opportunity action 31, route contract 15, Project access 13, Pipeline action
  27, neighboring Project action 8).
- Web TypeScript, including configured E2E projects: PASSED.
- Full Web source ESLint: PASSED with zero warnings.
- Web production build: PASSED, 89/89 static pages generated.
- Diff/whitespace checks: PASSED.
- Pinned Gitleaks 8.30.1 after the source commit: PASSED, 1,797 commits / no
  leaks. Final scan after documentation: PASSED, 1,798 commits / no leaks.
- WO-11 contract: PARTIAL, 4/5 passed. The main invariant and three other
  mutation challenges passed. The remaining out-of-scope test-infrastructure
  case failed before exercising the verifier because
  `scripts/verify-wo-11-kyc-gate.test.mjs` could not apply its stale exact-text
  Pipeline-action mutation (`mutation fixture must add a Web-local writer`).
  The script is outside Agent 03 scope and was not changed. This was reproduced
  under pinned Node 22.23.2 / pnpm 10.33.0, so it is not wrapper runtime drift.

No Core/API, shared, Pipeline, Opportunity component, schema, dependency,
script, demo-data, credential, environment, or deployment file was changed by
Agent 03.

→ Handoff to Agent 11. Reason: the Project route and action now expose the
canonical permissions and atomic Core-backed mutation contract, while the
mounted panel still owns the form wiring and user experience. Inputs: source
commit `9f83cbd8`; `canCreate`/`canMutate` props; required hidden `project_id`;
stage action fields `opportunity_id`, `project_id`, `new_stage`, optional
`reason`, `tcv_cents`, signed `gp_cents`, and `closing_date` (`YYYY-MM-DD`);
handled `{ error }` and optional Won `{ projectId }` results. Expected output:
update `OpportunityPanel` within Agent 11 scope to consume both permissions,
submit the full command including `project_id`, preserve exact allowed
transition/reason behavior, show returned and rejected failures recoverably,
prevent duplicate submission, and retain user input on failure. Do not add a
local write or pre-Core commercial-field mutation. Then return to independent
contract QA; the stale WO-11 mutation fixture remains a separately owned test
infrastructure follow-up.

## Agent 11 result — Project Opportunity panel UX

Source commit: `ebaa5dd3` (`fix(opportunities): harden project panel
transitions`).

`OpportunityPanel` now consumes the route-owned `canCreate` and `canMutate`
decisions. Owner, Admin, and Sales receive the create and transition controls;
the other ten roles retain complete Opportunity rows with no mutation controls
and an accessible read-only status.

The panel removed its duplicate transition table and projects destinations
from shared `STAGE_TRANSITIONS` through `STAGE_LEGACY_MAP`. It submits the
Agent 03 action contract with Project/Opportunity identity, destination, and
the optional TCV, signed GP, and Philippine date-only controls. Lost and actual
regression edges open the existing distinct Pipeline dialogs, require a
trimmed reason within the 1,000-character Core boundary, and use the existing
guarded stage submitter. Invalid or duplicate requests do not call the action.

Creation and transition callers clear stale alerts before `startTransition`,
surface returned and rejected errors through `role="alert"`, retain the open
form/row/dialog after failure, and close only from `onSuccess`. A synchronous
shared in-flight guard plus disabled controls prevents cross-surface duplicate
submission. Inputs remain labelled and keyboard-operable; signed GP is no
longer clamped or hidden, and creation dates are normalized to explicit
Philippine midnight for the existing action boundary.

### Agent 11 evidence

- Role SSR red: 13/13 failed because props were ignored and read-only status
  was absent; final role projection passed 13/13 with the literal three-allow /
  ten-deny policy.
- Mounted caller source red: 4/4 failed on the duplicate transition table,
  missing shared model/submitter wiring, absent reason dialogs/alert, and raw
  creation FormData; final AST/source contract passed 5/5.
- Focused UI/model/source plus neighboring Pipeline tests: PASSED, 5 files /
  43 tests.
- Wider Project action/route/role and Pipeline neighbor lane: PASSED, 10 files /
  119 tests.
- Web and configured E2E TypeScript: PASSED.
- Full Web source ESLint: PASSED with zero warnings.
- Web production build: PASSED, 89/89 static pages generated.
- Diff/whitespace checks before source commit: PASSED.
- WO-11 contract: PARTIAL, 4/5 passed. The inherited out-of-scope stale
  Pipeline exact-text mutation fixture still fails setup with
  `mutation fixture must add a Web-local writer`; the main invariant and three
  other mutation challenges pass. No script was changed.
- Gitleaks was not rerun after the Agent 11 source commit because the resumed
  closeout explicitly prohibited rerunning broad gates; independent QA should
  include the final branch scan.

No route, page, action, Pipeline primitive, Core/API/shared, script, schema,
dependency, data, environment, credential, or deployment file was changed by
Agent 11.

→ Handoff to the contract owner and independent QA. Reason: Core, Project
action, permission projection, and mounted panel wiring are now connected.
Inputs: Agent 05 commit `cb3d7b3d`, Agent 03 commit `9f83cbd8`, Agent 11 commit
`ebaa5dd3`, the 119-test wider lane, and the documented WO-11 fixture drift.
Expected output: independently enumerate mounted Opportunity stage writers,
challenge permission/reason/error/pending mutations, run final diff and
Gitleaks, and perform the approved safe browser identity/failure-retry matrix
without mutating shared demo or production data.

## Contract-owner result

The stale WO-11 exact-text fixture was replaced and the mounted-entry contract
expanded in commit `6a18d07a`. The gate passed 13/13: authoritative and benign
TypeScript-printer runs plus eleven mutation challenges. It enumerates the
Pipeline and Project-detail stage actions, checks Core selection/no local
writer, and inspects Project panel/model plus central role projection. Focused
shared 9/9, Core 67/67, Web 121/121, root typecheck/lint, API and 89-page Web
builds, diff, and gitleaks over 1,802 commits passed. PostgreSQL remained
environment-blocked.

## Independent QA round 1

Verdict: `BLOCK`; two P1 and three P2 findings at clean HEAD `8f4bc28e`.

P1 findings:

1. Project-detail creation still offers gated initial stages and inserts them
   without an Account or KYC tracks. Core also skips its downstream KYC gate
   when `accountId` is absent, so an accountless Opportunity can bypass WO-11.
2. Creation inserts the Opportunity and writes audit separately. Audit failure
   reports an error after the row commits; retry can create a duplicate because
   there is no transaction or idempotency authority.

P2 findings:

1. The mounted-entry scanner misses exported arrow actions and an aliased
   Opportunity-table writer. It also ignores stage-bearing inserts; independent
   temp-only mutations passed incorrectly.
2. Lost and regression dialogs have `role="dialog"` but no accessible name.
3. Creation accepts unbounded coerced monetary numbers and uses floating-point
   weighted TCV. The Project transition action also lacks the required
   structured per-outcome server-action log.

QA otherwise confirmed the transition cutover: strict safe commercial fields,
Manila date normalization, 24 non-Won edges/Won handoff, tenant/current-
membership/KYC logic, Core-only action, exact roles, reason/error/pending UX,
and success-only revalidation. Shared 442/442, Core 100/100, Web 168/168,
WO-11 13/13, root typecheck/lint/builds, diff, and gitleaks passed. PostgreSQL
remained blocked; browser verification was withheld.

→ Handoff to Agent 05 remediation. Reason: determine and implement the atomic
creation authority and fail-closed accountless KYC rule from the real
Project/Account model before Web/UI/contract corrections. Inputs: QA P1s,
existing Project create form/action, PPRF/WO-11 rules, current request ledger,
and safe-cent patterns. Expected output: no direct downstream creation; atomic
idempotent create plus semantic audit; safe TCV/GP/weighted math; tenant/current
membership/role/Project/Account validation; accountless downstream rejection;
focused rollback/replay/concurrency proof; explicit Agent 03 handoff or a
documented material product-model blocker.

## Contract owner result — mounted Opportunity entry inventory

Contract commit: `6a18d07a` (`test(crm): enumerate opportunity stage entry
contracts`).

Decision: **GO to independent browser QA.** The local source contract now
fails closed unless the exported Opportunity stage-mutation action inventory is
exactly:

1. Pipeline `advanceOpportunityStage`;
2. Project-detail `transitionStage`, mounted by `OpportunityPanel`.

The inventory walks Web `actions.ts`/`actions.tsx` exports and their local call
graphs, then matches the exact expected set when it finds the Core stage
delegate or a local `update(opportunities)` writer. Each action separately must
select Core once with the authenticated tenant, delegate once with a stable
idempotency key, validate the shared returned edge and tenant identity, and
contain no reachable local Opportunity update, semantic audit, SLA rollover,
or legacy conversion fallback. Named import aliases for the selector, delegate,
Opportunity table, and forbidden helpers are resolved.

The same authoritative gate now verifies that the Project panel mounts the
enumerated action, projects destinations from `STAGE_TRANSITIONS` through the
shared model, routes Lost and regression reasons through the Pipeline reason
authority, submits one normalized command, and permission-guards all create and
transition callers. The Project route must derive and pass both permissions
through central `can(...)`; the shared policy must remain exactly thirteen
roles with Owner/Admin/Sales allowed and the other ten denied for both create
and advance.

All mutation fixtures use TypeScript AST transformations and in-memory printer
output. No exact source-text insertion remains. A dedicated benign-printer case
proves formatting-only changes remain accepted. The bounded verifier does not
perform whole-program TypeScript symbol flow across arbitrary imported helper
bodies or computed/dynamic calls; it instead fails closed on the exact mounted
actions, required imports/calls, local call graph, and realistic named-import
aliases.

### Contract-owner evidence

- Baseline reproduced under Node 22.23.2 / pnpm 10.33.0: **FAILED as expected,
  4/5**, because the stale exact-text Pipeline writer fixture could not create
  its mutation.
- Updated WO-11 contract: **PASSED, 13/13** — one authoritative run, one benign
  TypeScript-printer formatting case, and eleven mutation challenges covering
  Core KYC/tenant authority, both Core delegates, both local-writer paths,
  Project local audit, duplicate panel transitions, reason bypass, route
  permission wiring, and panel caller guarding.
- Focused shared command contract: **PASSED, 9/9**.
- Focused Core transition service: **PASSED, 67/67**.
- Focused Project action/route/panel and Pipeline-neighbor lane: **PASSED, 8
  files / 121 tests**.
- Root typecheck: **PASSED, 5/5 tasks**.
- Full application-source ESLint: **PASSED, zero warnings**.
- API production build: **PASSED**.
- Web production build: **PASSED, 89/89 static pages generated**.
- Script syntax and diff/whitespace checks: **PASSED**.
- Pinned Gitleaks 8.30.1: **PASSED, 1,802 commits / no leaks** after the
  contract commit and documentation closeout.

No Core/API/Web runtime, UI, shared contract, schema, dependency, data,
environment, credential, or deployment file changed in this contract slice.
The Agent 05 PostgreSQL HTTP canary remains **BLOCKED/NOT RUN** exactly as
before: `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` are unavailable, so
the one protected integration case remains environment-gated and no live
persistence claim is made.

→ Handoff to independent browser QA. Reason: the source contract and local
quality gates are green, while role rendering and safe failure/retry behavior
still require the supplied-identity browser matrix. Inputs: Core/API commit
`cb3d7b3d`, route/action commit `9f83cbd8`, panel commit `ebaa5dd3`, contract
commit `6a18d07a`, exact two-entry inventory, and the unchanged PostgreSQL block.
Expected output: safe local browser coverage for all supplied identities,
selector/Core failure and retry recovery, no shared demo or production writes,
and an explicit final GO/BLOCK decision.
## Agent 05 QA remediation — atomic Project Opportunity creation

Source commit: `234ebe03` (`fix(crm): make opportunity creation atomic`).

Decision: **GO to Agent 03 contract adoption; not yet GO to independent QA.**
The data model supports a usable Project-led create command without inventing an
Account choice. `projects.account_id` is the canonical Account link and remains
nullable for legacy Projects; Core therefore derives it from the tenant-scoped
Project, validates it in the same tenant when present, and permits an accountless
legacy Project only at the safe `opportunity_creation` initial stage. Any later
KYC-gated transition now fails closed unless a linked Account resolves in the
current tenant. Existing dual-track PPRF KYC and legacy Account-status fallback
rules remain unchanged after that prerequisite.

`POST /v1/crm/opportunities` is now the single atomic create authority. It
rechecks the current `users` membership and the central
`opportunity.create` capability, validates the active Project and its linked
Account, inserts the Opportunity, writes semantic audit evidence, and completes
a namespaced replay record in one transaction. The implementation reuses the
existing service-only Opportunity request ledger under an
`opportunity-create:` namespace because this remediation expressly prohibited
schema changes. A unique tenant/key claim plus row locking serializes concurrent
calls; a losing provisional insert is removed before a succeeded result is
replayed. Audit or completion failure rolls the whole transaction back.

The strict create and transition HTTP contracts now represent TCV, signed GP,
and weighted TCV as canonical decimal centavo strings. They reject unsafe,
non-canonical, or floating monetary input. Core computes weighted TCV with
`BigInt` and half-up centavo rounding, then converts only already-bounded exact
integers at the current Drizzle `bigint({ mode: 'number' })` persistence
adapter. This is an intentional breaking correction to the optional transition
commercial fields; no numeric currency remains in the changed command/result
boundary.

### Agent 05 evidence

- TDD red: the new shared create contract failed 8/10 before implementation;
  the accountless `site_survey -> design` Core case incorrectly succeeded.
- Focused create/controller/transition authority: **PASSED, 3 files / 93 tests**.
  Coverage includes all thirteen roles (Owner/Admin/Sales allow, ten deny),
  missing current membership, cross-tenant Project and linked Account,
  accountless initial policy, invalid money/date/stage, strict result, audit
  rollback and clean retry, replay, key reuse, and concurrent same-key collapse.
- Full shared suite: **PASSED, 66 files / 451 tests**.
- Neighboring Core lane: **PASSED, 7 files / 159 tests** including conversion,
  Opportunity detail, authorization guards, and HTTP read.
- WO-11 authoritative/mutation gate: **PASSED, 13/13**.
- Shared and API TypeScript: **PASSED**; API production build: **PASSED**.
- Full configured application-source ESLint: **PASSED, zero warnings**.
- Root TypeScript: **BLOCKED at the expected Agent 03 handoff**, after 3
  successful tasks: Project-detail
  `apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts:171`
  still supplies numeric optional TCV/GP to the corrected string-cent transition
  command. No Web file was changed in this Agent 05 scope.
- Protected PostgreSQL HTTP canary: **SKIPPED, 1/1** because `DATABASE_URL`
  and `ERP_API_INTEGRATION_EXPECTED=1` remain unavailable. It compiles and now
  asserts create persistence/replay/role/tenant/audit plus accountless KYC
  rejection, but no live database proof is claimed.
- Diff/whitespace: **PASSED**.
- Pinned Gitleaks 8.30.1 after the source commit: **PASSED, 1,804 commits / no
  leaks**.

No Web/UI, script, schema, dependency, data, environment, credential, or
deployment file changed.

→ Handoff to Agent 03. Reason: adopt the new Core creation endpoint and exact
money contract before independent QA. Inputs: source commit `234ebe03`;
`POST /v1/crm/opportunities`; required `Idempotency-Key`; strict body
`{ projectId, stage?: 'opportunity_creation', tcvCents?: string,
gpCents?: string, closingDate?: RFC3339-offset, areaSqm?, opportunityType?,
remarks? }`; strict persisted result; existing three-allow/ten-deny policy.
Expected output: replace the Project action's direct insert/separate audit with
one selected Core create call and no fallback, send canonical centavo strings
for both create and transition, offer only the safe initial stage, retain
success-only revalidation, update focused Web/contract tests, and return the
root typecheck plus browser path to green.

## Agent 03 QA remediation — Project Opportunity Web boundary

Source commit: `cb180ca0` (`fix(web): delegate project opportunity creation`).

Decision: **GO to Agent 11 and the contract owner; not yet GO to independent
QA.** Project-detail creation now crosses only the authenticated Core client at
`POST /v1/crm/opportunities`, behind the existing tenant selector. The action
has no Drizzle, Opportunity schema, Web audit, weighted-number, or fallback
path. It builds the shared strict command with only the safe initial stage,
canonical TCV/signed-GP strings, explicit-offset Manila time, and Project
identity; Account, tenant, and actor form fields are ignored. Core remains the
authority that derives the Project Account and revalidates current membership,
tenant, role, Project, and Account.

The complete normalized command produces a stable SHA-256 idempotency key.
The action accepts success only when the strict result matches the resolved
tenant and actor plus the requested Project, stage, commercial values, exact
weighted TCV, and closing instant. Both create and transition actions return
typed results from a full try/catch boundary and emit one redacted JSON outcome
event containing `trace_id`, `tenant_id`, `actor_id`, `action`, and `outcome`.
Only validated Core success triggers revalidation; a refresh exception after a
commit is reported as `success_refresh_failed`, not as an uncommitted write.

### Agent 03 evidence

- TDD red: Project action **38 failed / 31 passed**; Core adapter **3 failed /
  171 passed**.
- Final Project action: **PASSED, 78/78**.
- Focused Web route/panel/Pipeline/Core-client lane: **PASSED, 7 files / 325
  tests**.
- Shared create/transition contracts: **PASSED, 20/20**.
- Core create/controller/transition authority: **PASSED, 93/93**.
- Web typecheck: **PASSED**; root typecheck: **PASSED, 5/5 tasks**.
- Full configured application-source ESLint: **PASSED, zero warnings**.
- Web production build: **PASSED, 89/89 pages generated**.
- Diff/whitespace: **PASSED**.
- Pinned Gitleaks 8.30.1: **PASSED, 1,807 commits / no leaks**.
- Protected PostgreSQL HTTP canary: **unchanged SKIPPED/BLOCKED** because
  `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` remain unavailable; no
  live persistence claim is made.
- WO-11: **PARTIAL, 12/13**. The authoritative run and all other mutations
  pass, but the Project local-writer mutation now injects unimported
  `db.update(opportunities)` after the production schema import was correctly
  removed. The verifier resolves Opportunity table names only from imports and
  misses its own mutant (`Missing expected exception`). Agent 03 did not edit
  the out-of-scope script.

→ Handoff to Agent 11. Reason: align the mounted panel with Core's safe initial
stage policy. Inputs: `cb180ca0`, the shared create schema, and the existing
panel/model. Expected output: remove the four non-initial choices so creation
offers only `opportunity_creation`; retain the guarded single-flight,
recoverable errors, Manila date, and cent-string command without local writes.

→ Handoff to the contract owner. Reason: restore mutation sensitivity for an
import-free Project action. Inputs: `cb180ca0` and the exact WO-11 12/13
failure. Expected output: make the AST mutation self-contained or recognize
the injected writer without relying on a production schema import, preserve
benign formatting acceptance, and restore 13/13 before independent QA.
