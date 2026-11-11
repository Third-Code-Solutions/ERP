# Cortex full-coverage mirror: implementation spec

| Field | Value |
|---|---|
| Status | Batches 0 and 1 implemented (`20261106100000`, `20261106101000`). Batches 2 to 6 proposed. |
| Basis | `main` at `b8ff3a70` (2026-11-05), read from `D:/thirdcode/ERP-catalogue` |
| Goal | The owner wants "every piece of data inside the system" in Cortex, including sales and deal management. |
| Authority | ADR-007, `docs/runbooks/cortex-substrate.md`, `packages/shared-types/src/authorization.ts` |

## 0. Decisions in one screen

1. **Coverage.** There are 211 tenant-scoped tables. 43 are mirrored today. The other 168 are classified below:
   - **(a)** 36 get their own node, plus the 2 planned catalogue tables, so 38 in total;
   - **(b)** 41 fold into a parent node or become an edge;
   - **(c)** 91 are never mirrored, each with a reason.

   A coverage test fails CI when someone adds a table without classifying it.
2. **One data-driven mirror.** All new (a) and (b) tables use one SQL registry (`cortex_mirror_registry`) and one apply function. Attributes are a literal per-table allowlist written in the migration, never a denylist. The 23 tables on the current generic mirror move to the registry, which closes the existing PII leaks (§2).
3. **The database read check becomes deny-by-default.** A table maps node type to read group, and an unknown type is denied. This closes the existing leak of budget and stock-movement nodes. The app layer is already deny-by-default.
4. **Sales gets a full deal record in Cortex:**
   - the opportunity node gains stage history, a better title and more props;
   - new nodes: `kyc_track` (status only), `award_handoff`, `pprf` (payload allowlist), `tender`, `tender_deviation` and `tender_bid`;
   - KYC artifact files never enter Cortex.
5. **Per-row triggers stay** (production is small today). Child folds use statement-level triggers. The mirror's cost is dominated by the audit triggers on the `cortex_*` tables (§6, open question Q1). A bulk-mode fallback is specified but not built.
6. **Migrations are additive** and go in 6 batches. Backfill is paged (one tenant per short transaction), resumable and idempotent, and runs by script, not by self-update. A scrub pass then rewrites every stored node, closed ones included. Rollback drops the registry triggers and engine functions only; it keeps the read check and the privacy fixes.

## 1. What the existing mirrors actually do (verified)

**Hand-written mirrors.** `packages/database/src/sql/cortex-substrate.sql`:233–302, 376–443 and 490–618. Each builds `attributes` with an explicit `jsonb_build_object`:
- project: status, client, type, location, sqm, account;
- account: industry, kyc_status, **primary_email**;
- user: role, **email**;
- opportunity: stage, tcv, gp, probability, weighted tcv, account, project, rep. The title is `opportunity_type`, so it is never the client or prospect name;
- document: title = **file_name**; props are type, mime, size, project;
- bom, purchase order, invoice and daily task: money, status and FK fields.

**Generic mirror.** `cortex_mirror_generic()`, cortex-substrate.sql:707–755.
- `attributes = to_jsonb(NEW)` minus a 14-key denylist (:734–737): `token_hash, response_token_hash, signer_ip, signer_user_agent, signer_email, signer_name, bir_tin, payload, snapshot, tasks, mentions, percent_by_category, line_items, body`. Every other column is copied, and any column added later is copied too.
- Title is `row[TG_ARGV[1]]`, falling back to `"<Type> <id8>"`. Summary is `"<Col>: value"`.
- It needs a uuid `id` and a `tenant_id` and silently skips rows without them.
- Edges come only from `project_id, account_id, opportunity_id, bom_id` (part_of / derived_from), `vendor_id` (vendor `supplies` the row) and `created_by | uploaded_by | submitted_by` (`owns`).
- It is attached to 19 tables in cortex-substrate.sql:758–790, plus `cost_entries` (20260614063911), `cost_codes` and `project_budgets` (20260726243000:1117–1135) and `stock_movements` (20260726245000:1371–1380).

**Domain mirrors** (finance, payables, cash, bank and inventory; migrations 20260726201606 to 234000). Full row minus actor columns. Types: fiscal_period, ledger_account, journal_entry, journal_line, supplier_bill, cash_account, cash_transaction, bank_statement, warehouse, stock_receipt and stock_ledger_entry. Journal lines already get one node per line, which is the precedent for line nodes.

**What reaches external providers:**
- The embedding text is `node_type — title — summary` (`packages/database/src/cortex/retrieve.ts`:185).
- Chat retrieval sends title and summary, never attributes. It drops any node whose `ref_table` is not in `CORTEX_GRAPH_REF_TABLE_NODE_TYPES` (`apps/api/src/cortex/cortex-chat-retrieval.service.ts`:133).
- So title and summary are the external-provider surface, and attributes are the at-rest and Data-API surface.

**Two read authorities:**
- **Database:** `auth_can_read_cortex_node_type`, latest at 20260726234000:1146. It is allow-by-default (`else true`) and keyed on the legacy `users.role`. It guards PostgREST reads, and `authenticated` still has SELECT on the `cortex_*` tables (20261104055626 revoked writes only).
- **App:** `cortexNodeTypeScope` (`apps/web/src/lib/cortex/rbac.ts`:22) is deny-by-default through `CORTEX_ENTITY_REGISTRY.accessPath` and `canViewPath`. It guards Drizzle reads, which bypass RLS.
- No browser code reads the `cortex_*` tables (I grepped for `from('cortex_`).

**Write amplification.** WO-02 (20260812155000:138–170) put audit triggers on `cortex_nodes`, `cortex_edges` and `cortex_provenance`. Both the provenance chain and the audit chain take a per-tenant `pg_advisory_xact_lock` (20260726192929).

**Backfill.** The documented backfill is `update <t> set tenant_id = tenant_id` (cortex-substrate.sql:792; applied in 20260614053117). It fires every trigger on the table:
- the audit rows, a second copy of each row;
- the posted-row guards, which reject updates on posted finance rows.

**Gaps:**
- Edges never close. When an FK changes, the old edge stays current, and deleting a node leaves its edges in place.
- `pre_con_checklist_items` has no `project_id`, so its nodes are orphans.

## 2. Security findings in the EXISTING mirrors (fixed in Batch 1)

