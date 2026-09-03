# Project-detail Opportunity Core cutover — Agent 05

## Outcome

The authoritative Core Opportunity stage command can now retain the Project
panel's TCV, GP, and closing-date edits in the same transaction as stage,
weighted TCV, audit, SLA rollover, idempotency completion, and any Won handoff.
This removes the API-contract reason for a Web-local prewrite or silent field
loss.

## Changed areas

- `packages/shared-types/src/erp-api/opportunity-stage-transition.ts`
  adds strict optional commercial command fields and safe integer limits.
- `apps/api/src/crm/opportunity-stage-transition.service.ts`
  locks and preserves existing commercial values, persists supplied edits,
  computes weighted TCV with an exact integer intermediate, and audits changes.
- Focused shared, Core service, and protected HTTP integration tests cover the
  command boundary, persistence, audit, rollback, replay/key reuse, concurrency,
  and the rollback-contained PostgreSQL canary contract.

Source commit: `cb3d7b3d`.

No schema, dependency, Web, demo-data, environment, credential, or deployment
change was made.

## Verification

- Node 22.23.2 / pnpm 10.33.0: VERIFIED.
- Focused shared contract: PASSED, 9/9 after a reproduced 1-failure red.
- Focused Core service: PASSED, 67/67 after a reproduced 2-failure red.
- Full shared suite: PASSED, 66 files / 442 tests.
- Shared and API typechecks: PASSED.
- Scoped source ESLint: PASSED, zero errors and warnings.
- API production build: PASSED.
- Unrelated delivery-controller timeout: PASSED in isolation, 24/24; the broad
  API run was stopped before a final total and is not reported as green.
- Protected PostgreSQL HTTP canary: SKIPPED, 1/1, because its required database
  opt-in environment was absent; no live persistence proof is claimed.
- Diff/whitespace check: PASSED.
- Pinned Gitleaks 8.30.1: PASSED, 1,794 commits / no leaks.

## Handoff

Agent 03 should send the panel fields through
`transitionOpportunityStageThroughCoreApi` in camelCase, normalize the date-only
control to an explicit-offset RFC 3339 value, keep a stable full-command
idempotency key, remove the local writer with no fallback, and revalidate only
after the unchanged strict Core result is validated.

## Agent 03 — Project route and action

Source commit: `9f83cbd8`.

- Replaced the mounted Project-detail Opportunity stage action's local
  Opportunity update and separate audit with the tenant-selected Core command.
- Forwarded the complete normalized command with stable content-derived
  idempotency and no selector, transport, typed-error, or invalid-result
  fallback.
- Calendar-valid Project-panel dates become Philippine midnight with an
  explicit `+08:00` RFC 3339 offset; omitted values remain omitted and GP stays
  signed.
- Enforced exact Owner/Admin/Sales direct-action authorization and strict
  returned Opportunity/tenant/edge/destination/conversion validation.
- Limited revalidation to validated success, including the committed Won
  Project path and returned Project ID.
- Passed central `canCreate` and `canMutate` decisions from the Project route to
  the Agent 11-owned panel.
- Added focused action and AST-backed route contracts, including all thirteen
  roles and a reachable-call-graph prohibition on local update, audit, and SLA
  effects.

Verification: focused/neighboring Web tests PASSED 94/94; Web and configured
E2E TypeScript PASSED; full Web source ESLint PASSED; production build PASSED
with 89/89 pages; diff checks PASSED; final pinned Gitleaks PASSED over 1,798
commits. WO-11 was PARTIAL at 4/5 because its out-of-scope stale
exact-text Pipeline mutation fixture could not construct the mutation; the
main invariant passed, and the failure reproduced under pinned Node 22.23.2 /
pnpm 10.33.0.

Next: Agent 11 consumes the route permission props, includes `project_id` in
the stage form, and provides recoverable reason/error/pending UX without any
local or pre-Core write.

## Agent 11 — Project Opportunity panel UX

Source commit: `ebaa5dd3`.

- Consumed route-owned create/mutate permissions with exact Owner/Admin/Sales
  controls and accessible read-only rendering for the other ten roles.
- Replaced the local transition table with shared canonical edge projection.
- Wired the complete atomic action `FormData`, including Project identity,
  optional TCV/signed GP/date, and distinct required Lost/regression reasons.
- Reused the Pipeline reason dialogs and guarded transition submitter; added a
  matching single-flight creation runner.
- Made returned and rejected failures accessible and recoverable, cleared stale
  alerts before React transitions, prevented duplicate requests, and closed
  forms/dialogs only on successful actions.
- Added SSR, pure model/submission, and TypeScript-AST mounted-caller evidence.

Verification: focused 43/43 and wider 119/119 tests PASSED; Web/configured E2E
TypeScript PASSED; full Web source ESLint PASSED; production build PASSED with
89/89 pages; diff checks PASSED. WO-11 remains PARTIAL at 4/5 solely because
its out-of-scope stale exact-text Pipeline mutation fixture cannot construct
the mutation; its main invariant passes. Final post-source Gitleaks was not
rerun under the explicit docs-only closeout instruction and is assigned to the
independent QA handoff.

## Contract owner — mounted entry-point authority

Contract commit: `6a18d07a`.

- Repaired the stale WO-11 writer mutation with TypeScript AST/in-memory
  transforms and converted the existing KYC/delegation mutations to the same
  formatting-independent mechanism.
- Added an exact fail-closed inventory for the Pipeline and Project-detail
  Opportunity stage actions, including local reachable-call analysis, named
  import-alias handling, one tenant-selected Core delegate per action, and no
  local Opportunity update/audit/SLA/conversion fallback.
- Added Project panel/model checks for shared transition projection, shared
  Lost/regression reason routing, normalized single-action submission, and
  caller permission guards.
