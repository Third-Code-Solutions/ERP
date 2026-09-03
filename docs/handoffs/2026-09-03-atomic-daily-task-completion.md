# Atomic daily-task completion

## Delivery contract

Goal: replace the mounted Web-local daily-task completion sequence with one
tenant-safe Core command that commits the task, its semantic audit, and any
matching SLA closure atomically. Preserve the existing assignee-scoped **My
Tasks** experience while making authorization, retry, and failure behavior
explicit for all thirteen roles.

This slice follows the ten locally implemented functional workflows recorded in
`docs/functional/WORK_STATE.md`. It is a bounded repair of the existing daily
task completion path, not a task-management redesign.

### Product policy

The authoritative role vocabulary is:

`owner`, `estimator`, `pm`, `admin`, `sales`, `commercial`, `design`,
`sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`, `viewer`.

- All thirteen roles may open `/tasks` and read only tasks assigned to their
  authenticated user within their current tenant. Owner and Admin do not gain a
  tenant-wide read list from this slice.
- Completion capability is exactly Owner, Admin, Service Delivery PM/PE
  (`sd_pm_pe`), PM, and Safety. This is the existing `sd.daily_tasks` policy.
- Service Delivery PM/PE, PM, and Safety may complete only a pending task
  assigned to their authenticated user.
- Owner and Admin may complete any pending task in their current tenant through
  the command boundary. Cross-tenant completion is always denied.
- Estimator, Sales, Commercial, Design, Finance, Procurement, CX, and Viewer
  have no completion control and a direct command is denied before any
  persistent effect.
- The generated task titled `Toolbox meeting log` is the current canonical
  toolbox task. Its completion requires notes that remain non-empty after
  trimming. The existing 2,000-character notes boundary is retained as strict
  validation; input is not silently truncated. Notes on other daily tasks remain
  optional and are normalized by trimming.

### Current-state evidence and completed-task semantics

The current `/tasks` page applies tenant, authenticated-assignee, and status
predicates to every list/count query. The Core `GET /v1/today` read uses the
same tenant/current-assignee boundary, and the central `today.read` capability
includes all thirteen roles. Route inventory also grants `/tasks` to all roles.

The mounted `completeTask` Web action currently:

- reads a task by caller tenant;
- returns `{ ok: true }` without a write when its status is already `done`;
- permits Owner/Admin tenant override and otherwise requires the assignee;
- updates `daily_tasks`, writes a separate audit, then attempts SLA closure as
  best effort.

The replacement preserves the established already-completed behavior as an
authorized no-op success: after current membership, tenant, capability, and
assignee-or-override checks, an already-`done` task returns its canonical
persisted completion result without changing notes, timestamps, actor, audit,
or SLA state. Authorization is deliberately checked before this response so an
unrelated assignee cannot probe a completed task. A `skipped` task is not
pending and must fail with the typed invalid-state result; this closes the
legacy fall-through that could turn it into `done`.

Exact replay of a successfully recorded idempotency key returns the same strict
completion result. Reuse of the same key for a different normalized command is
a conflict. A fresh authorized request for a task that is already `done` uses
the no-op rule above and never creates a second semantic audit.

### Core authority

Agent 05 owns the exact Core HTTP path and exports it through the shared ERP API
contract before Web work begins. The command accepts only task identity plus
optional normalized completion notes; tenant, actor, role, assignee, project,
and completion timestamps come from authenticated/current database state, not
caller input.

Within one database transaction, Core must:

1. validate the shared command and bounded idempotency key;
2. resolve and lock the caller's current membership and lock the target daily
   task;
3. recheck tenant, `sd.daily_tasks` capability, pending state, and the
   assignee-or-Owner/Admin override rule from locked/current rows;
4. enforce the canonical toolbox-notes rule;
5. set the task to `done` with one server timestamp, normalized notes, and the
   authenticated completion actor;
6. write exactly one semantic daily-task completion audit in the same
   transaction; and
7. close every still-open SLA row matching the same tenant,
   `entity_type = 'daily_task'`, and task ID using the same completion time.

An audit failure, matching SLA update failure, idempotency-completion failure,
or strict-result failure rolls back every effect. Absence of an open matching
SLA is a valid zero-row case; a database failure while checking or closing
matching rows is not. Concurrent commands against one pending task must produce
one task completion, one semantic audit, and one set of SLA closures.

