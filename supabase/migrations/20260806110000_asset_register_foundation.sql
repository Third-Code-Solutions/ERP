-- M3.90: tenant-scoped operational asset register.
-- This is deliberately not an accounting fixed-asset or maintenance workflow.
-- Keep NestJS authority closed until hosted reconciliation, replay, and a
-- tenant-scoped canary are approved.

do $$
begin
  create type public.asset_kind as enum (
    'equipment',
    'vehicle',
    'tool',
    'fixture',
    'other'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.asset_status as enum (
    'active',
    'maintenance',
    'retired'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  asset_tag varchar(64) not null,
  name varchar(160) not null,
  kind public.asset_kind not null default 'equipment',
  status public.asset_status not null default 'active',
  serial_number varchar(120),
  manufacturer varchar(120),
  model varchar(120),
  assigned_project_id uuid,
  location varchar(255),
  commissioned_on date,
  retired_on date,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_asset_tag_nonempty check (
    asset_tag = btrim(asset_tag)
    and length(asset_tag) between 1 and 64
  ),
  constraint assets_name_nonempty check (
    name = btrim(name)
    and length(name) between 1 and 160
  ),
  constraint assets_retired_state check (
    status <> 'retired' or retired_on is not null
  ),
  constraint assets_date_order check (
    retired_on is null
    or commissioned_on is null
    or retired_on >= commissioned_on
  )
);

create unique index if not exists ux_assets_tenant_id_id
  on public.assets (tenant_id, id);
create unique index if not exists ux_assets_tenant_tag
  on public.assets (tenant_id, asset_tag);
create unique index if not exists ux_assets_tenant_serial
  on public.assets (tenant_id, serial_number)
  where serial_number is not null;
create index if not exists idx_assets_tenant_status
  on public.assets (tenant_id, status);
create index if not exists idx_assets_tenant_project
  on public.assets (tenant_id, assigned_project_id);

alter table public.assets
  drop constraint if exists assets_assigned_project_tenant_fk,
  drop constraint if exists assets_created_by_tenant_fk;

alter table public.assets
  add constraint assets_assigned_project_tenant_fk
    foreign key (tenant_id, assigned_project_id)
    references public.projects (tenant_id, id)
    on delete restrict not valid,
  add constraint assets_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.assets
  validate constraint assets_assigned_project_tenant_fk,
  validate constraint assets_created_by_tenant_fk;

drop trigger if exists audit_assets on public.assets;
create trigger audit_assets
after insert or update or delete on public.assets
for each row execute function public.audit_log_trigger();

alter table public.assets enable row level security;
alter table public.assets force row level security;
revoke all privileges on table public.assets
  from public, anon, authenticated;
grant all privileges on table public.assets to service_role;
