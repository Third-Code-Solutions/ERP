# Cortex conversation owner/context HTTP review

Status: `source_only`, M3.195, 2026-08-09. This packet proves local HTTP
contract behavior and selected-Core fail-closed behavior. It does not authorize
tenant activation, deployment, managed database access, or provider spend.

## HTTP contract

`GET /v1/cortex/conversation-context` accepts only bounded
`conversationId`/JSON `context` query data. The controller pipe rejects malformed
UUIDs, incomplete focus, and caller-supplied tenant/role/scope with `400` before
the service. The verified Nest principal is the only source of tenant, user,
role, and capability.

Service failures retain the legacy chat semantics at HTTP boundary:

| Condition | Status | Message |
| --- | ---: | --- |
| missing/foreign conversation or revoked focus | 404 | `Conversation not found` |
| missing/forbidden new focus | 404 | `Focused record not found` |
| immutable focus mismatch | 409 | `Conversation context mismatch` |
| closed tenant canary | 503 | `Cortex conversation context reads are not enabled for this tenant.` |

Successful responses are strict `{ conversationId, context }` projections with
no messages, retrieval material, writes, or provider output.

## No-fallback harness

The server-only Web seam was exercised for an exact selected tenant. Core
404/409/503 failures are returned as `source: core` failures; a selected Core
timeout maps to `503`, invokes the Core client exactly once, and has no direct
database fallback or retry path. Unselected tenants fail closed before Core.

## Evidence

- Nest HTTP contract: 7/7.
- Web selected-Core seam: 4/4.
- Full package lanes: shared-types 286 tests; API 152 files/679 tests; Web
  102 files/697 tests.
- Shared/API/Web typechecks pass; lint and prior Nest/Web production builds are
  green; cost/security guards remain green.

Local synthetic principals and mocked reads only. Protected deployed auth,
cross-tenant managed replay, exact API/Web release identity, rollback drill,
and spend approval remain open gates. Rollback is clearing Core/Web flags and
allowlists; no schema change is required.
