# Cortex chat Web seam design

Status: source-only design, 2026-08-09. The seam is implemented but not
connected to `apps/web/src/app/api/cortex/chat/route.ts`; no tenant canary is
approved.

## Authority sequence

1. `getUserProfile()` supplies the authenticated user, tenant, and role. The
   browser never supplies tenant, role, node scope, or conversation owner.
2. A separate conversation seam resolves the owned conversation and rechecks
   any persisted/incoming focused record. Existing 404/409 behavior remains
   unchanged until that ownership/context contract has its own parity proof.
3. The retrieval seam derives the last user message and authorized focus, then
   calls the strict Core projection only when
   `ERP_CORTEX_CHAT_RETRIEVAL_READS_VIA_API=true` and the exact tenant UUID is
   allowlisted.
4. If Core is selected and returns timeout/5xx/invalid data, the seam returns
   a visible 503. It never re-enters direct graph reads in that request.
5. Only a validated `CortexChatRetrievalResult` reaches prompt assembly. The
   model/provider remains optional and separately quota-gated; deterministic
   citations stay source-grounded.

## Transport contract

The server-only client calls `GET /v1/cortex/chat-retrieval` with bounded
`query`, `recentLimit`, `matchLimit`, and a JSON-encoded canonical `focus`.
It uses the authenticated Supabase session bearer, `cache: no-store`, one
5-second timeout, and no retry loop. The API result is parsed again in Web.

## State table

| Tenant selection | Retrieval authority | Core failure | Route status |
| --- | --- | --- | --- |
| Not selected | Existing direct path | Existing behavior | Compatibility only |
| Exact UUID selected | Nest/Core projection | 503; no direct fallback | Future canary only |
| Wildcard/malformed/empty | No Core selection | N/A | Keep legacy path until reviewed |

Conversation owner/context, user-turn persistence, assistant claim/complete,
generation jobs, semantic embeddings, and provider spend are deliberately
separate flags. A successful write or generation job cannot authorize this
read seam.

## Required gates before wiring

- deterministic projection parity (completed source fixture); conversation
  owner/context parity (not completed);
- protected role and forbidden-node checks, cross-tenant denial, malformed
  focus/query rejection, Core 503 no-fallback check;
- exact deployed API/Web identities, rollback artifact/drill, Supabase
  backup/PITR and isolated 112-migration replay;
- explicit request/daily spend ceiling, with semantic/provider calls still
  disabled unless separately approved.

Until all gates pass, the adapter remains unconnected and all allowlists stay
empty. This design does not authorize deployment or hosted database changes.
