# Process task queue UI handoff

## Source slice

Agent 05 completed the read-only process-task queue contract and Core endpoint.

Inputs:

- `GET /v1/process/tasks?status=&responsibleBu=&page=&limit=`
- `processTaskQueueResultSchema` and `ProcessTaskQueueResult` from `@third-code-erp/shared-types`
- Access capability: `process.task.manage`
- Rows include process-step identity, opaque subject references, task status, assignee, blocked reason, timestamps, and nullable active SLA-clock evidence.

## Receiving scope

Agent 03 adds the queue to the existing Process Health workspace and Core client. The UI must gate the request with the same capability, preserve URL filters, show loading/error/empty states, label observe-mode and external clocks, and avoid inventing subject links or evaluating SLA state client-side.

No schema, migration, task mutation, approval, delegation, or purchase-order workflow changes are in scope.

→ Handoff to Agent 03. Reason: expose verified process-task reads in the existing workspace. Expected output: accessible filterable queue with truthful Core errors and focused client/page tests.