No dedicated daily-task request table or idempotency column exists in the
current schema, and this slice forbids schema changes. Agent 05 must first
inspect the established durable request/idempotency patterns and prove a safe
reuse of current data structures for exact replay, key conflict, and concurrent
single effect. It must not borrow an unrelated domain ledger or claim an
in-memory lock as durable idempotency. If those guarantees cannot be met without
a schema change, Agent 05 stops and reports a material blocker before Web edits;
the scope is not silently expanded.

The shared strict result must be sufficient for Web to verify task, tenant,
project, assignee, terminal `done` status, completion actor/time, and normalized
notes. Core errors use the repository's typed error taxonomy and do not expose
foreign-task existence.

### Web boundary and experience

The completion server action delegates exactly once through the existing
authenticated Core client/tenant selector. It has no direct daily-task update,
separate audit, SLA helper, or local/legacy fallback.

- Parse only the exported shared command schema. Never accept tenant, actor,
  role, assignee, project, or completion time from the browser.
- Generate a stable SHA-256 idempotency key over the complete normalized
  command, including task identity and normalized notes.
- Treat selector denial, Core returned error, throw, timeout, malformed result,
  or mismatched identity/tenant/project/assignee/status as failure.
- Revalidate or refresh `/tasks` only after a fully validated success. A
  failure preserves the task and entered notes for retry.
- Wrap every server-action branch in typed error handling and emit one redacted
  structured outcome log containing `trace_id`, `tenant_id`, `actor_id`,
  `action`, and `outcome`. Do not log raw notes, credentials, tokens, headers,
  or request bodies.
- Render completion controls only for the five capable roles. Normal-role
  controls apply only to their assigned rows. The eight denied roles retain
  readable task rows without a completion control.
- Keep the interaction keyboard-operable, expose a named control and labelled
  notes field, announce recoverable errors, prevent duplicate submission, show
  pending state, and restore a usable control after failure. Toolbox completion
  cannot be submitted with blank trimmed notes.

The existing assignee-scoped reads may remain on their established read path;
“Core-only” in this cutover refers to the completion mutation. This slice does
not authorize a broader read migration.

## Acceptance criteria

1. All thirteen roles retain tenant/current-assignee-scoped task reads; no
   route, query, or result reveals another assignee's tasks.
2. Owner/Admin/Service Delivery PM-PE/PM/Safety are the only completion roles.
   The latter three can complete only their own assigned task; Owner/Admin have
   only a current-tenant command override. The other eight roles are denied
   before idempotency, task, audit, or SLA effects.
3. Invalid IDs, missing/currently invalid membership, cross-tenant tasks,
   foreign assignees, `skipped` tasks, malformed/oversized notes, and blank
   toolbox notes fail closed with no effect and without foreign-row disclosure.
4. One successful pending-task command atomically produces the canonical task
   completion, exactly one semantic audit, and closure of matching open SLA
   rows. Audit, SLA, or idempotency-finalization failure rolls back all effects.
5. Authorized already-`done` commands are no-op successes that preserve the
   persisted completion. Exact key replay returns the same strict result; key
   reuse with a different command conflicts; concurrent calls have one effect.
6. Shared command/result schemas are strict and are used by Core, Web client,
   and Web action. Core derives all identity and timestamps.
7. The Web action calls only the selected Core authority once, validates the
   complete returned identity/state, logs every outcome structurally, and
   refreshes only on success. There is no local mutation/audit/SLA fallback.
8. The accessible UI covers optional notes, required toolbox notes, pending,
   returned failure, transport failure, retry, duplicate suppression, and
   success. Denied roles have no completion control.
9. Automated tests enumerate all thirteen roles and cover tenant/membership/
   assignee checks, toolbox notes, state rules, rollback boundaries, replay,
   key conflict, concurrency, strict result handling, logging, and success-only
   refresh.
10. After source completion, an independent mounted-entry contract proves the
    single Core delegate and challenges reintroduced Web database, audit, SLA,
    fallback, permission, validation, result, and refresh defects.
11. Focused shared/Core/Web/UI tests, relevant neighboring tests, typecheck,
    source lint, production builds, diff checks, and secret scan pass. Database
    and browser evidence are reported separately and never inferred from mocks.

## Sequential ownership

Agents work sequentially and commit before handoff.