| # | Finding | Severity |
|---|---|---|
| S1 | The generic denylist fails open and copies contact data and provider ids into `attributes`, visible to every tenant role:<br>- vendors: `contact_name, email, phone, address, notes`<br>- contacts: `email, phone`<br>- warranty_tickets: `submitted_by_name/email` (external customers)<br>- delivery_schedules: `site_address, site_contact_name/phone`<br>- contracts, certificates_of_completion and variation_orders: `docuseal_submission_id`, plus `docuseal_slug` on contracts. On `bom_portal_tokens` that same column holds the signing session token. I found no writer for `contracts.docuseal_slug`, so that exposure is latent.<br>Any future column on these tables is also auto-copied. | High |
| S2 | `auth_can_read_cortex_node_type` returns `true` for `cost_code`, `project_budget` and `stock_movement`. Their source tables are restricted (`auth_can_read_budgets()`, `auth_can_read_inventory()`), so any authenticated tenant user, including `sales`, `design`, `safety` and `cx`, can read budget totals, approvals and stock movements through PostgREST. | High |
| S3 | The hand-written mirrors copy `users.email` and `accounts.primary_email`. Document nodes use `file_name` as the title, and the title goes to the embedding provider. That includes KYC artifact files (`account_kyc_artifacts.document_id`), whose names often carry a person's name or ID type. | Medium |
| S4 | The audit triggers on `cortex_nodes` write each node's attributes, S1 data included, into `audit_log.diff`. Rows already written cannot be purged from that append-only chain. Batch 1 makes `audit_log` server-only: `20261106102000_audit_log_server_only.sql` revokes SELECT from `authenticated` and `anon` and keeps RLS forced with its policy. | Medium (residual) |
| S5 | The DB read check uses `users.role` and the finance group omits `viewer`, while `finance.read` includes `viewer`. This is stricter than the capability map, so it is kept, but noted. | Info |

## 3. Design

### 3.1 New SQL objects

Both new tables are global, have RLS enabled and forced, `revoke all privileges ... from public, anon, authenticated, service_role` and then `grant select ... to service_role` (read-only: rows change only by migration; `scripts/verify-database-repro.mjs` requires server-only tables to stay reachable by `service_role`, and requires each of INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER to be absent for it), and an explicit `deny_direct_client_access` policy (`for all to anon, authenticated using (false) with check (false)`), the server-only pattern of 20260817110000 (advisor lint 0008 flags RLS without policies).

**`cortex_mirror_registry`**, keyed on `ref_table`. Columns:
- `node_type`
- `title_tpl`, `summary_tpl`: `{col}` and `{lookup}` placeholders
- `attr_cols text[]`: the literal allowlist (§3.2)
- `attr_paths text[]`: JSON paths such as `payload.floor_area_sqm`
- `edges jsonb`
- `lookups jsonb`
- `fold jsonb`
- `links jsonb`
- `backfill_order int`

**`cortex_node_type_access`**: `node_type` (pk) and `read_group`.

**Functions.** All are `security definer` with `set search_path = ''`, use qualified names, and are named `cortex_*` so the re-revoke loop covers them.

| Function | Job |
|---|---|
| `cortex_apply_row(p_table text, p_row jsonb, p_op text)` | Core. Builds the title, summary and allowlisted attributes. Then `cortex_upsert_node` (which owns the no-change short-circuit, see below) and the edges from the `edges` spec (`dir` out or in; `many` for `uuid[]`; `via` for a one-hop lookup; `poly` for type/id pairs with a value map). On UPDATE and BACKFILL it calls `cortex_close_stale_edges` once per (edge type, other table, direction) group, keeping every id the row still points at. A `poly` edge is checked against every table in its value map, so the edge to the previous table closes when the type changes. On DELETE it closes the node and its current canonical edges. |
| `cortex_mirror_row()` | Per-row AFTER I/U/D trigger. Calls `cortex_apply_row(TG_TABLE_NAME, to_jsonb(NEW or OLD), TG_OP)` inside the defensive `exception when others then raise warning` wrapper. |
| `cortex_fold_children()` | Statement-level AFTER trigger. There are 3 per child table (insert, update, delete), because Postgres rejects transition tables on multi-event triggers. It computes the distinct parent ids from the transition tables and, for each parent, writes `{count, sum, items[≤limit]}` with `cortex_set_fold`. Defensive. |
| `cortex_set_fold(p_tenant, p_parent_table, p_parent_id, p_key, p_value)` | `jsonb_set` on the parent node at `attributes.folds.<key>`, plus provenance. |
| `cortex_mirror_link()` | Per-row trigger for join tables. Upserts or closes one edge between two existing nodes. |
| `cortex_redact_text(t text, n int)` | Masks emails, tax ids (`TIN` or `tax identification number` followed by 9 or 12 digits, and bare `ddd-ddd-ddd[-ddd]` or space-separated runs) and phone-like digit runs, and truncates to n characters. Applied to the title and summary (300 characters) and to every string attribute, whatever its length (500). |
| `cortex_close_stale_edges(p_node, p_edge_type, p_other_ref_table, p_keep uuid[], p_out boolean default true)` | Sets `valid_to` on the node's other current canonical edges of that type to (`p_out`) or from (`not p_out`) that ref_table, except `p_keep`. The direction flag is needed because `owns` and `supplies` point into the row; the array covers `many` edges. Edges written by `cortex_mirror_link` carry `attributes = {"link": <table>}` and are never closed here, so a link table and an FK with the same (type, table) cannot close each other's edges. |
| `cortex_backfill(p_table text, p_tenant uuid, p_mode text default 'missing', p_limit int default 200, p_after uuid default null, out processed int, out applied int, out skipped int, out failures jsonb, out last_id uuid)` | Mirrors one tenant's rows that have no current node (`missing`), or re-applies every row through the short-circuit (`all`), keyset-paged by `id > p_after`, `p_limit` 1 to 2000. Each row is re-read `FOR SHARE SKIP LOCKED`: a row a live writer holds is `skipped` (its own trigger mirrors it), so a stale image never overwrites a newer one. A failing row is caught and returned in `failures` as `{table, id, error}`; the page goes on. Also recomputes folds for the parent tables of folded children. Call until `processed = 0`, passing back `last_id`. (A plain `returns int` cannot page `all` mode: every call would re-read the same first page.) |
| `cortex_scrub_nodes(p_table text, p_tenant uuid, p_limit int default 200, p_after uuid default null, out processed int, out changed int, out skipped int, out failures jsonb, out last_id uuid)` | Rewrites every node of one table and tenant, closed nodes and nodes whose source row is gone included, keyset-paged by node id. Registry tables keep only `attr_cols` (and the last segment of each `attr_paths`) plus `folds`, and re-render title and summary from what is kept; users, accounts and opportunities drop `email` and `primary_email`; a document node is re-titled `KYC artifact: <type>` when an artifact links it, or `Deleted document` when its row is gone. Every string is redacted. A node whose title or summary changes loses its embedding. Each node is re-read `FOR UPDATE SKIP LOCKED`; a held node is `skipped`, and a re-run picks it up. Provenance origin is `<table>:scrub`. |
| `cortex_apply_{account,user,opportunity,document}(row jsonb, op text)` | The bodies of the 4 hand-written mirrors that change, split out so backfill can call them. Their trigger wrappers keep their names and catch every error as a warning; the warning names `old.id` on DELETE (`case when tg_op = 'DELETE'`), so a mirror error never fails an ERP delete. |
| helpers | `cortex_redact_attrs` (redacts every string attribute, 500 characters), `cortex_render_tpl` (`{col}` templates; null when a placeholder is empty, so the `"<Type> <id8>"` fallback applies), `cortex_edge_targets` (resolves one edge spec), `cortex_refresh_fold` (recomputes one parent's fold; it locks the parent node `FOR NO KEY UPDATE` first, so two concurrent child writes cannot overwrite each other's count, while edge inserts, whose FK check takes `KEY SHARE`, are not blocked), `cortex_link_edge` (one link row), `cortex_kyc_redact` (trigger on `account_kyc_artifacts`). |

