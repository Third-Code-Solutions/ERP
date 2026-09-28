# Award task role scope

The live synthetic signed-BOM award created Finance and CX process tasks, but those roles cannot reach the Core task queue or status action. The existing authenticated Data API grant also permits tenant-wide direct reads of `task_instances`.

1. Agent 04/12: review all direct consumers, add a forward migration that removes the broad authenticated task read while preserving Core's server-owned reads, and test role and tenant isolation. Do not alter production data.
2. Agent 05: add narrow Core award-task read and completion authority tied to the active handoff ledger and verified principal. Keep generic task creation, assignment, clock, blocking, and cancellation permissions unchanged. Add security regression tests.
3. Agent 03: connect the Process page and server action to those routes for Finance and CX, with only permitted actions shown. Verify browser behavior.
4. Agent 13: run release gates, inspect exact targets and migrations, deploy only after all gates pass, and verify the live synthetic tenant without mutating the existing signed-award tasks.

PRD A-11 makes NTP receipt the start of the Project Tracker and CX clocks. The
existing `mobilization_readiness.ntp_received_at` is the saved receipt. The
receipt action, signed-BOM entry paths, reversal, and award-task completion
now serialize on the project, and the
shared operation releases only those two handoffs with clocks dated from the
receipt. An unchanged receipt retry reconciles tasks still blocked by the old
path. Corrections to an NTP date with an active award require a separate
audited correction workflow because a clock may already be running.

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

## Agent 13 release preflight update

The isolated PostgreSQL 17 replay now includes the task read boundary and a
`projects` authenticated SELECT parity migration. The latter repairs a source
replay gap; the hosted project already has that grant. The rollback-only award
suite passed 15/15, including tenant-scoped release and an advisory-lock
contention proof. A ten-company, two-role project RLS matrix passed 6/6 and
left no rows. An integrated local browser pass passed 6/6 against disposable
Auth, Core, Web, and source-replayed PostgreSQL: Finance/CX queue and
completion, Viewer denial, foreign Finance isolation, NTP release with saved
receipt clock dates, and retired-project rejection. The final lock-order
refinement passed 15/15 rollback PostgreSQL award checks, 54/54 Process tests,
Core build/typecheck, and independent code review found no remaining concrete
inversion. A second 6/6 browser pass used the final source with 179/179
source migration hashes; it does not establish hosted behavior.

Hosted migrations and deployment remain blocked by the database release
runbook: PITR is disabled, an isolated database restore and separate Storage
recovery are unverified, and the protected production environment has no
reviewer gate. Draft PR #121 has no independent review. The production
workflow rejects pending migrations, so a code-only dispatch cannot release
this candidate. No hosted SQL or production task mutation was performed.
