# Runbook: Cortex Graph Substrate

**Owner:** Platform / AI
**Tables:** `cortex_nodes`, `cortex_edges`, `cortex_provenance`
**Source of record:** `supabase/migrations/` (authoritative; latest: the cortex
coverage batches `20261106100000` and `20261106101000`), typed by
`packages/database/src/schema/cortex.ts`. `cortex-substrate.sql` is the original
substrate and is historical. Coverage plan: `docs/erp/specs/cortex-coverage.md`.

---

## What it is

A derived, RLS-scoped, hash-chained projection of the ERP. Canonical data stays
in the ERP tables; the graph mirrors them via `ref_table`/`ref_id`. Kept live by `AFTER` triggers — **whole-ERP coverage**:
- Curated mirrors (`cortex_mirror_{project,account,user,opportunity,document,bom,purchase_order,invoice,daily_task}`).
  Account, user, opportunity and document delegate to `cortex_apply_*(row, op)`
  so backfill can call them: no emails, KYC-linked documents titled
  `KYC artifact: <type>` (trigger `cortex_kyc_redact` on `account_kyc_artifacts`),
  opportunity stage history in `attributes.folds.stage_history`.
- Domain mirrors (finance, payables, cash, bank, inventory).
- **Registry mirror** (`cortex_mirror_row()`, trigger `cortex_mirror_r`) driven by
  `cortex_mirror_registry`: the 23 former generic tables (vendors, cost_codes,
  material_items, contacts, scope_items, permits, variation_orders,
  progress_claims, warranty_tickets, delivery_schedules, rfqs, contracts,
  certificates_of_completion, punchlist_items, site_inspections, design_files,
  change_requests, master_schedules, weekly_reports, pre_con_checklist_items,
  cost_entries, project_budgets, stock_movements). `attr_cols` is a **literal
  allowlist** per table, written in the migration; a column added later stays out
  until a migration adds it. Every stored string is redacted (emails, tax ids,
  phone-like runs). The registry also supports child folds
  (`cortex_fold_children`) and link tables (`cortex_mirror_link`) for later
  batches. `cortex_mirror_generic()` remains defined but is attached nowhere.
- Every tenant table is classified (mirrored, planned batch, or never mirrored
  with a reason) in `packages/database/src/__tests__/_cortex-coverage-classes.ts`;
  the coverage test fails on an unclassified table.

The agent reads `cortex_nodes` across ALL node types, so it fetches the whole DB.
See ADR-007.

## How a row enters the graph

ERP mutation → mirror trigger → `cortex_upsert_node()` (+ derived
`cortex_upsert_edge()`) → `cortex_provenance_append()` (hash-chained).
Mirror triggers are **defensive**: a failure logs `WARNING` and never breaks the
ERP write, deletes included.

## Operations

**Rebuild / reconcile the graph (idempotent, additive):**
```bash
DATABASE_URL=... node scripts/cortex-backfill.mjs --batch 1 --dry-run        # counts only
DATABASE_URL=... node scripts/cortex-backfill.mjs --batch 1 --mode missing   # rows without a node
DATABASE_URL=... node scripts/cortex-backfill.mjs --batch 1 --mode all       # re-apply every row
DATABASE_URL=... node scripts/cortex-backfill.mjs --batch 1 --mode scrub     # rewrite every stored node
```
It pages `cortex_backfill(table, tenant, mode, page_size, after)` (scrub:
`cortex_scrub_nodes(table, tenant, page_size, after)`), one tenant and one
commit per page, endpoints first. `--page-size` defaults to 200 (at most 2000).
Unchanged nodes write no provenance, so a re-run is cheap and safe.
- A failing row prints `FAILED-ROW <table> <id> <error>`; the run goes on and
  exits 1. Fix the row, then re-run.
- A stopped run prints `RESUME --resume <table>:<tenant>:<id>`; pass it to the
  same command to continue.
- Rows and nodes a live writer holds are reported as skipped; re-run to pick
  them up.

**Batch 1 preflight** (before the migrations; off-peak; take a backup or
confirm a fresh restore point first):
- `20261106101000` takes ACCESS EXCLUSIVE on the 23 registry tables and on
  `account_kyc_artifacts` (trigger swap), and `20261106102000` takes ACCESS
  EXCLUSIVE on `audit_log` (policy swap, FORCE RLS), each until its COMMIT.
  While `audit_log` is locked, every audited write waits.
- No long transaction may hold a lock on those tables. This must return no
  rows:
  ```sql
  select a.pid, now() - a.xact_start as age, a.state, left(a.query, 80) as query
    from pg_stat_activity a
   where a.pid <> pg_backend_pid()
     and a.xact_start < now() - interval '30 seconds'
     and exists (
       select 1 from pg_locks l join pg_class c on c.oid = l.relation
        where l.pid = a.pid
          and c.relname = any (array[
            'audit_log', 'account_kyc_artifacts',
            'vendors', 'cost_codes', 'material_items', 'contacts', 'scope_items',
            'permits', 'variation_orders', 'progress_claims', 'warranty_tickets',
            'delivery_schedules', 'rfqs', 'contracts', 'certificates_of_completion',
            'punchlist_items', 'site_inspections', 'design_files', 'change_requests',
            'master_schedules', 'weekly_reports', 'pre_con_checklist_items',
            'cost_entries', 'project_budgets', 'stock_movements']))
   order by age desc;
  ```
