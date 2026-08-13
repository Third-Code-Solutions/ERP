# Cortex conversation owner/context parity review

Status: `source_only`, M3.194, 2026-08-09. This packet records deterministic
evidence for the future Core cutover. It does not approve a tenant canary,
deployment, database write, or provider call.

## Candidate authority

`CortexConversationContextService.resolve()` is the Nest read-only authority
for the pre-chat ownership/context branch. It derives tenant, user, and role
from the verified `ErpPrincipal`; accepts only `conversationId` and optional
`context`; performs no message, retrieval, model, or ERP transaction work.

The Web chat route remains unchanged and unconnected. Legacy behavior is
captured as frozen observable outcomes in
`apps/api/src/cortex/cortex-conversation-context.parity.spec.ts`, not copied
into runtime code.

## Parity fixture

The fixture runs 12 deterministic cases against Core with mocked, tenant-shaped
conversation/node reads and compares the normalized result to the current Web
route contract:

| State | Expected result |
| --- | --- |
| new unscoped chat | `200`, null conversation/context |
| owned unscoped restore | `200`, owned ID, null context |
| owned matching focus | `200`, canonical focused context |
| foreign/missing conversation | concealed `404` |
| half-bound stored context | concealed `404` |
| revoked stored focus | concealed `404` |
| valid new focus | `200`, canonical focused context |
| forbidden current-role focus | concealed `404` |
| immutable focus mismatch | `409` |
| unsupported source | concealed `404` |
| source/type mismatch | concealed `404` |

Additional assertion proves Core calls database reads with the principal's
tenant/user and never receives caller-supplied tenant, role, or scope. Result:
12/12 parity cases and read-boundary assertion pass. Package evidence is green:
shared types 286 tests, API 152 files/675 tests, Web 102 files/696 tests;
typechecks, lint, Nest webpack, and the 82-page Next build pass.

## Gates and rollback

`ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED=false` and its tenant allowlist
remain default-closed. Web selection is also exact-tenant and default-closed.
Before wiring the chat route, still require protected HTTP parity, cross-tenant
denial, clean disposable database replay, deployed API/Web identity, rollback
artifact, and an approved spend ceiling.

Rollback: remove the two Core/Web flag values or leave all allowlists empty.
No schema or hosted state change is required.

## Evidence boundary

Local source evidence only. No Supabase query/write, Vercel build/deploy,
Railway release, browser session, AI/provider request, or paid resource was
used. Database migration parity, managed Auth/RLS runtime behavior, and
production rollback remain unverified.
