# Cortex chat retrieval review packet

Status: `review_required` — source-only; no chat-read tenant canary is
enabled. Prepared 2026-08-09.

This packet is evidence, not deployment authority. It does not authorize a
Supabase query/write, Vercel or Railway build/deploy, AI/provider call, or paid
resource.

## Candidate and gates

- Application candidate: `8600c9e573b90365491a0640f64ab5b1bf797965` on
  `agent-02/third-code-erp-landing`, pushed to
  `Third-Code-Solutions/ERP`; not deployed.
- API gate: `ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED=false` and
  `ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS=[]`.
- Web chat remains on its direct path. No Web adapter, Core client branch, or
  semantic/provider cutover exists.
- Wildcards are not permitted for any future chat-read allowlist.

## Contract and authority

`GET /v1/cortex/chat-retrieval` accepts only `query`, optional canonical
`focus`, `recentLimit` (1–40), and `matchLimit` (1–12). Nest derives tenant,
user, and role from the authenticated principal; `cortex.search` is required.
Every graph read repeats tenant and role node-type scope. A focused reference
must resolve to the canonical table/node-type mapping in that scope or returns
an empty focused projection. The result is bounded and strict: stats, recent
items, keyword matches, focused citations, deterministic keyword answer, and
explicit `semanticStatus: not_migrated`.

No embedding, model, queue, write, approval, or ERP transaction occurs in this
read authority. Python/provider output cannot approve or finalize an ERP
record.

## Local parity evidence

- Shared contract: 4/4.
- API service/controller/environment focused lane: 72/72 (including the
  deterministic legacy/Core projection equality fixture).
- Shared/API typecheck, root test, lint, build, spend guard, controlled-release
  plan, Actionlint, pinned workflow refs, Gitleaks, diff, and clean-room scans
  passed. The production build generated 82 Web pages.
- The parity fixture is deterministic source evidence only. It normalizes the
  current direct chat reads into the same projection as the Core service; it
  does not exercise a browser session, hosted database, deployed API, or
  provider.

## Blocking evidence before canary

1. Restore the approved Supabase backup/PITR clone and prove catalog, RLS,
   tenant, audit, and data parity against the 112-migration disposable replay.
2. Supply one exact approved tenant, role matrix, authenticated identity, and
   owner approval. Run protected role, forbidden-node, cross-tenant, malformed
   query, focus-denial, timeout, and Core-503 checks.
3. Add a reviewed Web server seam with exact-tenant selection, no direct
   fallback after Core failure, and parity for conversation ownership/context.
4. Record exact deployed API/Web identities, rollback artifacts, and a
   flag-clear rollback drill. Source SHA alone is not hosted identity proof.
5. Set an explicit request/daily spend ceiling; keep semantic embeddings and
   model calls disabled until separately reviewed.

## Abort and rollback

Abort on tenant/role leakage, non-canonical focus, projection drift, Core
timeout/5xx, retry amplification, provider activity, readiness failure, or
any spend breach. Clear the API flag and allowlist, retain the last-known-good
artifacts, and do not rebuild to roll back. Record the failed identity and
evidence before re-review.