- Added Project route/shared authorization checks for central permission props
  and the exact Owner/Admin/Sales allow set across all thirteen roles.
- Added eleven mutation challenges plus a benign TypeScript-printer formatting
  case. No product source or runtime surface changed.

Verification under Node 22.23.2 / pnpm 10.33.0: WO-11 **PASSED 13/13**;
shared contract **PASSED 9/9**; Core service **PASSED 67/67**; focused Web lane
**PASSED 8 files / 121 tests**; root typecheck **PASSED 5/5 tasks**; full source
ESLint **PASSED**; API build **PASSED**; Web build **PASSED 89/89 pages**;
script syntax and diff checks **PASSED**; pinned Gitleaks 8.30.1 **PASSED,
1,802 commits / no leaks** after the contract commit and documentation
closeout.

Contract decision: **GO to independent browser QA.** PostgreSQL persistence
status is unchanged and remains **BLOCKED/NOT RUN** because `DATABASE_URL` and
`ERP_API_INTEGRATION_EXPECTED=1` are unavailable; no live database result is
claimed.
## Agent 05 QA P1 remediation

Source commit: `234ebe03`.

- Added the tenant/current-membership/capability-checked
  `POST /v1/crm/opportunities` Core command for Project-detail creation.
- Derived and tenant-validated the Account from the active Project; retained
  legacy accountless initial creation without inventing client linkage.
- Made insert, semantic audit, and namespaced idempotency completion one
  transaction with replay, payload-conflict, rollback, and concurrency proof.
- Restricted creation to `opportunity_creation` and made all downstream
  KYC-gated transitions reject without a tenant-resolved Account while
  preserving dual-track and legacy Account KYC rules.
- Corrected create/result and transition monetary boundaries to canonical
  decimal centavo strings, shared one validation authority, and retained exact
  `BigInt` weighted-TCV math.

Verification under Node 22.23.2 / pnpm 10.33.0: focused Core **93/93**; full
shared **451/451**; neighboring Core **159/159**; WO-11 **13/13**; shared/API
typechecks, API build, and full source lint passed. Root typecheck is explicitly
handed to Agent 03 because the scoped-out Project Web action still sends numeric
transition money. PostgreSQL remained **SKIPPED 1/1** with
`DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` absent. Pinned Gitleaks
after source commit passed over **1,804 commits** with no leaks.

Next: Agent 03 delegates Project-detail creation to Core, sends string centavos
for create/transition, removes the local insert/audit path, and reruns root/Web
gates before independent QA.

## Agent 03 QA remediation — Project Opportunity Web boundary

Source commit: `cb180ca0`.

- Replaced the Project-detail creation action's direct Drizzle insert and
  separate Web audit with one authenticated `POST /v1/crm/opportunities`
  Core-client call selected by the existing tenant Opportunity-write gate. No
  local writer or fallback remains.
- Built only the strict shared create command. The action accepts only
  `opportunity_creation`, materializes canonical decimal-centavo string
  defaults, normalizes equal timestamps to an explicit Manila `+08:00`
  instant, and ignores submitted Account, tenant, and actor identities so Core
  derives them from the authenticated Project relationship.
- Added a stable SHA-256 idempotency key over the complete normalized command
  and rejects malformed or mismatched tenant, Project, rep, stage, commercial,
  date, or weighted-TCV results before any cache refresh.
- Changed Project stage transitions to reuse the shared signed/non-negative
  centavo-string schemas and send the strict shared transition command without
  a numeric currency boundary.
- Wrapped both server actions in typed result handling and emitted one
  redacted structured outcome event per path with trace, resolved tenant,
  resolved actor, action, and outcome. Cache-refresh failure after a valid Core
  commit is logged distinctly and does not falsely report that the mutation
  failed.
- Added action and Core-client tests for all thirteen roles, missing auth,
  tenant/result identity, unsafe/non-canonical money, date normalization,
  selector rejection/throw, Core error/throw/timeout/malformed response,
  complete-key stability/sensitivity, one call, absence of local work, strict
  result validation, success-only refresh, and structured redacted logging.

Verification under Node 22.23.2 / pnpm 10.33.0: TDD action red **38 failed / 31
passed** and Core-client red **3 failed / 171 passed**; final Project action
**78/78**; focused Web lane **7 files / 325 tests**; shared
create/transition contracts **20/20**; Core
create/controller/transition authority **93/93**; Web and root typechecks
**PASSED** (root **5/5**); full configured source ESLint **PASSED, zero
warnings**; Web production build **PASSED, 89/89 pages**; diff/whitespace
**PASSED**; pinned Gitleaks 8.30.1 **PASSED, 1,807 commits / no leaks**.

WO-11 is **PARTIAL, 12/13** after the required removal of the Web schema
import. Its Project-writer mutation fixture injects an unimported
`db.update(opportunities)`, while the verifier recognizes table identifiers
only from schema imports; the mutant therefore reports `Missing expected
exception`. The authoritative contract and every other mutation pass. This is
assigned to the contract owner because Agent 03 may not edit scripts.

→ Handoff to Agent 11. Reason: the Web command boundary now rejects every
initial stage except `opportunity_creation`, while the panel still offers five
creation stages. Inputs: source commit `cb180ca0`, strict shared command, and
the current Project panel/model. Expected output: expose only the safe initial
stage and verify create error/pending/date/cent-string wiring without adding a
local write or fallback.

→ Handoff to the contract owner. Reason: the import-free action exposed the
bounded writer mutation fixture described above. Inputs: source commit
`cb180ca0` and the 12/13 failure. Expected output: make the in-memory mutation
self-contained or make writer recognition fail closed without requiring the
production action to retain an unused schema import, then restore 13/13.
