# Cortex chat read authority audit

Status: source audit only, 2026-08-09. No chat retrieval canary or hosted
provider action is approved.

## Observed Web path

`apps/web/src/app/api/cortex/chat/route.ts` has two independent concerns:

| Concern | Current path | Authority state |
| --- | --- | --- |
| Conversation ownership/context | `getCortexConversation()` and `authorizeCortexRecordContext()` | Direct database read on every incoming conversation request, even when Core user-turn writes are selected. Tenant, user, and role are passed server-side. |
| New conversation/user turn | `createCortexConversation()` + `appendCortexMessage()` when the user-turn flag is off; Core user-turn adapter when on | Writes are separately canaried; Core user-turn selection does not move retrieval. |
| Graph shape/recent context | `getCortexGraphStats()` and `searchCortexNodes(limit 40)` | Direct database read; tenant and `cortexNodeTypeScope(profile.role)` are supplied. No chat-read Core gate. |
| Keyword context | `searchCortexNodesByTerms(limit 12)` and `cortexKeywordAnswer()` | Direct database read; tenant and role scope are supplied. No shared Core retrieval contract. |
| Focused record | `cortexDescribeEntity()` after direct context authorization | Direct database read; Core entity adapter exists elsewhere but is not used by chat. |
| Semantic context | `embedText()` then `cortexSemanticSearch(limit 8)` | Provider/embedding path is optional, disabled without a key, and separately cost-sensitive. No Core chat retrieval authority exists. |
| Assistant persistence | `appendCortexMessage()` when Core assistant authority is off; Core claim/complete when on | Write/generation canaries are independent from all retrieval reads. |

Conversation list/detail routes already have separate Core adapters, but the
chat POST path does not call them for ownership/context or message retrieval.
The existing Core search and graph adapters are not equivalent to chat
retrieval: chat needs recent records, keyword matches, focused citations,
semantic hits, and a bounded prompt projection with one role scope.

## Authority invariants to preserve

1. Never accept tenant, role, node scope, or conversation owner from the
   browser request.
2. Repeat the tenant predicate and role scope in every retrieval query; the
   database application role bypasses RLS.
3. A selected Core chat-read tenant must fail closed on Core error. It must not
   regain any direct retrieval or conversation read in the same request.
4. Retrieval output must be a strict, bounded ERP projection carrying citations
   and freshness/provenance as needed, but no process metrics or prompt state.
5. Provider embedding and model spend remain separately quota-checked; Python
   or a provider may recommend context but never approve or finalize ERP state.
6. Core write/generation success must never be used as evidence that retrieval
   parity, role scope, or citation parity is complete.

## M3.190 source-only Core contract

Added `packages/shared-types/src/erp-api/cortex-chat-retrieval.ts` and the
Nest `GET /v1/cortex/chat-retrieval` pipe/controller/service. The projection
has bounded `recentLimit` (1-40) and `matchLimit` (1-12), canonical optional
focus refs, tenant/RBAC-scoped recent and keyword nodes, deterministic keyword
answer citations, focused citations, graph stats, freshness, and
`semanticStatus: not_migrated`. The service repeats tenant and role checks for
the focused node before calling the source-grounded describe helper.

`ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED=false` and
`ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS=[]` by default. Web chat remains on
the legacy direct path; no Core adapter or semantic/provider call is enabled.
Focused contract/service/controller/environment validation is green. This is
an authority seam, not parity, hosted identity, rollback, or canary evidence.

## Evidence and unresolved design

- Existing chat tests prove conversation ownership denial, record-context
  reauthorization, Core write/generation fail-closed behavior, idempotency, and
  no retrieval/provider work for replayed/in-progress Core claims.
- They also intentionally prove the remaining boundary: when Core writes are
  selected, direct retrieval still executes and a legacy assistant write may
  remain when its own flag is off.
- No Core endpoint currently returns the complete chat retrieval projection.
  Reusing `/v1/cortex/search`, `/v1/cortex/graph`, or conversation detail
  without a new contract would change prompt/citation semantics.
- Next milestone must define a read-only chat retrieval contract and an exact
  tenant canary pair before changing `chat/route.ts`. Keep semantic retrieval
  and conversation ownership as separate slices; do not widen a write canary.
