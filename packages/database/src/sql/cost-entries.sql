-- =============================================================================
-- Phase 3 / F3.2 — Cost Tracking. Additive. Apply after the base schema + RLS.
-- cost_entries: actual cost incurred per project (the third execution leg:
-- BOM budget → POs committed → cost_entries actual). No billing.
-- =============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname='cost_category') then
    create type cost_category as enum ('material','labour','subcontractor','equipment','overhead','other');
  end if;
  if not exists (select 1 from pg_type where typname='cost_source') then
    create type cost_source as enum ('manual','po_derived','import');
  end if;
end $$;

create table if not exists cost_entries (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  bom_line_item_id uuid,
  po_line_item_id  uuid,
  created_by       uuid references users(id) on delete set null,
  voided_at       timestamptz,
  voided_by       uuid,
  void_reason     text,
  cost_category    cost_category not null,
  cost_source      cost_source not null default 'manual',
  description      text not null,
  amount_cents     bigint not null default 0,
  quantity         integer not null default 1,
  unit             varchar(20),
  incurred_at      timestamptz not null default now(),
  reference_number varchar(100),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint cost_entries_void_state check (
    (
      voided_at is null
      and voided_by is null
      and void_reason is null
    )
    or (
      voided_at is not null
      and voided_by is not null
      and void_reason is not null
      and length(btrim(void_reason)) between 1 and 500
    )
  ),
  constraint cost_entries_voided_by_tenant_fk
    foreign key (tenant_id, voided_by) references users(tenant_id, id)
    on delete restrict
);
create index if not exists idx_cost_entries_tenant_id on cost_entries(tenant_id);
create index if not exists idx_cost_entries_project_id on cost_entries(project_id);
create index if not exists idx_cost_entries_tenant_category on cost_entries(tenant_id, cost_category);
create index if not exists idx_cost_entries_incurred on cost_entries(tenant_id, incurred_at);
create index if not exists idx_cost_entries_active_project
  on cost_entries(tenant_id, project_id, voided_at);

-- RLS (tenant isolation; direct tenant_id check like purchase_orders).
alter table cost_entries enable row level security;
drop policy if exists cost_entries_tenant_read   on cost_entries;
drop policy if exists cost_entries_tenant_insert on cost_entries;
drop policy if exists cost_entries_tenant_update on cost_entries;
drop policy if exists cost_entries_tenant_delete on cost_entries;
create policy cost_entries_tenant_read   on cost_entries for select using (tenant_id = auth_tenant_id());
create policy cost_entries_tenant_insert on cost_entries for insert with check (tenant_id = auth_tenant_id());
create policy cost_entries_tenant_update on cost_entries for update using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());
create policy cost_entries_tenant_delete on cost_entries for delete using (tenant_id = auth_tenant_id());

-- Append-only audit (hash chain).
drop trigger if exists audit_cost_entries on cost_entries;
create trigger audit_cost_entries
  after insert or update or delete on cost_entries
  for each row execute function audit_log_trigger();

-- Cortex graph mirror (node_type cost_line — already in cortex_node_type enum).
drop trigger if exists cortex_mirror_g on cost_entries;
create trigger cortex_mirror_g
  after insert or update or delete on cost_entries
  for each row execute function cortex_mirror_generic('cost_line','description','cost_category');
