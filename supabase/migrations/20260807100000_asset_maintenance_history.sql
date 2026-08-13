-- M3.131: append-only tenant-scoped asset service history.
-- This migration adds operational evidence only. Accounting lifecycle and
-- automatic work-order scheduling remain separate future capabilities.

do $$
begin
  create type public.asset_maintenance_type as enum (
    'preventive',
    'inspection',
    'repair',
    'calibration',
    'other'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.asset_maintenance_create_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.asset_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid not null,
  maintenance_type public.asset_maintenance_type not null,
  summary varchar(200) not null,
  performed_on date not null,
  next_due_on date,
  vendor_name varchar(160),
  cost_cents bigint not null default 0,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint asset_maintenance_records_summary_nonempty check (
    summary = btrim(summary) and length(summary) between 1 and 200
  ),
  constraint asset_maintenance_records_vendor_name_trimmed check (
    vendor_name is null or (
      vendor_name = btrim(vendor_name) and length(vendor_name) between 1 and 160
    )
  ),
  constraint asset_maintenance_records_cost_nonnegative check (cost_cents >= 0),
  constraint asset_maintenance_records_due_date_order check (
    next_due_on is null or next_due_on >= performed_on
  )
);

create unique index if not exists ux_asset_maintenance_records_tenant_id_id
  on public.asset_maintenance_records (tenant_id, id);
create index if not exists idx_asset_maintenance_records_asset_date
  on public.asset_maintenance_records (tenant_id, asset_id, performed_on);
create index if not exists idx_asset_maintenance_records_due_date
  on public.asset_maintenance_records (tenant_id, next_due_on);

alter table public.asset_maintenance_records
  drop constraint if exists asset_maintenance_records_asset_tenant_fk,
  drop constraint if exists asset_maintenance_records_created_by_tenant_fk;

alter table public.asset_maintenance_records
  add constraint asset_maintenance_records_asset_tenant_fk
    foreign key (tenant_id, asset_id)
    references public.assets (tenant_id, id)
    on delete restrict not valid,
  add constraint asset_maintenance_records_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.asset_maintenance_records
  validate constraint asset_maintenance_records_asset_tenant_fk,
  validate constraint asset_maintenance_records_created_by_tenant_fk;

drop trigger if exists audit_asset_maintenance_records
  on public.asset_maintenance_records;
create trigger audit_asset_maintenance_records
after insert on public.asset_maintenance_records
for each row execute function public.audit_log_trigger();

alter table public.asset_maintenance_records enable row level security;
alter table public.asset_maintenance_records force row level security;
revoke all privileges on table public.asset_maintenance_records
  from public, anon, authenticated;
grant all privileges on table public.asset_maintenance_records to service_role;

create table if not exists public.asset_maintenance_create_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.asset_maintenance_create_request_state not null default 'processing',
  maintenance_record_id uuid,
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint asset_maintenance_create_requests_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint asset_maintenance_create_requests_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint asset_maintenance_create_requests_result_object check (
    result is null or jsonb_typeof(result) = 'object'
  ),
  constraint asset_maintenance_create_requests_state_payload check (
    (
      state = 'processing'
      and maintenance_record_id is null
      and result is null
      and completed_at is null
    )
    or (
      state = 'succeeded'
      and maintenance_record_id is not null
      and result is not null
      and completed_at is not null
    )
  ),
  constraint asset_maintenance_create_requests_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index if not exists ux_asset_maintenance_create_requests_tenant_id_id
  on public.asset_maintenance_create_requests (tenant_id, id);
create unique index if not exists ux_asset_maintenance_create_requests_tenant_key
  on public.asset_maintenance_create_requests (tenant_id, idempotency_key);
create index if not exists idx_asset_maintenance_create_requests_tenant_state
  on public.asset_maintenance_create_requests (tenant_id, state, created_at);

alter table public.asset_maintenance_create_requests
  drop constraint if exists asset_maintenance_create_requests_record_tenant_fk,
  drop constraint if exists asset_maintenance_create_requests_created_by_tenant_fk;

alter table public.asset_maintenance_create_requests
  add constraint asset_maintenance_create_requests_record_tenant_fk
    foreign key (tenant_id, maintenance_record_id)
    references public.asset_maintenance_records (tenant_id, id)
    on delete restrict not valid,
  add constraint asset_maintenance_create_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.asset_maintenance_create_requests
  validate constraint asset_maintenance_create_requests_record_tenant_fk,
  validate constraint asset_maintenance_create_requests_created_by_tenant_fk;

alter table public.asset_maintenance_create_requests enable row level security;
alter table public.asset_maintenance_create_requests force row level security;
revoke all privileges on table public.asset_maintenance_create_requests
  from public, anon, authenticated;
grant all privileges on table public.asset_maintenance_create_requests to service_role;
