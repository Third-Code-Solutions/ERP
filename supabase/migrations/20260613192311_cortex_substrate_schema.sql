-- Cortex graph substrate — enums, tables, indexes, RLS. Additive only.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'cortex_node_type') then
    create type cortex_node_type as enum (
      'employee','project','opportunity','account','scope_item','bom','bom_line',
      'vendor','purchase_order','po_line','invoice','invoice_line','milestone',
      'cost_line','task','announcement','schedule_event','document','change_order','audit_event'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_edge_type') then
    create type cortex_edge_type as enum (
      'owns','assigned_to','member_of','part_of','derived_from','bills','supplies',
      'pays','blocks','depends_on','mentions','scheduled_for','approved_by',
      'superseded_by','references_doc'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_edge_origin') then
    create type cortex_edge_origin as enum ('canonical','derived','ai');
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_subject_kind') then
    create type cortex_subject_kind as enum ('node','edge','answer');
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_provenance_origin') then
    create type cortex_provenance_origin as enum ('mutation','document','ai_run','import');
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_freshness') then
    create type cortex_freshness as enum ('fresh','stale','unknown');
  end if;
end $$;

create table if not exists cortex_provenance (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  subject_kind  cortex_subject_kind not null,
  subject_id    uuid,
  origin        cortex_provenance_origin not null,
  origin_ref    text,
  actor_id      uuid references users(id) on delete set null,
  prev_hash     varchar(64) not null default 'genesis',
  hash          varchar(64) not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cortex_provenance_tenant_id on cortex_provenance(tenant_id);
create index if not exists idx_cortex_provenance_subject on cortex_provenance(subject_kind, subject_id);
create index if not exists idx_cortex_provenance_tenant_created on cortex_provenance(tenant_id, id);

create table if not exists cortex_nodes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  node_type        cortex_node_type not null,
  ref_table        varchar(100) not null,
  ref_id           uuid not null,
  title            varchar(500),
  summary          text,
  attributes       jsonb,
  valid_from       timestamptz not null default now(),
  valid_to         timestamptz,
  recorded_at      timestamptz not null default now(),
  last_verified_at timestamptz,
  freshness        cortex_freshness not null default 'fresh',
  embedding        vector(1536),
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_cortex_nodes_tenant_id on cortex_nodes(tenant_id);
create index if not exists idx_cortex_nodes_tenant_type on cortex_nodes(tenant_id, node_type);
create index if not exists idx_cortex_nodes_ref on cortex_nodes(tenant_id, ref_table, ref_id);
create unique index if not exists ux_cortex_nodes_current
  on cortex_nodes(tenant_id, ref_table, ref_id) where valid_to is null;

create table if not exists cortex_edges (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  src_id        uuid not null references cortex_nodes(id) on delete cascade,
  dst_id        uuid not null references cortex_nodes(id) on delete cascade,
  edge_type     cortex_edge_type not null,
  origin        cortex_edge_origin not null default 'canonical',
  weight        real not null default 1,
  confidence    real not null default 1,
  attributes    jsonb,
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz,
  recorded_at   timestamptz not null default now(),
  provenance_id bigint references cortex_provenance(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cortex_edges_tenant_id on cortex_edges(tenant_id);
create index if not exists idx_cortex_edges_src on cortex_edges(src_id, edge_type);
create index if not exists idx_cortex_edges_dst on cortex_edges(dst_id, edge_type);
create unique index if not exists ux_cortex_edges_current
  on cortex_edges(tenant_id, src_id, dst_id, edge_type) where valid_to is null;

alter table cortex_nodes      enable row level security;
alter table cortex_edges      enable row level security;
alter table cortex_provenance enable row level security;

drop policy if exists cortex_nodes_tenant_read   on cortex_nodes;
drop policy if exists cortex_nodes_tenant_insert on cortex_nodes;
drop policy if exists cortex_nodes_tenant_update on cortex_nodes;
create policy cortex_nodes_tenant_read   on cortex_nodes for select using (tenant_id = auth_tenant_id());
create policy cortex_nodes_tenant_insert on cortex_nodes for insert with check (tenant_id = auth_tenant_id());
create policy cortex_nodes_tenant_update on cortex_nodes for update using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());

drop policy if exists cortex_edges_tenant_read   on cortex_edges;
drop policy if exists cortex_edges_tenant_insert on cortex_edges;
drop policy if exists cortex_edges_tenant_update on cortex_edges;
create policy cortex_edges_tenant_read   on cortex_edges for select using (tenant_id = auth_tenant_id());
create policy cortex_edges_tenant_insert on cortex_edges for insert with check (tenant_id = auth_tenant_id());
create policy cortex_edges_tenant_update on cortex_edges for update using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());

drop policy if exists cortex_provenance_tenant_read   on cortex_provenance;
drop policy if exists cortex_provenance_tenant_insert on cortex_provenance;
drop policy if exists cortex_provenance_no_update     on cortex_provenance;
drop policy if exists cortex_provenance_no_delete     on cortex_provenance;
create policy cortex_provenance_tenant_read   on cortex_provenance for select using (tenant_id = auth_tenant_id());
create policy cortex_provenance_tenant_insert on cortex_provenance for insert with check (tenant_id = auth_tenant_id());
create policy cortex_provenance_no_update     on cortex_provenance for update using (false);
create policy cortex_provenance_no_delete     on cortex_provenance for delete using (false);;