**`cortex_upsert_node` (two changes).** It preserves `attributes->'folds'` when `p_attributes` has no `folds` key, so a parent's own upsert never wipes its folds. The folds are read inside the UPDATE itself, from the locked row, so a fold written between the read and the write is not lost. And it returns early, with no update and no provenance, when the current node is `fresh` and title, summary and attributes (folds included) are unchanged. Both live here rather than in `cortex_apply_row`, so they also cover the split account/user/opportunity/document mirrors and the finance, inventory and hand-written parents without touching their mirrors; the backfill idempotency test (§8.8) needs the split mirrors to short-circuit too.

### 3.2 Attribute rule (applies to every registry table, including the 23 migrated ones)

`attr_cols` is a literal list per table, written out in the migration. Nothing is derived from `information_schema` or a regex. A list never holds:
- `tenant_id`;
- contact channels, addresses and government ids (`email`, `phone`, `address`, `tin`, `contact_name`);
- personal names and ids of people or submissions (`*_by_name`, `submitted_by_*`, `assigned_to_text`, `client_submission_id`, signer and responder columns, `docuseal_*`);
- free text (`description`, `location`, `remarks`, `notes`, `*_notes`, `*_reason`) and `cost_entries.reference_number`;
- tokens, hashes, storage paths, and `jsonb`, `json`, array, `bytea` and `vector` columns.

A title or summary template may still render one of the table's columns (for example `{description}` on scope items or `{full_name}` on contacts). It is redacted and cut to 300 characters, and it is not copied into `attributes`. Every title placeholder is a NOT NULL column (guard test), so no title falls back to an older one: stock movements are titled `Stock movement {movement_type} {movement_date}`, because `internal_number` is null on drafts, the only movements that can be deleted. A table with no title template gets `<Type> <id8>`, in the mirror and in the scrub.

Edge columns (`project_id`, `created_by`, …) are used only when their type is `uuid`; a failed cast would raise inside the defensive wrapper and silently drop the whole row.

A column added later stays out until a migration adds it, so the list fails closed. Guard tests hold the lists to the live schema:
- every column a registry row names (`attr_cols`, edges, folds, template placeholders) exists;
- `CORTEX_REGISTRY_COLUMNS` in `__tests__/_cortex-coverage-classes.ts` splits every live column of the 23 tables into `copy` or `omit`, and `copy` must equal `attr_cols`, so a new column fails CI until it is classified;
- every table with a `cortex_mirror_r` trigger has a registry row, and the reverse.

**Batch 1 lists** (23 tables, 290 columns copied before, 179 now):

| Table | `attr_cols` |
|---|---|
| vendors | created_at |
| cost_codes | parent_id, code, category, is_active, created_at |
| material_items | code, category, unit, base_uom_id, inventory_tracked, wastage_bps, is_active, created_at |
| contacts | account_id, role_title, is_primary, created_at |
| scope_items | project_id, code, unit, quantity, unit_cost_cents, line_total_cents, sort_order, created_at |
| permits | project_id, permit_type, status, submitted_at, expected_approval_at, expected_return_at, approved_at, actual_return_at, refunded_at, lgu_name, duration_profile_id, min/expected/max_duration_days, escalation_at, escalated_at, last_status_change_at, created_at |
| variation_orders | project_id, vo_number, change_type, cost_impact_cents, time_impact_days, status, signed_at, created_at |
| progress_claims | project_id, claim_number, milestone_pct, amount_cents, status, submitted_at, certified_at, handed_over_to_finance_at, invoice_id, paid_at, rejected_at, created_at |
| warranty_tickets | project_id, account_id, ticket_number, category, status, acknowledged_at, scheduled_at, closed_at, sla_breached_ack, sla_breached_schedule, created_at |
| delivery_schedules | purchase_order_id, status, scheduled_date, site_prepared_at, received_at, rejected_at, cancelled_at, accepted_at, created_at |
| rfqs | bom_id, status, created_at |
| contracts | project_id, bom_id, status, signed_at, created_at |
| certificates_of_completion | project_id, status, signed_at, warranty_period_starts_at, warranty_period_ends_at, created_at |
| punchlist_items | project_id, trade, priority, status, due_date, pe_signed_off_at, closed_at, created_at, source_handoff_id |
| site_inspections | opportunity_id, status, submitted_at, created_at |
| design_files | opportunity_id, file_type, is_ready_for_presentation, is_client_approved, client_approved_at, created_at |
| change_requests | opportunity_id, priority, affected_design_file_id, resolved_at, created_at |
| master_schedules | project_id, imported_at |
| weekly_reports | project_id, week_ending, generated_at, created_at |
| pre_con_checklist_items | checklist_id, owner_role, sla_days, status, depends_on_item_id, completed_at, sla_clock_started_at, sla_breached_at, sort_order, created_at |
| cost_entries | project_id, bom_line_item_id, po_line_item_id, cost_code_id, voided_at, cost_category, cost_source, amount_cents, quantity, unit, incurred_at, created_at |
| project_budgets | project_id, source_bom_id, supersedes_budget_id, revision, status, control_mode, commitment_tolerance_bps, currency, effective_from, total_budget_cents, original_gp_margin_bps, submitted_at, commercial_approved_at, finance_approved_at, rejected_at, created_at |
| stock_movements | movement_type, status, internal_number, source_warehouse_id, target_warehouse_id, project_id, movement_date, currency, posting_journal_entry_id, reversal_journal_entry_id, posted_at, reversed_at, created_at |

The graph never holds:
- contact channels;
- government IDs;
- signer or responder identity;
- tokens, slugs or provider ids;
- raw payloads.

Every string that is stored (title, summary, attribute) is redacted and truncated.

### 3.3 Sales-specific mechanics

**Opportunity** (`cortex_apply_opportunity`).
- The title becomes `coalesce(prospective_project_name, <account name>, opportunity_type, 'Opportunity')`. The column exists in the database (20260825100000) but not in the Drizzle schema; the trigger reads it from the jsonb row.
- Props add `closing_date`, `area_sqm`, `opportunity_type`, and `lost_reason` and `remarks` redacted.
- **Stage history** lives in `attributes.folds.stage_history`, capped at the last 50 entries:
  - on INSERT it is `[{to, at}]`;
  - on UPDATE with `OLD.stage IS DISTINCT FROM NEW.stage` it appends `{from, to, at, by: auth.uid()}`;
  - the backfill builds it from `opportunity_stage_transition_requests` where `state = 'succeeded'`, ordered by `completed_at`. The first live write to a node that has no history yet does the same. With no receipts, history starts at the stage the node last held.

