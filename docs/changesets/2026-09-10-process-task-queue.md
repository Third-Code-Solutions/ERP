# Process task queue

## Scope

- Added strict shared contracts and `GET /v1/process/tasks` for the authenticated process work queue.
- Restricted task-level reads to `process.task.manage` and applied explicit tenant predicates to tasks, process steps, and active SLA clocks.
- Added status/business-unit filters, bounded pagination, deterministic ordering, distinct task counting, and opaque subject references.
- Projected current SLA-clock evidence without evaluating clocks, escalating, auditing, or mutating rows.
- Hardened the existing task-status service boundary so direct callers cannot create blocked tasks without a reason or attach a reason to another status.

## Verification

- API process service/controller tests — passed, 28 tests.
- Protected HTTP boundary tests — passed, 4 tests (401 unauthenticated, 403 unauthorized queue read and status mutation, verified tenant principal).
- Process lifecycle regression tests — passed, 13 legal transitions plus illegal/terminal/cross-tenant and blocked-reason rejection cases.
- Shared process-SLA contract tests — passed, 10 tests.
- API typecheck — passed.
- Shared-types typecheck — passed.
- `git diff --check` — passed.

The local runtime is Node 24.16.0 while the repository declares Node 22.x; checks were run with pnpm engine-strict disabled and emitted the expected engine warning.

## Deliberate non-scope

No schema or migration changes, clock evaluation, task mutation, subject deep-links, approval-policy changes, or purchase-order workflow changes are included.
