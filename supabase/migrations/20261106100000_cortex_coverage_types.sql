-- Cortex coverage, Batch 0 (docs/erp/specs/cortex-coverage.md §7 row 0).
--
-- Additive only:
--   * the 35 new cortex_node_type values (unused until their batch ships);
--   * the global mirror registry and node-type read-group tables;
--   * read-group rows for every EXISTING node type (§5).
--
-- New node types get their access row in the batch that first mirrors them.
-- Until then auth_can_read_cortex_node_type (Batch 1) denies them.
-- ALTER TYPE ... ADD VALUE is transaction-safe here because no statement in
-- this file uses a new value.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter type public.cortex_node_type add value if not exists 'kyc_track';
alter type public.cortex_node_type add value if not exists 'award_handoff';
alter type public.cortex_node_type add value if not exists 'pprf';
alter type public.cortex_node_type add value if not exists 'tender';
alter type public.cortex_node_type add value if not exists 'tender_deviation';
alter type public.cortex_node_type add value if not exists 'tender_bid';
alter type public.cortex_node_type add value if not exists 'dupa';
alter type public.cortex_node_type add value if not exists 'library_material';
alter type public.cortex_node_type add value if not exists 'crew_role';
alter type public.cortex_node_type add value if not exists 'library_equipment';
alter type public.cortex_node_type add value if not exists 'assembly';
alter type public.cortex_node_type add value if not exists 'price_record';
alter type public.cortex_node_type add value if not exists 'takeoff_import';
alter type public.cortex_node_type add value if not exists 'drawing_revision';
alter type public.cortex_node_type add value if not exists 'location';
alter type public.cortex_node_type add value if not exists 'quote';
alter type public.cortex_node_type add value if not exists 'rate_card';
alter type public.cortex_node_type add value if not exists 'requisition';
alter type public.cortex_node_type add value if not exists 'price_list';
alter type public.cortex_node_type add value if not exists 'price_list_item';
alter type public.cortex_node_type add value if not exists 'landed_cost';
alter type public.cortex_node_type add value if not exists 'reservation';
alter type public.cortex_node_type add value if not exists 'schedule_task';
alter type public.cortex_node_type add value if not exists 'rfi';
alter type public.cortex_node_type add value if not exists 'submittal';
alter type public.cortex_node_type add value if not exists 'diary_entry';
alter type public.cortex_node_type add value if not exists 'comment';
alter type public.cortex_node_type add value if not exists 'hold_point';
alter type public.cortex_node_type add value if not exists 'weekly_progress';
alter type public.cortex_node_type add value if not exists 'mobilization';
alter type public.cortex_node_type add value if not exists 'turnover_package';
alter type public.cortex_node_type add value if not exists 'approval';
alter type public.cortex_node_type add value if not exists 'asset';
alter type public.cortex_node_type add value if not exists 'catalogue_item';
alter type public.cortex_node_type add value if not exists 'catalogue_price';

-- One row per mirrored source table. Global (not tenant data): it describes
-- how rows become nodes. attr_cols is a frozen allowlist computed by the
-- migration that adds the row; a column added later stays out until a
-- migration adds it (spec §3.2).
create table if not exists public.cortex_mirror_registry (
  ref_table      text primary key,
  node_type      public.cortex_node_type,
  title_tpl      text not null default '',
  summary_tpl    text not null default '',
  attr_cols      text[] not null default '{}',
  attr_paths     text[] not null default '{}',
  edges          jsonb not null default '[]'::jsonb,
  lookups        jsonb not null default '{}'::jsonb,
  fold           jsonb,
  links          jsonb,
  constraint cortex_mirror_registry_kind check (
    (node_type is not null)::int + (fold is not null)::int + (links is not null)::int = 1
  ),
  constraint cortex_mirror_registry_edges_array check (jsonb_typeof(edges) = 'array')
);

-- Database read group per node type. auth_can_read_cortex_node_type denies
-- any type without a row (deny-by-default, spec §5).
create table if not exists public.cortex_node_type_access (
  node_type  public.cortex_node_type primary key,
  read_group text not null,
  constraint cortex_node_type_access_group check (
    read_group in (
      'tenant', 'finance', 'inventory', 'budget', 'kyc', 'estimating',
      'rfq', 'rate_card', 'procurement', 'catalogue'
    )
  )
);

alter table public.cortex_mirror_registry enable row level security;
alter table public.cortex_mirror_registry force row level security;
alter table public.cortex_node_type_access enable row level security;
alter table public.cortex_node_type_access force row level security;

-- service_role too: Supabase default privileges grant it full DML on new tables.
revoke all privileges on table
  public.cortex_mirror_registry,
  public.cortex_node_type_access
from public, anon, authenticated, service_role;
-- Read-only for the server role: rows change only by migration.
grant select on table
  public.cortex_mirror_registry,
  public.cortex_node_type_access
to service_role;

-- Same explicit server-only boundary as 20260817110000 (advisor lint 0008).
drop policy if exists deny_direct_client_access on public.cortex_mirror_registry;
create policy deny_direct_client_access on public.cortex_mirror_registry
  for all to anon, authenticated using (false) with check (false);
drop policy if exists deny_direct_client_access on public.cortex_node_type_access;
create policy deny_direct_client_access on public.cortex_node_type_access
  for all to anon, authenticated using (false) with check (false);

-- Existing types. Groups follow spec §5; invoice_line has no mirror and joins
-- finance (stricter than tenant, matching its /invoices app access path).
insert into public.cortex_node_type_access(node_type, read_group)
select t.node_type::public.cortex_node_type, t.read_group
from (values
  ('employee', 'tenant'), ('project', 'tenant'), ('opportunity', 'tenant'),
  ('account', 'tenant'), ('scope_item', 'tenant'), ('bom', 'tenant'),
  ('vendor', 'tenant'), ('purchase_order', 'tenant'), ('milestone', 'tenant'),
  ('cost_line', 'tenant'), ('task', 'tenant'), ('announcement', 'tenant'),
  ('schedule_event', 'tenant'), ('document', 'tenant'),
  ('change_order', 'tenant'), ('audit_event', 'tenant'), ('contact', 'tenant'),
  ('permit', 'tenant'), ('claim', 'tenant'), ('ticket', 'tenant'),
  ('delivery', 'tenant'), ('rfq', 'tenant'), ('contract', 'tenant'),
  ('certificate', 'tenant'), ('punchlist', 'tenant'), ('inspection', 'tenant'),
  ('design', 'tenant'), ('change_request', 'tenant'), ('material', 'tenant'),
  ('weekly_report', 'tenant'),
  ('invoice', 'finance'), ('invoice_line', 'finance'),
  ('supplier_bill', 'finance'), ('cash_account', 'finance'),
  ('cash_transaction', 'finance'), ('bank_statement', 'finance'),
  ('fiscal_period', 'finance'), ('ledger_account', 'finance'),
  ('journal_entry', 'finance'), ('journal_line', 'finance'),
  ('warehouse', 'inventory'), ('stock_receipt', 'inventory'),
  ('stock_ledger_entry', 'inventory'), ('stock_movement', 'inventory'),
  ('cost_code', 'budget'), ('project_budget', 'budget'),
  ('bom_line', 'estimating'),
  ('po_line', 'procurement')
) as t(node_type, read_group)
on conflict (node_type) do nothing;

commit;