**KYC.**
- Status is on the account node (`kyc_status`) and on the new `kyc_track` nodes, which are in the kyc group.
- `account_kyc_artifacts` is never mirrored. A small trigger on it (`cortex_kyc_redact`, which mirrors nothing) and a check in `cortex_apply_document` set any referenced document's node title to `KYC artifact: <artifact_type>`. That node carries no `file_name`. When the title changes this way the node's `embedding` is set to null once, so a vector computed from the file name does not outlive it; the embed job refills it from the new title.

**Account and user.** `primary_email` and `email` are dropped from the props.

### 3.4 Parity checklist per new node type (enforced by test)

1. Add the enum value in the migration and in `packages/database/src/schema/cortex.ts`.
2. Add a `cortex_node_type_access` row.
3. Add an entry in `packages/shared-types/src/erp-api/cortex-graph.ts` (`CORTEX_GRAPH_REF_TABLE_NODE_TYPES`). Without it, chat retrieval drops the node.
4. Add an entry in `apps/web/src/lib/cortex/entity-registry.ts` with the `accessPath` given in §5. Without it, the app hides the node.
5. Add a registry row and its triggers.

## 4. Classification of every unmirrored tenant table

Rules:
- **(a)** People name or ask about the row individually; or another (a) table has an FK to it; or it is a reusable price fact.
- **(b)** The row means something only inside one parent and no (a) table points to it. Lookup labels and join rows also go here.
- **(c)** Secrets, receipts, logs, config, embeddings, raw PII, and Cortex or AI runtime tables.

Fold limits: at most 50 items per key (20 for maintenance, 5 for processing jobs), always with `count` and, where there is money, `sum`.

### 4.1 Sales and deal management

| Table | Class | Node / fold target | Edges (→ = out) | Kept / excluded | Group |
|---|---|---|---|---|---|
| opportunity_kyc_tracks | a | `kyc_track` "KYC {track_type}" | → opportunity part_of; prepared_by → owns; president_decided_by → approved_by | keeps type, status, due and decision timestamps; **excludes `notes`, `decision_reason`** | kyc |
| award_handoffs | a | `award_handoff` | → opportunity part_of; → project part_of; → bom derived_from (source_bom_id); → project_budget derived_from; invoice (dp_invoice_id) derived_from →; owns | keeps code, status, created/reversed, reversal_reason; excludes `task_ids`, `project_tracker_id` | tenant |
| pprf_submissions | a | `pprf` "PPRF v{version}" | → opportunity part_of; owns (submitted_by) | `attr_paths`: payload `floor_area_sqm`, `as_built_available`, `project_type`, `expected_start_date`, `budget_range`; **excludes `site_address`, `landlord_contact`, `scope_notes`, `submission_id`** | tenant |
| tender_packages | a | `tender` "{title}" | → opportunity part_of; → bom derived_from (bound_bom_id); → document references_doc (tor, boq); owns | keeps reference, mode, status, closing/submitted | tenant |
| tender_deviations | a | `tender_deviation` | → tender part_of; owner_id → assigned_to | keeps category, title, status, description/response redacted | tenant |
| tender_vendor_profiles | a | `tender_bid` "{vendor}: {trade}" | → tender part_of; vendor supplies → | keeps trade, status, summaries redacted; excludes `availability_notes`, `compliance_notes` | tenant |
| tender_evaluation_criteria | b | tender `folds.criteria` | n/a | name, type, weight_bps, required | n/a |
| tender_evaluation_scores | b | tender_bid `folds.scores` | n/a | criterion_id, score_bps, reviewed_at; excludes `notes` | n/a |
| opportunity_stage_transition_requests | b | opportunity `folds.stage_history` | n/a | written live by the opportunity trigger and backfilled from these receipts (§3.3); no trigger on this table | n/a |

### 4.2 Estimating

| Table | Class | Node / fold target | Edges | Kept / excluded | Group |
|---|---|---|---|---|---|
| bom_line_items | a | `bom_line` (existing enum) "{item_no} {description}" | → bom part_of; → location part_of; → bom_line part_of (parent_line_item_id); → takeoff_import derived_from | keeps kind, code, unit, quantity_decimal, cost, markup, total, classification, ai_drafted; lookup division code/name; excludes `description_original`, `source_row_key`, `source_model`, `notes` | estimating |
| dupas | a | `dupa` "DUPA: {line}" | → bom_line part_of; → assembly derived_from | keeps rates, bps, costs, computed_at | estimating |
| material_catalog | a | `library_material` "{code} {description}" | n/a | keeps rate, uom, rate_source | estimating |
| crew_roles | a | `crew_role` | n/a | keeps hourly rate, effective range | estimating |
| equipment_catalog | a | `library_equipment` | n/a | keeps rate, productivity | estimating |
| assemblies | a | `assembly` "{code} {name}" | n/a | keeps uom, active | estimating |
| price_history | a | `price_record` "{material} @ {occurred_at}" | → library_material part_of; vendor supplies →; → quote derived_from | keeps quoted/awarded rates, source_type; excludes `source_document` | estimating |
| takeoff_imports | a | `takeoff_import` "Takeoff {file_name}" | → bom part_of; → project part_of; → drawing_revision derived_from; owns | keeps counts, status, source; excludes `content_sha256` (regex) | estimating |
| drawing_revisions | a | `drawing_revision` "Drawing {label}" | → project part_of; → document references_doc | keeps source, label | tenant |
| project_locations | a | `location` "{name}" | → project part_of; → location part_of (parent_id) | keeps level, sort | tenant |
| dupa_material_lines, dupa_labour_lines, dupa_equipment_lines | b | dupa `folds.{materials,labour,equipment}` | n/a | description, quantity, persons or units, rate | n/a |
| assembly_material_templates, assembly_labour_templates, assembly_equipment_templates | b | assembly `folds.{…}` | n/a | description, quantity, productivity | n/a |
| bom_line_item_grain_reviews, bom_line_item_location_reviews | b | bom_line `folds.reviews` | n/a | kind, status, reason redacted | n/a |
| boq_divisions | b | bom_line lookup `division` | n/a | code, name; a renamed label shows on the next write or `all` resync | n/a |
| takeoff_unresolved_items | b | takeoff_import `folds.unresolved` | n/a | count by reason_code; **excludes `raw_payload`** | n/a |

### 4.3 Procurement

| Table | Class | Node / fold target | Edges | Kept / excluded | Group |
|---|---|---|---|---|---|
| rfq_quotes | a | `quote` "{vendor}: {material}" | → rfq part_of; → bom_line part_of; → material part_of; vendor supplies → | keeps price, lead time, valid_until; excludes `notes`, `submission_id` | rfq |
| rate_cards | a | `rate_card` "{vendor}: {material}" | vendor supplies → (reuses `supplies`; no new `supplied_by`); → material part_of | keeps price, lead time, preferred, effective range | rate_card |
| po_line_items | a | `po_line` (existing enum) "{description}" | → purchase_order part_of; → bom_line part_of; → material part_of; → cost_code part_of | keeps qty, cost, total, received qty/at; excludes `notes` | procurement |
| procurement_requisitions | a | `requisition` "{requisition_number}" | → project part_of; requester owns; approved_by →; purchase_order derived_from → | keeps status, needed_by, purpose redacted, estimate | procurement |
| price_lists | a | `price_list` "{code} {name}" | vendor supplies →; approved_by → | keeps validity, status, source | rate_card |
| price_list_items | a | `price_list_item` "{material}" | → price_list part_of; → material part_of | keeps unit price, min qty, lead time | rate_card |
| procurement_requisition_lines | b | requisition `folds.lines` | n/a | description, qty, estimated total | n/a |

