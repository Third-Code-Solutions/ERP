# Schedule dependency selectors

Scope: replace raw parent/predecessor UUID entry with searchable, paginated task choices. Preserve existing dependencies, ownership, form retry semantics and server-side dependency validation. No schema migration or new dependency.

1. Agent 05: additive authenticated dependency-options query and shared contract; tenant/project scope, current membership, eligible levels, literal search, stable pagination and selected-task resolution. Verify with focused unit/contract and database tests.
2. Agent 03: authenticated Core client and server read action, accessible schedule selectors, lazy loading, loading/error/empty states, explicit clearing of incompatible dependencies and success-only form resets. Verify keyboard, responsive layouts and retries.
3. Agent 13: review combined diff, run release gates, push via PR and deploy only if green. Verify deployed revision and all-role production E2E.

Contract: GET `/v1/projects/:projectId/schedule/dependency-options`; query `kind` (parent/predecessor), `level`, optional `excludeTaskId`, optional `selectedTaskId`, optional literal `search` (max 200), `page` (default 1), `limit` (default 25, max 100). Response: `projectId`, `kind`, `level`, `rows` of `{id, projectId, level, taskCode, name}`, separately resolved `selected` (same scope, even if incompatible with requested level), `page`, `limit`, `total`, `totalPages`. Parent options have higher levels; predecessors share level; exclude self. Selected identity must never resolve outside the authorized tenant/project.

→ Handoff to Agent 05. Inputs: existing schedule contracts/service. Expected output: tested additive query; no application UI edits.

Agent 05 implementation and independent backend/client review are complete. Agent 03 UI implementation was integrated by the main agent; final browser proof covers responsive layout, retries, explicit clearing and stale draft revision protection. Agent 13 now owns final release checks and promotion; no agent may modify the release candidate during verification without restarting affected checks.
