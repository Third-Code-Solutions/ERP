# Core award task participation

Agent 05 adds `GET /v1/process/award-tasks` and
`PATCH /v1/process/award-tasks/:taskId/complete` for verified Finance and CX
principals. The shared `process.award_task.participate` capability is separate
from generic process task management. Existing task creation, assignment,
status, blocking, cancellation, and clock permissions are unchanged.

Reads and completion match the active tenant handoff ledger's exact task ID,
subject, instance key, process-step code and responsible BU, plus the same
tenant's non-retired project. Finance owns the three Finance award tasks; CX
owns its onboarding task. Completion rechecks and locks current actor/tenant
authority and the ledger/task/project/step. Only an in-progress task without a
blocked reason can complete. The existing actor-stamped audit triggers record
task and clock changes in the same transaction, and the request middleware
emits the structured `process.award_task.complete` outcome.

CX remains blocked awaiting NTP. No NTP source of truth or release transition
is introduced. No database migration, UI change, hosted mutation, deployment,
commit, or push was performed by this agent. Agent04's pending migration and
tests were preserved.

Verification using Node 22.23.2:

- PASSED: focused Process and request-observability tests, 92 tests.
- PASSED: shared authorization policy tests, 46 tests.
- PASSED: scoped ESLint on changed production TypeScript files.
- PASSED: final API and shared-types typechecks; `git diff --check`.
- PASSED: rollback-only PostgreSQL authority suite, 12 tests, against isolated
  loopback port 57322 with all 178 repository migrations applied. The original
  port 54322 schema lacked `tenants.status`; it was preserved. The first run on
  the current schema exposed a fixture missing the internal clock's required
  escalation timestamp. Correcting that fixture made all 12 tests pass; no
  production implementation changes or schema changes were needed.
- The first focused run also hit the existing 5-second Nest startup timeout;
  rerunning with the CLI test timeout of 15 seconds passed. No repository timeout
  or safeguard was weakened.

The new database suite covers role/tenant separation, exact instance and ledger
matching, step ownership, inactive/reversed/retired records, stale membership,
blocked CX completion, duplicate completion, and task/clock/audit results. Its
runtime results passed on the fully migrated disposable database. Every fixture
was enclosed in a rollback transaction; no synthetic records were committed.

→ Handoff to Agent 03. Reason: connect the Process page and server action to the
new Finance/CX routes. Inputs: existing queue query/result and task result
contracts; no command body for completion. Expected output: Finance/CX see only
their scoped award queue and a Complete action only for in-progress, unblocked
rows; blocked CX tasks expose no action. Preserve the generic management flow
for existing managers and verify browser behavior.