1. **Agent 05 — API & Backend Logic**
   - Own `packages/shared-types/src/erp-api/**` for the strict completion
     command/result and focused tests.
   - Own new daily-task completion files under `apps/api/src/**`, their focused
     tests, and the minimum Core module registration required to mount the
     endpoint.
   - Inspect existing request-ledger/idempotency implementations before choosing
     a schema-free mechanism. TDD the exact thirteen-role policy, current
     membership, tenant/assignee isolation, pending/done/skipped behavior,
     toolbox notes, audit/SLA rollback, replay, key conflict, concurrency, and
     strict result.
   - Do not edit Web, schema, dependencies, data, environment, or deployment.
   - → Handoff to Agent 03 only when the shared/Core contract is green, or
     return a blocker if durable idempotency cannot be proven in scope.
2. **Agent 03 — Next.js App Router Engineer**
   - Own `apps/web/src/app/(dashboard)/tasks/**`, the relevant authenticated Core
     client/selector files and tests, and explicitly
     `apps/web/src/components/tasks/**` for this handoff.
   - Replace the local completion writer with the strict Core-only boundary;
     implement stable-key, strict-result, structured-log, success-only-refresh,
     exact-control, and accessible recovery behavior.
   - Preserve assignee-scoped reads and unrelated daily-generation behavior.
     Do not edit Core/API/shared, scripts, schema, dependencies, data,
     environment, or deployment.
   - → Handoff to Agent 12/contract owner with exact tests and changed paths.
3. **Agent 12 / mounted-entry contract owner**
   - Begin only after Agent 05 and Agent 03 source commits are complete.
   - Inventory every mounted daily-task completion entry and prove exactly one
     selected Core delegate with no reachable local task writer, semantic audit,
     SLA closure, or fallback. Challenge role/control wiring, shared schemas,
     stable key, strict result, outcome logging, and success-only refresh with
     mutation-sensitive cases.
   - Run the authoritative contract and proportionate repository gates without
     modifying product runtime.
4. **Independent QA and browser verifier**
   - Begin only after the mounted contract is green.
   - Independently rerun positive/negative role, rollback, replay, key-conflict,
     concurrency, and failure-path tests.
   - Use only an isolated authenticated browser session and a disposable or
     rollback-contained database target. Verify desktop/narrow, keyboard,
     pending/error/retry/success, console/network, one Core call, and persisted
     task/audit/SLA state. Do not use the engineer's daily browser session or
     mutate shared demo/hosted data.

## Risks and fail-closed boundaries

- **Current P1:** task update, semantic audit, and SLA closure are separate; SLA
  failure is swallowed. This is the source defect this slice must remove.
- **Authorization order:** the legacy already-done branch precedes assignee
  authorization. The new no-op result must follow every current authorization
  check.
- **No request table:** durable replay/key-conflict proof may not be achievable
  without schema. The no-schema constraint wins; inability to prove it is a
  blocker, not permission to weaken the contract.
- **SLA matching:** only open, same-tenant `daily_task` clocks for the selected
  task may close. Unrelated clocks must remain untouched.
- **Browser identities/session:** the functional ledger records eleven supplied
  identities and missing `estimator`/`pm` identities. It also records no secure
  reusable isolated authenticated session for the latest workflow. Automated
  thirteen-role proof is mandatory; missing safe browser evidence stays
  `BLOCKED`, with PM specifically blocking an allowed-role browser case.
- **PostgreSQL:** a protected database lane requires an isolated binding and
  explicit opt-in. If unavailable, rollback/persistence/concurrency HTTP proof
  remains `BLOCKED/NOT RUN`; unit doubles are not database evidence.

## Explicit exclusions

- No schema, migration, dependency, data, fixture, environment, provider,
  deployment, or hosted/demo mutation.
- No cadence-generation rewrite, task assignment/editor, tenant-wide task
  browser, progress/S-curve change, notification/escalation expansion, or SLA
  policy redesign.
- No Project Scope or Claims route, workflow, role, or data-policy decision.
  Those independently identified product questions require a fresh Agent 01/02
  audit and cannot be inferred from daily-task completion.
- No Viewer-sensitive read-policy decision and no claim that this workflow
  resolves broader functional completeness.

## Initial state

- Worktree: `D:/thirdcode/ERP-tasks-20260903`
- Branch: `agent-05/atomic-daily-task-completion`
- Base: `a22c0a7b8b767e39e9b692c77933b1b6c336806c`
- Working tree before this note: clean
- PRD authority: v1.4 task/process/SLA rules, including WO-02/WO-03 and
  invariant A-44 for immutable audit on every state change
- Functional state: ten prior workflows remain `PARTIAL`; this slice does not
  change the functional ledger until implementation and independent evidence
  exist

