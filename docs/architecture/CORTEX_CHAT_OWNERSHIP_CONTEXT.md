# Cortex chat owner/context seam

Status: `source_only` — M3.193, 2026-08-09. The Web chat route remains
unconnected and every Core/Web canary remains disabled.

## Boundary

`GET /v1/cortex/conversation-context` is a read-only Nest boundary for the
part of chat that must be resolved before prompt assembly:

- Core derives tenant, user, role, and `cortex.search` capability from the
  authenticated principal.
- `conversationId` is looked up by `(tenant_id, user_id, id)`; foreign or
  missing conversations return 404 without graph access.
- A stored context is immutable. An incoming pair that is absent from the
  stored conversation or differs from it returns 409.
- A stored or new focused pair is resolved through the tenant graph and
  canonical source-table/node-type map, then checked against current role
  scope. Unsupported source names remain transport-valid so Core preserves
  legacy non-enumerating 404 behavior. Missing, revoked, mismatched, or
  forbidden records return 404.
- The response contains only `{ conversationId, context }`. Messages,
  retrieval, semantic search, provider calls, and writes are separate
  authorities.

The Web adapter transports focus as JSON in a bounded GET query, parses the
strict response, and maps Core errors without a direct database fallback once
the exact tenant gate is selected. It is intentionally not imported by
`apps/web/src/app/api/cortex/chat/route.ts`.

## State contract

| Input | Core result | Meaning |
| --- | --- | --- |
| no conversation, no focus | `{conversationId:null, context:null}` | unscoped new chat |
| owned conversation, no stored focus | owned ID, null context | restore unscoped chat |
| owned conversation, matching focus | owned ID, authorized context | restore immutable focus |
| foreign/missing conversation | 404 | conceal ownership |
| stored half-pair or revoked focus | 404 | conceal invalid/forbidden state |
| incoming focus differs from stored focus | 409 | preserve immutable-context behavior |
| new focus missing/forbidden | 404 | conceal focused record |

## Gates and rollback

API gate: `ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED` plus exact tenant
allowlist `ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS`.

Web gate: `ERP_CORTEX_CONVERSATION_CONTEXT_READS_VIA_API` plus exact tenant
allowlist `ERP_CORTEX_CONVERSATION_CONTEXT_READS_VIA_API_TENANT_IDS`.

Both default false/empty. Wildcards are rejected by the Web exact-tenant
helper. Rollback is clearing the two flags/allowlists; no rebuild is needed.
The chat route, conversation writes, generation, retrieval, semantic indexing,
Supabase, Vercel, Railway, and provider spend remain unchanged.

## Evidence

- Shared owner/context contract: 5/5.
- Nest service: 9/9; HTTP contract: 3/3; environment contract: 66/66.
- Web Core client: 145/145; Web unconnected seam: 3/3.
- Shared, API, and Web typechecks pass.
- Final package lanes: shared-types 286 passed, API 663 passed, and Web 696
  passed; database previously passed 224 with 143 environment-dependent tests
  skipped. Nest webpack and the 82-page Next production build are green. An
  earlier reporter-dot API invocation timed out under runner contention, but
  the exact package script passed all 151 files/663 tests.

This is local source evidence only. It does not prove hosted identity,
database parity, protected browser behavior, rollback artifacts, or spend
approval.