### 4.4 Finance and inventory

| Table | Class | Node / fold target | Edges | Kept / excluded | Group |
|---|---|---|---|---|---|
| landed_cost_documents | a | `landed_cost` "{document_number}" | → stock_receipt part_of | keeps status, total, basis, applied/reversed | finance |
| inventory_reservations | a | `reservation` | → warehouse, material, project, cost_code, po_line part_of; owns (requested_by) | keeps qty, status, source_type, expiry, released/consumed | inventory |
| project_budget_lines | b | project_budget `folds.lines` | n/a | cost_code_id, description, amount | n/a |
| supplier_bill_lines | b | supplier_bill `folds.lines` | n/a | project_id, cost_code_id, description, amount | n/a |
| cash_allocations | b | cash_transaction `folds.allocations` + link | cash_transaction → `pays` → invoice or supplier_bill | type, target id, amount | n/a |
| bank_statement_lines | b | bank_statement `folds.lines` | n/a | count, matched count, sum; **no descriptions** (counterparty names) | n/a |
| stock_receipt_lines, stock_movement_lines | b | parent `folds.lines` | n/a | material, qty, unit cost, value | n/a |
| landed_cost_lines, landed_cost_allocations | b | landed_cost `folds.{lines,allocations}` | n/a | component, amount / allocated | n/a |
| fiscal_period_close_runs | b | fiscal_period `folds.close_run` (latest) | n/a | status, blocking_count, completed_at | n/a |

### 4.5 Execution, documents, process and assets

| Table | Class | Node / fold target | Edges | Kept / excluded | Group |
|---|---|---|---|---|---|
| project_schedule_tasks | a | `schedule_task` "{task_code} {name}" | → project part_of; → parent part_of; → predecessor depends_on | keeps dates, percent, status, commitment | tenant |
| project_rfis | a | `rfi` "RFI {rfi_number}: {subject}" | → project part_of; owns (requested_by); assigned_to | keeps question/response redacted, priority, status, dates | tenant |
| project_submittals | a | `submittal` "{submittal_number} {title}" | → project part_of; owns; assigned_to | keeps spec, discipline, status, notes redacted | tenant |
| site_diary_entries | a | `diary_entry` "Site diary {diary_date}" | → project part_of; owns | keeps weather, manpower, work and constraints redacted | tenant |
| project_comments | a | `comment` "Comment by {author}" | → project part_of; → comment part_of (parent); author owns; → employee `mentions` (many) | summary = body redacted, 500 characters (Q2) | tenant |
| quality_hold_points | a | `hold_point` "IWR {iwr_number}: {title}" | → project part_of; owns; assigned_to | keeps status, dates, findings redacted | tenant |
| project_weekly_progress | a | `weekly_progress` "Week {week_ending}" | → project part_of | keeps status, lock, version; lookup `percent_by_category`; excludes `war_snapshot` | tenant |
| mobilization_readiness | a | `mobilization` "Mobilization: {project}" | → project part_of | keeps receipt dates, start, override reason redacted | tenant |
| turnover_packages | a | `turnover_package` | → project part_of; → document references_doc (4 FKs) | keeps compiled_at | tenant |
| task_instances | a | `task` (reused) "{step}" | → subject part_of (poly); assigned_to | keeps status, blocked_reason, dates | tenant |
| approvals | a | `approval` "{object_type} approval #{sequence}" | → object part_of (poly); approver → assigned_to | keeps status, requested/decided, note redacted | tenant |
| assets | a | `asset` "{asset_tag} {name}" | → project part_of (assigned_project_id) | keeps kind, status, make/model/serial, location, dates | tenant |
| progress_updates | b | weekly_progress lookup | n/a | percent_by_category (inclusion) | n/a |
| project_submittal_documents, permit_documents, punchlist_photos, site_inspection_photos, progress_claim_documents | b | link | parent → references_doc → document | caption excluded | n/a |
| quality_hold_point_punchlist_handoffs | b | edge on punchlist (via `source_handoff_id` → `quality_hold_point_id`) | punchlist → derived_from → hold_point | n/a | n/a |
| pre_con_checklists | b | edge on checklist item (via `checklist_id`) | item → part_of → project (fixes the orphans) | n/a | n/a |
| permit_duration_profiles | b | none needed | n/a | the app already copies min/expected/max days onto `permits` | n/a |
| site_inspection_rfis | b | inspection `folds.rfis` | n/a | description redacted, priority, resolved_at | n/a |
| delivery_inspections | b | delivery `folds.inspections` | n/a | result, times, notes redacted | n/a |
| change_logs | b | change_request `folds.log` | n/a | event_type, note redacted, at | n/a |
| design_file_versions | b | design `folds.versions` | n/a | version, document_id, uploaded_at | n/a |
| ticket_messages | b | ticket `folds.messages` | n/a | count, internal count, last_at; **no bodies, no sender names** | n/a |
| cnps_surveys | b | ticket `folds.cnps` | n/a | score, responded_at; excludes `comment`, token hash | n/a |
| sla_clocks | b | task `folds.sla` | n/a | type, due, at_risk, breached, status | n/a |
| asset_maintenance_records | b | asset `folds.maintenance` | n/a | type, performed_on, next_due_on, cost (latest 20) | n/a |
| document_processing_jobs | b | document `folds.processing` | n/a | status, mode, scope_item_count, failure_code (latest 5) | n/a |

### 4.6 Catalogue (planned tables; ship in or right after the catalogue migration)

| Table | Class | Node | Edges | Kept | Group |
|---|---|---|---|---|---|
| catalogue_items | a | `catalogue_item` "{code} {name}"; summary "Trade: {trade}" | n/a | trade, specification redacted, unit, active | catalogue |
| catalogue_prices | a | `catalogue_price` "{item} ({region}, {checked_on})" | → catalogue_item part_of; vendor supplies → | low/avg/high centavos, basis, source kind/name/url, checked_on, flag, notes redacted | catalogue |

### 4.7 Never mirrored (c): 91 tables