→ Handoff to Agent 05. Reason: the current daily-task command is a Web-local,
non-atomic mutation and Core lacks a mounted completion authority. Inputs: the
policy, current-state semantics, transaction contract, no-schema boundary, and
acceptance criteria above. Expected output: strict shared/Core command and
tests, exact durable-idempotency decision, module registration, focused gates,
source commit, and explicit Agent 03 handoff or material blocker.

## Agent 05 implementation — Core authority complete

Source commit: `be26d477 feat(tasks): add atomic Core completion`.

Agent 05 mounted `POST /v1/daily-tasks/:taskId/completion` through
`DailyTasksModule`. The route requires the central `sd.daily_tasks` capability,
a valid task UUID, a trimmed bounded `Idempotency-Key`, and the exported strict
body schema. The body accepts only optional notes: blank notes normalize to
absence, meaningful notes are trimmed, the 2,000-character boundary is strict,
and identity, assignment, role, tenant, project, actor, timestamp, or requested
status fields are rejected as unknown.

The Core service repeats authorization against locked current state rather than
trusting guard-time claims. It locks the current tenant membership, derives the
current role, checks the central capability, takes a transaction-scoped command
advisory lock, and locks the tenant-scoped daily task. Service Delivery PM/PE,
PM, and Safety are restricted to their assigned task; Owner/Admin receive only
the documented same-tenant override. Missing and cross-tenant tasks share the
same not-found result. Authorization precedes any durable effect and also
precedes the already-`done` no-op result.

### Durable schema-free idempotency decision

No generic request ledger or daily-task idempotency column exists, so no
unrelated domain request table was reused. The required append-only semantic
`audit_log` row is also the successful command receipt:

- the raw key is normalized, SHA-256 hashed, and never persisted or logged;
- a transaction advisory lock is derived from tenant plus the full key hash;
- the receipt lookup is scoped by tenant, `daily_task`, `status_change`, source,
  and the full 256-bit key hash;
- the receipt stores a second SHA-256 hash of canonical task ID plus normalized
  command, never raw notes; and
- exact replay reads the locked canonical task, while a different task or
  normalized command under the same key returns conflict.

PostgreSQL reduces the advisory lock name to 64 bits. A collision can therefore
cause only extra serialization: receipt identity is still decided by the full
tenant-scoped 256-bit hash, so collision cannot alias two commands. The task row
lock independently serializes different keys targeting the same pending task.
The audit receipt is inserted in the same transaction as the domain mutation;
a crash or rollback cannot leave a succeeded receipt without its completion.

### Atomic task, SLA, and audit behavior

For a locked pending task, Core writes `done`, normalized notes, one server
timestamp, and the current authenticated actor. It then closes every open
legacy `sla_logs` row matching the same tenant, `entity_type = 'daily_task'`,
and task ID with that exact timestamp, and appends one semantic
`status_change` audit with source `daily_task_completion_core`. The audit holds
only status/notes-presence and receipt hashes; it does not copy notes or the raw
idempotency key.

This deliberately does not use `process.sla_clocks`: current `daily_tasks` rows
have no process task-instance relationship. It preserves the established
`stopSlaClock` matching semantics: absence of an open matching legacy SLA is a
successful zero-row no-op, while a database failure executing the matching SLA
update aborts the transaction. Injected SLA and audit failures both proved the
task, SLA, and receipt roll back together. A locked `skipped` task conflicts.
An authorized well-formed `done` task returns its strict persisted completion
without a new task update, SLA update, audit, or receipt. A malformed legacy
`done` row fails closed rather than returning an invented completion.

### Agent 05 verification

All commands below used process-local Node `v22.23.2` from the pinned runtime
and pnpm `10.33.0`. The fresh worktree was hydrated with
`pnpm install --frozen-lockfile --offline`; the lockfile and manifests did not
change.

- TDD red: the shared, controller, and service suites each failed collection on
  their intentionally missing production module before implementation.
- Shared completion contract: **3/3 passed**.
- Core completion controller/service: **33/33 passed** across **2/2 files**,
  including all thirteen current roles, stale membership, tenant/assignee
  isolation, Owner/Admin override, toolbox normalization, done/skipped states,
  no-open-SLA behavior, rollback, exact replay, key conflict, and concurrency.
- Neighboring Today/audit plus completion suites: **37/37 passed** across
  **5/5 files**.
