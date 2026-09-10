# Process task actions handoff

## Objective

Close the process task loop with safe start, block, resume, complete, and cancel actions using the existing Core status endpoint. Do not merge the process queue with the legacy daily-task surface.

## Sequential ownership

1. **Agent 05 — API/backend:** harden the existing status service boundary and add lifecycle regression coverage. Completed in `apps/api/src/process/process.service.ts` and `apps/api/src/process/process.service.spec.ts`; protected HTTP coverage added in `process.controller.protected.spec.ts`.
2. **Agent 03 — Next.js/Core client:** add strict authenticated status mutation wrapper, server action, and Process Health row controls. Completed; see `docs/changesets/2026-09-10-process-task-queue-ui.md`.
3. **Agent 09 — Dashboard:** add a capability-gated “Process work queue” entry from Today without changing legacy `/tasks` links. Completed; see `docs/changesets/2026-09-10-process-task-actions-dashboard.md`.
4. **Agent 12 — Security:** review tenant, capability, audit, concurrency, and truthful error-state evidence. Pending.
5. **Agent 01 — Product/docs:** reconcile changesets and confirm the feature remains within PRD WO-03/M-06. Pending.

## Boundaries

- No schema or migration changes.
- No assignment picker, task creation, automatic clock start, clock evaluation, approval execution, or procurement side effects.
- Core remains the tenant and transition authority; browser code never writes the database.