| Reason | Tables |
|---|---|
| Secrets, tokens and sessions (bearer credentials or signer PII) | bom_portal_tokens, customer_portal_sessions, signature_sessions, warranty_portal_tokens, vendor_confirmation_sessions, platform_support_sessions |
| Command and idempotency receipts (the outcome is already on the mirrored parent; history is in `audit_log`) | journal_post_requests, journal_reverse_requests, customer_invoice_{cancel,draft_create,issue,reverse}_requests, supplier_bill_{post,reverse}_requests, cash_transaction_{draft,workflow}_requests, bank_statement_{auto_match,import,line_match,reconcile,void}_requests, cost_entry_{create,delete,restore}_requests, stock_movement_{create,workflow}_requests, stock_receipt_{create,workflow}_requests, purchase_order_{create,workflow}_requests, delivery_schedule_create_requests, delivery_workflow_requests, change_request_create_requests, project_comment_{create,delete}_requests, project_create_requests, project_retirement_requests, user_role_assignment_requests, asset_maintenance_create_requests, document_{delete,intake}_requests, document_upload_reservations (upload reservation receipt, 20260824110438; added in Batch 1, the first draft missed it), cad_evidence_commit_requests, togal_bom_commit_requests, opportunity_project_conversion_requests (the outcome is `opportunity.project_id` and `award_handoff`), public_signing_requests, vendor_confirmation_requests (41) |
| Outbox, delivery, attempt and event logs (delivery logs carry recipient emails; current state lives on the parent) | notification_outbox, notification_deliveries, notifications, purchase_order_supplier_email_deliveries, provider_delivery_outbox, provider_delivery_attempts, sap_posting_outbox, sap_posting_attempts, sla_logs, roadmap_workflow_events, procurement_requisition_events, inventory_reservation_events, document_processing_evidence (parser payload; the outcome is mirrored as scope_items) |
| Pure config, sequences and lookups | financial_sequences, tax_profiles, tenant_currencies, exchange_rates, units_of_measure, mapping_config, takeoff_mapping_profiles, pre_con_checklist_templates, process_steps (its name is used only as a task-title lookup), approval_rules, approval_delegations, business_calendar_holidays, tenant_feature_flags |
| Raw PII and authorization data | account_kyc_artifacts (KYC files; status lives on accounts and kyc_track), statutory_outputs (BIR payloads carry TINs), platform_user_invitations (emails), tenant_memberships (authority data; the employee node carries the role) |
| Embeddings, AI runtime and Cortex itself (recursion; chat memory is per-user) | embeddings, cortex_nodes, cortex_edges, cortex_provenance, cortex_conversations, cortex_messages, cortex_assistant_generation_jobs, cortex_assistant_provider_policies, cortex_assistant_provider_attempts, cortex_assistant_provider_circuit_alerts, cortex_assistant_turn_requests, cortex_conversation_turn_requests, cortex_semantic_index_jobs |
| Audit chain (already hash-chained; mirroring would duplicate it) | audit_log |

**Existing generic tables moved to the registry** (Batch 1; titles and edges unchanged, attributes allowlisted by §3.2):
- vendors, scope_items, contacts, permits, variation_orders, progress_claims, warranty_tickets, delivery_schedules, rfqs, contracts, certificates_of_completion, punchlist_items, site_inspections, design_files, change_requests, master_schedules, material_items, weekly_reports, pre_con_checklist_items, cost_entries, cost_codes, project_budgets, stock_movements.
- Extra edges: punchlist → hold_point (via handoff); checklist item → project (via checklist).

## 5. Node types, edges and read groups

**New `cortex_node_type` values (35):** kyc_track, award_handoff, pprf, tender, tender_deviation, tender_bid, dupa, library_material, crew_role, library_equipment, assembly, price_record, takeoff_import, drawing_revision, location, quote, rate_card, requisition, price_list, price_list_item, landed_cost, reservation, schedule_task, rfi, submittal, diary_entry, comment, hold_point, weekly_progress, mobilization, turnover_package, approval, asset, catalogue_item, catalogue_price.

Three existing values are reused: `bom_line`, `po_line` and `task`. **No new edge types:** the existing `part_of`, `derived_from`, `supplies`, `pays`, `owns`, `assigned_to`, `approved_by`, `depends_on`, `mentions` and `references_doc` cover every edge above. Edge visibility already requires both endpoints to be readable (20260726201606:1142), so a sales user sees an opportunity but not its `kyc_track` edge.

**Read groups.** `auth_can_read_cortex_node_type` becomes a `case` on the group from `cortex_node_type_access`, with `else false`. The role is resolved from `users` where `id = auth.uid()` and `tenant_id = auth_tenant_id()`, as today. The role lists are copied from `authorization.ts`.

| Group | Roles | Capability source | Node types |
|---|---|---|---|
| tenant | all 13 | `project.read`, `opportunity.read`, `tender.read`, `asset.read` (ALL_ROLES) | every existing type not listed below; plus award_handoff, pprf, tender*, drawing_revision, location, the execution types, task, approval, asset |
| finance | owner, admin, finance | `finance.read` minus viewer (existing, S5) | existing finance types (including `invoice_line`, which has no mirror and whose app path is `/invoices`), landed_cost |
| inventory | `auth_can_read_inventory()` | `inventory.read` minus viewer (existing) | warehouse, stock_receipt, stock_ledger_entry, **stock_movement (S2 fix)**, reservation |
| budget | `auth_can_read_budgets()` | `budget.read` minus viewer (existing function) | **cost_code, project_budget (S2 fix)** |
| kyc | owner, admin, finance, viewer | `account.kyc.read` | kyc_track |
| estimating | owner, admin, commercial, estimator, viewer | `/bom` route roles (= `bom.generate` + viewer; no `bom.read` capability exists) | bom_line, dupa, library_material, crew_role, library_equipment, assembly, price_record, takeoff_import |
| rfq | owner, admin, commercial, finance, procurement | `procurement.rfq_read` | quote |
| rate_card | owner, admin, commercial, viewer | `admin.rate_card.read` | rate_card, price_list, price_list_item |
| procurement | owner, admin, commercial, sd_pm_pe, pm, procurement, viewer | `procurement.read` | po_line, requisition |
| catalogue | owner, admin, commercial, estimator, sd_pm_pe, pm, procurement, viewer | `catalogue.read` (planned; catalogue spec §6) | catalogue_item, catalogue_price |

**App `accessPath` values** (entity registry):
- `/crm/kyc-queue`: kyc_track
- `/pipeline`: award_handoff, pprf, tender*
- `/bom`: the estimating group
- `/documents`: drawing_revision
- `/procurement/rfqs`: quote
- `/admin/rate-cards`: rate_card, price_list*
- `/purchase-orders`: po_line, requisition
- `/finance`: landed_cost
- `/inventory`: reservation
- `/projects`: location and the execution types
- `/process`: approval
- `/assets`: asset
- `/catalogue`: the catalogue types

## 6. Volume and performance

**Trigger writes per business write.** These are measured in rows written by the mirror; the audit triggers on the `cortex_*` tables account for half.

| Operation | Rows written by the mirror |
|---|---|
| INSERT with k new edges | node 1, audit 1, provenance 1, audit 1, then 4 per edge (provenance, audit, edge, audit). So 4 + 4k, typically **12** at k = 2 |
| UPDATE, FKs unchanged | 4 (0 when the no-change short-circuit hits) |
| UPDATE that changes an FK | 4, plus a stale-edge close (2 per closed edge), plus 4 per new edge |
| DELETE | 4, plus 2 per closed edge |
| Child statement (fold) | 4 per distinct parent, plus 1 indexed aggregate query per parent |

