# Runbook: Cortex Graph Substrate

**Owner:** Platform / AI
**Tables:** `cortex_nodes`, `cortex_edges`, `cortex_provenance`
**Source of record:** `packages/database/src/schema/cortex.ts` (Drizzle) +
`packages/database/src/sql/cortex-substrate.sql` (RLS, functions, triggers, backfill).

---

## What it is

A derived, RLS-scoped, hash-chained projection of the ERP. Canonical data stays
in the ERP tables; the graph mirrors them via `ref_table`/`ref_id`. Kept live by
`AFTER` triggers. Entities mirrored today:
`projects`, `accounts`, `users` (employee), `opportunities`, `documents`,
`boms`, `purchase_orders`, `invoices`, `daily_tasks`
(`cortex_mirror_{project,account,user,opportunity,document,bom,purchase_order,invoice,daily_task}`).
See ADR-007.

## How a row enters the graph

ERP mutation → mirror trigger → `cortex_upsert_node()` (+ derived
`cortex_upsert_edge()`) → `cortex_provenance_append()` (hash-chained).
Mirror triggers are **defensive**: a failure logs `WARNING` and never breaks the
ERP write.

## Operations

**Rebuild / reconcile the graph (idempotent, additive):**
Re-run the backfill section of `cortex-substrate.sql` (the three `DO` blocks).
`cortex_upsert_*` updates existing current nodes and inserts missing ones; it
never deletes. Safe to run anytime.

**Verify provenance chain integrity (per tenant):**
```sql
with chain as (
  select tenant_id, id, prev_hash, hash,
    lag(hash) over (partition by tenant_id order by id) as prior_hash,
    row_number() over (partition by tenant_id order by id) as rn
  from cortex_provenance
)
select tenant_id, count(*) as breaks from chain
where (rn = 1 and prev_hash <> 'genesis')
   or (rn > 1 and prev_hash is distinct from prior_hash)
group by tenant_id having count(*) > 0;
```
Zero rows = intact. Any row = tampering/gap → SEV-1, investigate.

**Check mirror health:** mirror failures emit `WARNING 'cortex_mirror_* failed …'`.
Grep Postgres logs. A graph row count far below the ERP row count for a type
signals systematic mirror failure → reconcile + investigate the trigger.

**Run the proof suite:**
```bash
corepack pnpm --filter @buildops/database test
```

## Dashboard surface (where users find it)

Sidebar → **Cortex** (Workspace section, visible to all roles). Page: `/cortex`
(`app/(dashboard)/cortex/page.tsx`). Two halves:
- **Knowledge Graph** (`components/cortex/cortex-graph-canvas.tsx` +
  `cortex-graph-view.tsx`) — Obsidian / conducting.ai-style interactive
  force-directed graph: canvas + `d3-force` physics, wheel-zoom, drag-pan,
  node-drag, hover-highlights a node's neighborhood, click opens a detail drawer
  (reuses `CortexEntityPanel`). Whole graph from `GET /api/cortex/graph`
  (tenant-scoped, capped 1500 nodes for speed); node colour = record type, size
  = degree; respects `prefers-reduced-motion`.
- **BuildOps Agent** (`components/cortex/cortex-agent.tsx`) — graph-grounded chat
  → `POST /api/cortex/chat` (Atlas). Tenant-scoped context, cites records, has an
  "I don't have that in the graph" path, audit-logged (`cortex_chat`). Streams.
  **Persistent memory**: every turn is stored in the user's DB
  (`cortex_conversations` / `cortex_messages`, tenant + user scoped, RLS). The
  route resolves/creates a thread, stores the user turn, then the assistant turn
  on stream end, and returns `X-Conversation-Id`. History APIs:
  `GET /api/cortex/conversations` (list) and `GET /api/cortex/conversations/:id`
  (messages, ownership-checked). Store: `cortex/chat-store.ts`. Per-project chat
  (`components/ai/project-chat.tsx` → `/api/ai/chat`) still exists too.
- **Navigation**: graph nodes deep-link to the real ERP record via
  `lib/cortex/href.ts` (project → /projects/{id}, account → /crm/accounts/{id},
  BOM/invoice/PO/document/task → their module/project tab). Double-click a node
  or use "Open record →" in the drawer.

Graph counts for the page come from `getCortexGraphStats(tenantId)`.

## Semantic search (hybrid retrieval, vector arm)

`cortex_nodes.embedding` (1536-dim, `text-embedding-3-small`) backs cosine
search via an HNSW index (`idx_cortex_nodes_embedding`, `vector_cosine_ops`).

- Search: `cortexSemanticSearch(tenantId, embedding, { nodeType?, limit })` —
  tenant-scoped, only nodes with an embedding, nearest first.
- Embedding text: `cortexEmbeddingText(node)` — deterministic; changing it means
  re-embedding the whole graph.
- Population: `POST /api/cortex/embed` (admin-only) embeds a batch of the
  tenant's un-embedded nodes via `@buildops/ai` `embedBatch`. Call until
  `remaining` is 0 (drive from a cron/Inngest job). Returns 503 if no embedding
  provider key is configured — the rest of the app is unaffected. New/updated
  nodes land with `embedding = NULL`, so re-run periodically to keep fresh.

## Security invariants (do not regress)

- RLS on all three tables (`auth_tenant_id()`); `anon` sees nothing.
- `cortex_*` functions have `EXECUTE` revoked from `anon/authenticated/public`.
  New `cortex_*` functions MUST be revoked too (the `7b` `DO` block re-revokes
  all `cortex\_%` functions — re-run after adding any).
- Provenance is append-only (RLS update/delete = `false`).

## Adding a new entity to the graph

1. Add the node type to `cortex_node_type` (enum) if missing.
2. Write `cortex_mirror_<entity>()` (copy an existing one; keep the defensive
   `EXCEPTION` wrapper) + `AFTER INSERT/UPDATE/DELETE` trigger.
3. Add derived edges from its FKs via `cortex_upsert_edge(... 'canonical' ...)`.
4. Add a backfill `DO` block.
5. Re-run the `7b` revoke block.
6. Extend `cortex-substrate.test.ts`.

## Known follow-ups (pre-existing, not from this slice)

- `vector` extension lives in `public` (advisor `0014`) — move to `extensions`.
- Pre-existing functions (`auth_tenant_id`, `jsonb_diff`, `audit_log_trigger`)
  have mutable `search_path` (advisor `0011`).
- Auth leaked-password protection disabled (dashboard toggle).
