# Approval route preview UI handoff

## Source slice

Agent 05 completed the read-only approval-route preview contract and Core endpoint.

Inputs:

- `GET /v1/process/approval-route-preview?objectType=<object>&amountCentavos=<integer>`
- `approvalRoutePreviewResultSchema` and `ApprovalRoutePreviewResult` from `@third-code-erp/shared-types`
- Response statuses: `unconfigured`, `no_match`, `incomplete`, `ambiguous`, `matched`
- Response markers: `mode: preview_only`, `authority: configured_rules_only`

## Receiving scope

Agent 03 adds the Process Health route read surface and Core client helper. It must preserve the diagnostic markers, show unavailable/error states truthfully, and never present the preview as an executable or approved route.

No schema, migration, approval mutation, PO workflow, delegation, or capability changes are in scope.

→ Handoff to Agent 03. Reason: expose the verified Core contract in the existing Next.js process workspace. Expected output: accessible amount input, deterministic route diagnostics, loading/error/empty states, and focused client/page tests.