Two per-tenant advisory locks are held to commit (audit and provenance). The audit lock is already held by any audited business write, so Cortex lengthens transactions but adds no new blocking class.

**Bulk paths:**

| Path | Shape | Estimate | Decision |
|---|---|---|---|
| Takeoff import (≤ 5,000 lines) | **One INSERT per row** (`apps/api/src/cad/takeoff-import.service.ts`:541), so statement-level triggers would not batch it | about 12 rows × 5,000 = 60,000 extra rows; my estimate is +15 to 30 s on the worst-case import (not measured) | Per-row is acceptable today. Gate: an integration benchmark must finish a 5,000-line import in under 60 s with mirroring on. |
| Togal and document-processing BOM drafts | multi-row INSERT | the same per row | per-row |
| Catalogue seed | about 1,000 items and 700 prices, one transaction | about 9,600 rows, seconds | per-row |
| Child imports (bank lines and others) | per-row statements | an O(n²) fold refresh for n lines in one parent; fine for n ≤ 1,000 | statement-level fold |

**Fallback**, if the gate fails (designed, not built):
- the bulk callers run `set local cortex.bulk = 'on'`;
- `cortex_mirror_row` returns early when it is set;
- the caller then pages `cortex_backfill('<table>', <tenant>, 'missing', 2000, <last_id>)` until `processed = 0`, before commit.

A test asserts that every bulk caller makes that call.

Production volume is small today; I did not measure production row counts. Two growth notes:
- The graph overview (`/api/cortex/graph`, capped at 1,500 nodes) will crowd with line and price nodes. Recommended: exclude bom_line, po_line, price_list_item, catalogue_price and price_record from the overview by default.
- Embedding volume grows mostly with bom_line and catalogue nodes.

## 7. Migration plan

**Template.** Every file:
1. `begin; set local lock_timeout = '5s'; set local statement_timeout = '60s';`
2. the batch DDL;
3. the re-revoke `DO` loop over `cortex\_%` (cortex-substrate.sql:321);
4. `auth_can_read_cortex_node_type` keeps `revoke ... from public, anon` and `grant ... to authenticated, service_role`;
5. `commit;`.

`create trigger` takes SHARE ROW EXCLUSIVE, but `drop trigger` takes **ACCESS EXCLUSIVE**, which also blocks reads. Batch 1 drops a trigger on each of 23 tables in one transaction, so it holds 23 ACCESS EXCLUSIVE locks until commit (plus SHARE ROW EXCLUSIVE on `account_kyc_artifacts`). `lock_timeout` makes it fail fast behind a long transaction; check `pg_stat_activity` first and retry off-peak. Enum values are added in their own file before first use, as the precedent does (242000 → 243000). Migrations are authoritative: add only a header pointer in `cortex-substrate.sql`, and update the runbook.

| # | File (`supabase/migrations/`) | Contents |
|---|---|---|
| 0 | `20261106100000_cortex_coverage_types.sql` | the 35 enum values; the two registry tables; access rows for the existing types (§5 groups) |
| 1 | `…101000_cortex_coverage_core.sql` | §3.1 functions and the `cortex_upsert_node` folds-preservation; read-check rewrite (**S2 fix**); split and edited account, user, opportunity and document mirrors (**S3 fix**); registry rows for the 23 generic tables; **drop the old generic trigger and create `cortex_mirror_r`** on each (**S1 fix**); any other trigger on these tables that still runs `cortex_mirror_generic()` is dropped too, whatever its name. Three of the 23 do not use the name `cortex_mirror_g`: `cost_codes` (`cortex_mirror_budget_cost_code`), `project_budgets` (`cortex_mirror_project_budget`) and `stock_movements` (`cortex_mirror_stock_movement`). Dropping only `cortex_mirror_g` would leave the leaking generic trigger running next to the new one. The old `cortex_mirror_generic()` function is left in place. |
| 2 | `…102000_cortex_coverage_sales.sql` | §4.1 |
| 3 | `…103000_cortex_coverage_estimating.sql` | §4.2 |
| 4 | `…104000_cortex_coverage_procurement_finance.sql` | §4.3 and §4.4 |
| 5 | `…105000_cortex_coverage_execution.sql` | §4.5 |
| 6 | the catalogue migration (or the next file after it) | §4.6 |

**Backfill.** `scripts/cortex-backfill.mjs --batch <n> [--mode missing|all|scrub] [--page-size N] [--resume table:tenant[:id]] [--dry-run]` reads `DATABASE_URL` from the environment only. For each table of the batch, in a fixed order with endpoints first (users, accounts, vendors before the rows that point at them), and for each tenant, it calls `cortex_backfill(table, tenant, mode, page_size, after)` (scrub mode: `cortex_scrub_nodes(table, tenant, page_size, after)`) until `processed = 0`, passing back `last_id`.
- Each call is its own short transaction over one tenant: default 200 rows, at most 2000, under `lock_timeout = 5s` and `statement_timeout = 60s`. It holds one tenant's provenance and audit locks at a time.
- A row that fails is printed as `FAILED-ROW <table> <id> <error>` and the run goes on; the exit code is then 1. If the run itself stops, it prints `RESUME --resume <table>:<tenant>:<id>`, which a re-run takes to continue from that point.
- Rows and nodes held by a live writer are counted as skipped; that writer's trigger mirrors them, and a re-run picks up anything left.
- `--dry-run` only counts the rows (scrub: nodes) each table would process: a rolled-back real run would hold the per-tenant provenance lock for the whole run and block every mirrored write in that tenant.
- **Idempotency:** a second run of `missing` or `all` writes 0 provenance rows, and a second scrub changes 0 nodes (tested). Edges whose parent arrived later are filled by the `all` pass.
- No self-update backfill is ever used.

**Rollout order (Batch 1):**
1. Apply `20261106100000_cortex_coverage_types.sql`, `…101000_cortex_coverage_core.sql` and `…102000_audit_log_server_only.sql`.
2. Run `--batch 1 --mode all`. It re-applies the 23 migrated tables (attributes rewritten to the literal lists) **and** users, accounts, opportunities and documents (emails removed, KYC titles redacted, stage history built), which is the S3 data fix for live rows.
3. Run `--batch 1 --mode scrub`, and repeat it until it reports 0 changed. It reaches what the backfill cannot, because the backfill walks live source rows only: closed nodes and nodes whose source row is gone. Nodes whose title or summary changes lose their embedding, and the embed job refills them from the new text.
4. Run the provenance chain query in the runbook: 0 rows.

**Rollback** (`packages/database/src/sql/cortex-coverage-rollback.sql`, run by hand under the same timeouts):
Run as `psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -f …`; the file sets the same local timeouts.
1. Drop `cortex_mirror_r`, `cortex_fold_{ins,upd,del}` and `cortex_link` on every table listed in the registry.
2. Restore the previous `cortex_upsert_node` body (20260613192346: no fold merge, no unchanged-node skip).
3. Drop the registry engine: `cortex_scrub_nodes`, `cortex_backfill`, `cortex_mirror_link`, `cortex_link_edge`, `cortex_fold_children`, `cortex_refresh_fold`, `cortex_set_fold`, `cortex_mirror_row`, `cortex_apply_row`, `cortex_edge_targets` and `cortex_render_tpl`.