- Central authorization suite: **32/32 passed**.
- Shared typecheck: **passed**.
- API typecheck: **passed**.
- API source lint (`--max-warnings=0`): **passed**.
- API production build: **passed**; webpack compiled successfully.
- Repository gitleaks `8.30.1`: **passed**, 1,816 commits / approximately
  45.87 MB scanned with no leaks found.
- Commit-range and documentation diff checks: **passed**.
- Protected rollback HTTP canary: **1 skipped / 0 run** because this worktree
  has neither an explicit isolated `DATABASE_URL` binding nor
  `ERP_API_INTEGRATION_EXPECTED=1`. No database was contacted. The canary is
  opt-in and transaction-rollback-contained when that lane is available.

PostgreSQL persistence/concurrency evidence therefore remains **BLOCKED / NOT
RUN**; unit transaction doubles are not represented as database proof. The
source contract has no known in-scope Agent 05 blocker.

→ Handoff to Agent 03. Reason: the strict shared/Core completion authority is
mounted and green. Inputs: `dailyTaskCompletionCommandSchema`,
`dailyTaskCompletionResultSchema`, `POST /v1/daily-tasks/:taskId/completion`,
the required `Idempotency-Key`, exact five-role policy, Owner/Admin override,
canonical done no-op, typed 400/403/404/409 failures, and source commit
`be26d477`. Expected output: replace the Web-local task update/audit/SLA sequence
with one authenticated Core call; derive a stable key from task ID plus the
complete normalized shared command; strictly validate returned task/tenant/
project/assignee/status/completion identity; emit redacted structured outcomes;
refresh only after success; preserve retry notes; and render accessible controls
only for the five capable roles before handing off to the contract owner.

## Agent 03 Web completion — 2026-09-03

Source commit `292b4e3a` replaces the mounted Web-local completion sequence with
the assigned Core-only vertical slice.

- `/tasks` retains its existing tenant/current-assignee-scoped read queries and
  binds task, project, assignee, and toolbox-note policy on the server-rendered
  row. Browser `FormData` accepts only one optional `notes` field.
- The server action parses the exported strict shared command, normalizes blank
  notes to omission, rejects duplicates/hostile fields and values over 2,000
  characters, independently enforces `can(role, 'sd.daily_tasks')`, and fails
  closed when the explicit tenant selector is not enabled.
- The action derives a stable 64-hex SHA-256 key from task identity plus the
  complete normalized command, then invokes exactly one authenticated
  `POST /v1/daily-tasks/:taskId/completion`. There is no reachable daily-task
  database update, Web audit write, SLA helper, or compatibility fallback in
  the completion action.
- Web re-parses the strict result and cross-checks task, tenant, project,
  assignee, and `done` status against authenticated/mounted scope. Core remains
  authoritative for persisted completion notes, timestamp, and actor so an
  authorized already-done no-op is accepted without claiming a fresh mutation.
- Every action branch emits one redacted structured event with `trace_id`,
  `tenant_id`, `actor_id`, `action`, and `outcome`; notes, idempotency keys,
  tokens, headers, and bodies are not logged.
- The UI projects the central five-role capability, leaves the other eight
  roles with an explicit readable read-only state, labels and bounds the notes
  field, requires toolbox notes before transport, prevents duplicate in-flight
  submission, announces pending/errors, retains notes across failures, clears
  stale errors on retry, and resets and refreshes only on validated success. The
  success copy is the no-op-safe statement `Task is complete.`

### Agent 03 verification

All commands used process-local Node `v22.23.2` and pnpm `10.33.0`.

- TDD initial red: **33 failed / 4 passed** across the three new Web seams.
- Focused final Web action/client/UI: **40/40 passed** across **3/3 files**.
- Focused plus neighboring Web Core client: **213/213 passed** across
  **4/4 files**.
- Full Web unit suite: **1,411 passed / 2 skipped** across **185 files**. The
  two existing integration suites stayed skipped because their isolated
  database prerequisites were absent; no database was contacted.
- Core completion controller/service: **33/33 passed**.
- Shared completion plus central authorization: **35/35 passed**.
- Core authentication/authorization neighbors: **35/35 passed**.
- Web main TypeScript check: **passed**.
- Root Turborepo typecheck: **passed**, 5/5 executed package tasks.
- Root lint with zero warnings: **passed**.
- Web production build: **passed**, including `/tasks`.
- Repository gitleaks `8.30.1`: **passed**, 1,816 commits / approximately
  45.87 MB scanned with no leaks found.