- The migrating role and the owner of `audit_log_trigger` must each be
  superuser or BYPASSRLS, because forced RLS binds the owner too and the audit
  triggers write as their owner. Every row must show `true` in one column
  (`20261106102000` raises an exception otherwise):
  ```sql
  select r.rolname, r.rolsuper, r.rolbypassrls
    from pg_roles r
   where r.rolname = current_user
      or r.oid = (select p.proowner from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'audit_log_trigger');
  ```
- Apply in order: types (`20261106100000`), core (`20261106101000`), audit
  (`20261106102000`). Each file is one transaction under `lock_timeout = 5s`.
  On `canceling statement due to lock timeout` (55P03) that file is rolled back
  whole: rerun the long-transaction check and retry the same file.

**Batch 1 rollout order:** apply the three migrations (types, core,
`audit_log` server-only), then `--batch 1 --mode all`, then `--batch 1 --mode
scrub` repeated until it reports `changed 0` and `skipped 0` on every table
(a skipped node was held by a live writer and is not yet scrubbed), then the chain
query below. The scrub is the only pass that reaches closed nodes and nodes
whose source row is gone. Never backfill with `update <t> set tenant_id = tenant_id`: it fires the
audit triggers and the posted-row guards.

**Roll back Batch 1** (keeps all data; drops the registry triggers and engine
functions; keeps the read check, the email-free mirrors, the KYC re-title and
the server-only `audit_log`; the 23 registry tables stop mirroring and their
nodes go stale):
```bash
psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f packages/database/src/sql/cortex-coverage-rollback.sql
```

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

**Run the proof suite** (rollback-only probes; local or disposable DB only):
```bash
DATABASE_URL=postgresql://... DATABASE_HARDENING_EXPECTED=1 \
  corepack pnpm --filter @third-code-erp/database test
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
- **Cortex** (`components/cortex/cortex-agent.tsx`) — graph-grounded chat
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
  tenant's un-embedded nodes via `@third-code-erp/ai` `embedBatch`. Call until
  `remaining` is 0 (drive from a cron/Inngest job). Returns 503 if no embedding
  provider key is configured — the rest of the app is unaffected. New nodes land
  with `embedding = NULL`, so re-run periodically. An updated node keeps its old
  embedding (only a KYC re-title clears it).

## Security invariants (do not regress)

- RLS on all three tables (`auth_tenant_id()`); `anon` sees nothing.
- `auth_can_read_cortex_node_type` is **deny-by-default**: a type reads only
  through its `cortex_node_type_access.read_group` (tenant, finance, inventory,
  budget, kyc, estimating, rfq, rate_card, procurement, catalogue). A type with no
  row is denied to every authenticated user.
- `cortex_mirror_registry` and `cortex_node_type_access` are server-only (RLS
  forced, `deny_direct_client_access`, no client grants; `service_role` may only
  read them, because rows change only by migration; the verifier fails on any
  write privilege).
- `audit_log` is server-only: no SELECT for `authenticated` or `anon` (table or
  column level; the verifier checks both), and its only policy is
  `deny_direct_client_access`, so a re-grant still shows clients nothing.
- `cortex_*` functions have `EXECUTE` revoked from `anon/authenticated/public`.
  New `cortex_*` functions MUST be revoked too (the `7b` `DO` block re-revokes
  all `cortex\_%` functions — re-run after adding any).
- Provenance is append-only (RLS update/delete = `false`).

## Adding a new entity to the graph

Follow the parity checklist in `docs/erp/specs/cortex-coverage.md` §3.4:
1. Enum value in a migration and in `schema/cortex.ts`.
2. A `cortex_node_type_access` row (without it the type is unreadable).
3. `CORTEX_GRAPH_REF_TABLE_NODE_TYPES` (shared-types) and
   `CORTEX_ENTITY_REGISTRY` (web) entries.
4. A `cortex_mirror_registry` row with a literal `attr_cols` allowlist, plus the
   `cortex_mirror_r` trigger (or fold / link triggers for child tables).
5. Re-run the `cortex\_%` revoke loop in the same migration.
6. Move the table out of `CORTEX_PLANNED` in `_cortex-coverage-classes.ts`, then
   backfill with `scripts/cortex-backfill.mjs`.

## Known limits of the coverage Batch 1 privacy fixes

- Nodes written before Batch 1 keep their old attributes (vendor contact data,
  emails) until `--batch 1 --mode all` and then `--mode scrub` have run.
- A document is mirrored under its file name until a KYC artifact links it.
  From then on the title is `KYC artifact: <type>` and the node's embedding is
  cleared so it is rebuilt from the new title. The earlier title stays in
  `audit_log` (append-only), and it may already have been sent to the embedding
  provider.
- Redaction is pattern-based and top-level only: every string attribute has
  emails, tax ids and phone-like digit runs masked and is cut to 500 characters;
  titles and summaries are cut to 300. A name in a title (contacts, design
  files) or free text in a description-based title is kept, masked.
- The finance, cash, bank and inventory mirrors (11 tables) still copy by
  denylist; see the spec, §10.

## Known follow-ups (pre-existing, not from this slice)

- `vector` extension lives in `public` (advisor `0014`) — move to `extensions`.
- Pre-existing functions (`auth_tenant_id`, `jsonb_diff`, `audit_log_trigger`)
  have mutable `search_path` (advisor `0011`).
- Auth leaked-password protection disabled (dashboard toggle).