It does **not** re-attach `cortex_mirror_generic()` to the 23 tables, which would re-open S1. It keeps the deny-by-default read check (S2), the split account, user, opportunity and document mirrors with their `cortex_apply_*` functions, `cortex_kyc_redact` (S3), `cortex_close_stale_edges`, the redaction helpers and the server-only `audit_log`. After a rollback the 23 tables are not mirrored: their nodes keep their allowlisted attributes and go stale until step 9b of the core migration is re-applied.

The rollback **keeps all data**: enum values (which cannot be dropped), both registry tables, and every cortex node, edge and provenance row. If stale nodes must disappear, closing them (`valid_to`) is a separate data change.

## 8. Test plan (`packages/database/src/__tests__/cortex-substrate.test.ts`, rollback-only)

The tests are table-driven from the registry, with one minimal fixture factory per (a) and (b) table in a new `__tests__/cortex-fixtures.ts` (from Batch 2; Batch 1 has no new types, so its tests use inline fixtures and synthetic fold/link tables inside the rollback transaction). Add `seedUserWithRole(tx, tenant, role)` to `_db-harness.ts`.

1. **Mirror (per (a) type).** An insert creates one current node with the right `node_type`. Its attribute keys are a subset of `attr_cols ∪ attr_paths ∪ {folds}`, and no key matches the §3.2 regex. Expected edges exist. An update that changes an FK closes the old edge and makes the new one current. A delete closes the node and its edges.
2. **Fold and link (per (b) table).** A child insert, update or delete updates `folds.<key>` (`count`, `sum`, capped items), and no child node exists. A link row creates or closes exactly one edge. A parent's own update preserves its folds.
3. **Tenant isolation (per type).** As tenant B `authenticated`, the tenant-A node is invisible. Inserting a node into another tenant is rejected (extends the existing test).
4. **Read check (per group).** A role outside the group sees 0 nodes and 0 incident edges, and a role inside sees 1. Explicit regressions for S2: `sales` cannot read `project_budget`, `cost_code` or `stock_movement`, and an unknown or unmapped type returns false.
5. **Mirror failure never breaks the ERP write.** In the rollback transaction, replace `cortex_upsert_node` with a raising stub, insert a source row, and assert that the insert commits in the savepoint and that no node exists. Repeat for `cortex_fold_children` and `cortex_mirror_link`.
6. **Provenance continuity.** After a mixed batch across all new types (insert, update, fold, delete), the runbook chain query returns 0 breaks for the tenant.
7. **Sales specifics.**
   - Stage changes append `{from, to}` in order.
   - The PPRF node lacks `site_address` and `landlord_contact`.
   - `kyc_track` lacks `notes` and `decision_reason`.
   - A KYC-linked document's title is redacted.
   - Account and user nodes carry no email.
8. **Backfill idempotency.** Run `cortex_backfill` twice: the second run returns 0 and appends 0 provenance rows. No self-update path exists. Also tested: a failing row is reported with its table and id while the rest of the page applies; a row held by another connection is skipped; a second scrub changes 0 nodes, after the first has cleaned a closed vendor node, an orphaned budget node, user and account emails and a deleted document's title.

**Batch 1 fix tests** (same file):
- an attribute snapshot per migrated table, and the guard tests of §3.2;
- redaction of TINs in every form, with UUIDs, ISO timestamps, dates and short reasons left alone;
- with `cortex_apply_row` and `cortex_apply_account` replaced by raising stubs, ERP deletes still succeed;
- two connections: while one holds a parent node through `cortex_refresh_fold`, the other gets `KEY SHARE` at once and `NO KEY UPDATE` fails with `55P03`;
- `authenticated` and `anon` reading `audit_log` get `42501`, and `service_role` still reads it;
- the rollback leaves only the `cortex_kyc_redact` trigger, keeps the read check denying unmapped types, and leaves no email on user nodes.
9. **Coverage guard.** Every `information_schema` table with `tenant_id` must be in exactly one of: the registry, the hand-written and domain mirror list, the Batch 1 `via` support tables, a `CORTEX_PLANNED[batch]` list (until that batch ships and moves the table to the registry), or a `CORTEX_NEVER_MIRROR` constant with a reason. The lists live in `__tests__/_cortex-coverage-classes.ts`. A new table fails CI until it is classified; a listed table that no longer exists fails too (except the planned catalogue tables).
10. **Parity guard.** Every registry `node_type` must be in the Drizzle enum, `cortex_node_type_access`, `CORTEX_GRAPH_REF_TABLE_NODE_TYPES` and `CORTEX_ENTITY_REGISTRY` (§3.4).
11. **Volume gate** (integration, not unit CI). Run the 5,000-line takeoff import with mirroring on against the 60 s budget (§6).

## 9. Open questions for the owner (closed answers)

- **Q1.** Remove the WO-02 audit triggers from `cortex_nodes`, `cortex_edges` and `cortex_provenance`? The provenance chain already hash-chains every graph write, and these triggers are half of all mirror writes and copy node attributes into `audit_log`. **Yes or no.** If unanswered: keep them.
- **Q2.** Put project comments (body redacted, 500 characters, sent to the embedding provider) in Cortex? **Yes or no.** If unanswered: yes.
- **Q3.** Should the database finance group include `viewer` to match `finance.read`? **Yes or no.** If unanswered: no (keep it stricter).

## 10. Out of scope

- Purging historical `audit_log` diffs (S4); the chain is append-only. They are server-only from Batch 1, and the scrub adds its before-images there too.
- Moving the finance, cash, bank and inventory mirrors to explicit lists. **Remaining:** five hand-written functions still build `attributes` by denylist (`v_row - ...`) for 11 tables, so a new column on those tables is copied until they move. They are readable only by their restricted groups:

  | Mirror function (migration) | Tables | Read group |
  |---|---|---|
  | `cortex_mirror_finance` (20260726201606) | fiscal_periods, ledger_accounts, journal_entries, journal_lines | finance (owner, admin, finance) |
  | `cortex_mirror_payables` (20260726220000) | supplier_bills | finance |
  | `cortex_mirror_cash` (20260726230000) | cash_accounts, cash_transactions | finance |
  | `cortex_mirror_bank_statement` (20260726232000) | bank_statements | finance |
  | `cortex_mirror_inventory_record` (20260726234000) | warehouses, stock_receipts, stock_ledger_entries | inventory (`auth_can_read_inventory()`) |

  `cortex_mirror_receivable_dimensions` (on invoices and journal_lines) only writes edges and copies no attributes.
- Re-embedding stale vectors. The exceptions are a KYC-linked document, whose embedding is cleared with its re-title (§3.3), and any node whose title or summary the scrub changes.
- UI work beyond the parity entries.
