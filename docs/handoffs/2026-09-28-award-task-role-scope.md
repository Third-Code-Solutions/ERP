# Award task role scope

The live synthetic signed-BOM award created Finance and CX process tasks, but those roles cannot reach the Core task queue or status action. The existing authenticated Data API grant also permits tenant-wide direct reads of `task_instances`.

1. Agent 04/12: review all direct consumers, add a forward migration that removes the broad authenticated task read while preserving Core's server-owned reads, and test role and tenant isolation. Do not alter production data.
2. Agent 05: add narrow Core award-task read and completion authority tied to the active handoff ledger and verified principal. Keep generic task creation, assignment, clock, blocking, and cancellation permissions unchanged. Add security regression tests.
3. Agent 03: connect the Process page and server action to those routes for Finance and CX, with only permitted actions shown. Verify browser behavior.
4. Agent 13: run release gates, inspect exact targets and migrations, deploy only after all gates pass, and verify the live synthetic tenant without mutating the existing signed-award tasks.

The CX task is blocked awaiting NTP. The source of truth for releasing that task requires a separate product decision; this handoff must not silently release it.

## Agent 05 → Agent 03

Core now exposes `GET /v1/process/award-tasks` with the existing
`ProcessTaskQueueQuery` / `ProcessTaskQueueResult` contracts, and
`PATCH /v1/process/award-tasks/:taskId/complete` with no command body, returning
`TaskInstanceResult`. The shared `process.award_task.participate` capability is
Finance/CX-only. Keep managers on the existing generic routes. Show participants
only completion for in-progress rows with no blocked reason; CX's blocked row
must remain actionless.

Core applies the active ledger, tenant, non-retired project, exact task ID and
instance, step code, and responsible BU predicates to reads and completion.
Completion also rechecks active actor/tenant authority inside the transaction.
Generic create/assign/status/clock capabilities were not expanded.

Process/observability tests passed (92), shared authorization tests passed (46),
and scoped production TypeScript lint, final API/shared-types typechecks, and
`git diff --check` passed. The new rollback PostgreSQL suite passed all 12 tests
on isolated port 57322 after all 178 migrations were replayed. The stale shared
port 54322 database was preserved. One fixture needed its required internal
clock escalation timestamp; no production code fix was needed. See
`docs/changesets/2026-09-28-award-task-core-authority.md` for details.

## Agent 03 → Agent 13

The Process page routes Finance/CX through the award-task queue; its completion
action uses the scoped Core endpoint with no command body. Participant controls
exist only on unblocked in-progress rows. Generic manager transitions are
unchanged, and CX awaiting NTP has no completion or resume control.

Focused unit/role/adapter tests passed (209), Chromium component tests passed
(8), and Web/E2E typechecks, scoped production lint and Next production build
passed on Node 22. Integrated demo
browser proof remains BLOCKED pending a local Core with current schema; component
tests stub actions and are not API/database evidence. No hosted award tasks were
mutated. See `docs/changesets/2026-09-28-award-task-process-ui.md`.

→ Handoff to Agent 13. Reason: integration and release gates. Inputs: scoped Core
routes, read-boundary migration, Process UI and focused tests. Expected output:
current-schema database tests and read-only demo Finance/CX browser verification,
followed by the authorized release process only after its gates pass.
