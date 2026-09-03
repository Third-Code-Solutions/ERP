# Atomic daily-task completion

## Status

Planning handoff opened. No application source, schema, dependency, data,
environment, provider, or deployment state changed in this commit.

## Delivery decision

The next bounded functional slice is the existing `/tasks` completion path.
All thirteen roles retain tenant/current-assignee-scoped reads. Completion is
limited to the existing `sd.daily_tasks` capability: Owner, Admin,
`sd_pm_pe`, PM, and Safety. Service Delivery PM/PE, PM, and Safety may complete
only their own assigned pending task; Owner/Admin have a current-tenant command
override. The other eight roles receive no control and are denied before
effects.

The replacement command must make task completion, one semantic audit, and any
matching open daily-task SLA closure one transaction. Toolbox meeting logs
require non-empty trimmed notes. Audit/SLA/idempotency-finalization failures
roll back every effect, and replay/key conflict/concurrency must be proven.

The current action establishes already-completed behavior: an authorized
`done` task is a no-write success. The Core replacement preserves that no-op
result only after current membership, tenant, capability, and assignee-or-
Owner/Admin override checks, and never changes prior notes or completion
metadata. A `skipped` task is rejected as non-pending.

## Ownership

- Agent 05 owns strict shared contracts under
  `packages/shared-types/src/erp-api/**`, new daily-task completion Core files,
  their tests, and minimum module registration.
- Agent 03 then owns `apps/web/src/app/(dashboard)/tasks/**`, relevant Core
  client/selector tests, and explicitly `apps/web/src/components/tasks/**`.
- Agent 12/contract verification begins only after both source owners commit.
- Independent QA/browser verification begins only after the mounted-entry
  contract passes.

The complete acceptance contract and handoff order are in
`docs/handoffs/2026-09-03-atomic-daily-task-completion.md`.

## Evidence reviewed

- `AGENTS.md`, including Agent 01/03/05/12 scopes and sequential handoff rules.
- `docs/PRD.md` task/process/SLA authority: all-money and tenant invariants,
  M-06/M-07, WO-02/WO-03, SLA thresholds, and immutable state-change audit.
- Both final read-only functional audit outputs as represented by the task
  acceptance criteria and source-backed repository evidence; no separate audit
  report file exists.
- `docs/functional/WORK_STATE.md`, including the ten prior partial workflows,
  thirteen-role vocabulary, missing Estimator/PM identities, PostgreSQL block,
  and latest isolated-browser boundary.
- Current daily-task page/action/components, central capabilities and route
  inventory, Core Today read, daily-task/SLA/audit schemas, and established Core
  transaction/idempotency patterns.

## Risks and blocks

- The current Web task update, audit, and best-effort SLA close are not atomic.
- The current no-op `done` branch runs before assignee authorization; the new
  authority must reverse that order.
- Current schema has no dedicated daily-task request ledger and this slice
  forbids schema work. Agent 05 must prove a safe durable schema-free mechanism
  or return a material blocker; unrelated ledgers and in-memory locks are not
  acceptable substitutes.
- Protected PostgreSQL evidence remains `BLOCKED/NOT RUN` without an isolated
  binding and explicit opt-in.
- Authenticated browser evidence remains `BLOCKED` without a secure reusable
  isolated session; `estimator` and `pm` identities are absent, and PM is one of
  the five allowed completion roles.
- Project Scope, Claims, Viewer-sensitive permission decisions, broader task
  management, hosted data mutation, and deployment are out of scope.

## Verification

- Documentation scope check: passed; only the two requested new Markdown files
  are present in the staged change.
- `git diff --cached --check`: passed.
- Application tests/build: not run; this is a documentation-only planning
  commit with no product-source change.

→ Handoff to Agent 05. Implement the strict shared/Core authority first and
stop before Web work if durable replay, key conflict, and concurrency cannot be
proven without a schema change.