- Diff whitespace check: **passed**.
- Browser and hosted verification: **NOT RUN by design**; this handoff forbade
  browser/hosted mutation. PostgreSQL canary remains blocked as recorded by
  Agent 05.

No schema, migration, dependency, lockfile, script, data, environment,
deployment, Core/API, or shared-contract source changed in Agent 03 work. The
new selector remains fail-closed unless operations explicitly select the tenant
with `ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API=true` and its tenant allowlist;
this task did not change environment state.

→ Handoff to Agent 12 / mounted-entry contract owner. Reason: Core and Web
source commits are now complete. Inputs: Core commit `be26d477`, Web commit
`292b4e3a`, strict shared schemas, exact five-role policy, and the verification
evidence above. Expected output: inventory every mounted daily-task completion
entry and mutation-sensitively prove one selected Core delegate, signed mounted
context, hostile-field rejection, stable-key replay/sensitivity, strict result
scope, redacted outcomes, no local writer/audit/SLA/fallback, exact control
projection, failure recovery, and success-only refresh before handing to
independent QA/browser verification.

## Agent 12 mounted-entry contract — 2026-09-03

**Decision: GO to independent QA/browser verification.** No P0, P1, or P2
product-source defect was found in the mounted daily-task completion slice.
Agent 12 made no runtime application, Core/API, shared-contract, schema,
dependency, data, environment, deployment, or functional-ledger change.

Test commit `8cb16056` adds a TypeScript-AST and source-module-graph verifier for
the mounted entry contract. It proves the checked source currently has:

- all 13 ERP roles accounted for, with exactly five capable roles
  (`owner`, `admin`, `sd_pm_pe`, `pm`, `safety`) and eight denied roles;
- one mounted completion control/action path, with server-bound task, project,
  assignee, and toolbox-note context and strict notes-only browser input;
- central/page/UI/action/Core authorization, assignee-only completion except
  same-tenant Owner/Admin override, and tenant/current-assignee-scoped reads;
- one tenant-selected authenticated Core delegate, a stable SHA-256 key bound to
  task identity and the full normalized command, strict returned-scope checks,
  per-outcome redacted logs, single-flight recovery, and success-only refresh;
- no reachable Web daily-task writer, transaction, audit/SLA helper, or local or
  compatibility fallback, including local imports, aliases, exported arrows,
  named re-exports, and export-star paths followed by the verifier; and
- Core transaction membership/task locks and authorization order, full receipt
  key/command hashes, no raw key/notes in the semantic audit, authorized-done
  no-write behavior, skipped-state conflict, atomic task/SLA/audit behavior, and
  replay, conflict, rollback, and concurrency test evidence.

### Agent 12 verification

All authoritative final commands used Node `v22.23.2` and pnpm `10.33.0`.

- Mounted verifier baseline plus mutation suite: **22/22 passed twice**. The
  suite includes benign TypeScript reformatting and 19 hostile mutation groups.
- Shared completion/authorization: **35/35 passed** across 2 files.
- Core completion controller/service: **33/33 passed** across 2 files.
- Web action/client/UI/route inventory: **42/42 passed** across 4 files.
- Protected PostgreSQL HTTP integration: **1 skipped / 0 run**, correctly gated
  because the isolated database opt-in was absent; no database was contacted.
- Root lint: **passed**.
- Root typecheck: **passed**, 5/5 package tasks successful.
- Root production build: **passed**, 2/2 package tasks successful; the Web build
  included `/tasks` and the Core API webpack build completed successfully.
- Both verifier files passed `node --check`; diff whitespace and repository
  gitleaks checks passed with no leak finding.

The verifier is deliberately bounded: it is a source-level TypeScript AST/module
graph check, not a complete TypeScript typechecker, runtime control-flow proof,
or PostgreSQL/browser test. Dynamic imports, computed-property dispatch,
arbitrary higher-order callback indirection, and unusual default-export chains
can fall outside its reachability model. Compiler and focused runtime tests
cover ordinary typed/static paths; real PostgreSQL persistence/concurrency and
browser behavior remain separately **BLOCKED / NOT RUN** in this no-database,
no-browser lane.

→ Handoff to independent QA/browser verification. Inputs: Core `be26d477`, Web
`292b4e3a`, mounted contract verifier `8cb16056`, the exact 5-allowed/8-denied
policy, and the bounded limitations above. Expected output: exercise the single
mounted `/tasks` completion flow for allowed, denied, assignee, Owner/Admin
override, error-retry, and success-refresh behavior without weakening the
separate isolated-PostgreSQL requirement.
