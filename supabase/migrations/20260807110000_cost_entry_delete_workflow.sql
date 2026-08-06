-- Closed-by-default, tenant-scoped cost-entry void workflow.
-- Physical deletion is unsafe because create-idempotency rows retain a
-- tenant-safe FK. A void preserves audit and supports operator restoration.

alter table public.cost_entries
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text;

create unique index if not exists ux_cost_entries_tenant_id_id
  on public.cost_entries (tenant_id, id);
create index if not exists idx_cost_entries_active_project
  on public.cost_entries (tenant_id, project_id, voided_at);

alter table public.cost_entries
  drop constraint if exists cost_entries_voided_by_tenant_fk,
  drop constraint if exists cost_entries_void_state;

alter table public.cost_entries
  add constraint cost_entries_voided_by_tenant_fk
    foreign key (tenant_id, voided_by)
    references public.users (tenant_id, id)
    on delete restrict not valid,
  add constraint cost_entries_void_state
    check (
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
    ) not valid;

alter table public.cost_entries
  validate constraint cost_entries_voided_by_tenant_fk;
alter table public.cost_entries
  validate constraint cost_entries_void_state;

do $$
begin
  create type public.cost_entry_delete_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.cost_entry_delete_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  cost_entry_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.cost_entry_delete_request_state not null default 'processing',
  result jsonb,
  snapshot jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cost_entry_delete_requests_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint cost_entry_delete_requests_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cost_entry_delete_requests_result_object check (
    result is null or jsonb_typeof(result) = 'object'
  ),
  constraint cost_entry_delete_requests_snapshot_object check (
    snapshot is null or jsonb_typeof(snapshot) = 'object'
  ),
  constraint cost_entry_delete_requests_state_payload check (
    (
      state = 'processing'
      and result is null
      and snapshot is null
      and completed_at is null
    )
    or (
      state = 'succeeded'
      and result is not null
      and snapshot is not null
      and completed_at is not null
    )
  ),
  constraint cost_entry_delete_requests_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index if not exists ux_cost_entry_delete_requests_tenant_id_id
  on public.cost_entry_delete_requests (tenant_id, id);
create unique index if not exists ux_cost_entry_delete_requests_tenant_key
  on public.cost_entry_delete_requests (tenant_id, idempotency_key);
create index if not exists idx_cost_entry_delete_requests_tenant_state
  on public.cost_entry_delete_requests (tenant_id, state, created_at);

alter table public.cost_entry_delete_requests
  drop constraint if exists cost_entry_delete_requests_cost_entry_tenant_fk,
  drop constraint if exists cost_entry_delete_requests_project_tenant_fk,
  drop constraint if exists cost_entry_delete_requests_created_by_tenant_fk;

alter table public.cost_entry_delete_requests
  add constraint cost_entry_delete_requests_cost_entry_tenant_fk
    foreign key (tenant_id, cost_entry_id)
    references public.cost_entries (tenant_id, id)
    on delete restrict not valid,
  add constraint cost_entry_delete_requests_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict not valid,
  add constraint cost_entry_delete_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.cost_entry_delete_requests
  validate constraint cost_entry_delete_requests_cost_entry_tenant_fk;
alter table public.cost_entry_delete_requests
  validate constraint cost_entry_delete_requests_project_tenant_fk;
alter table public.cost_entry_delete_requests
  validate constraint cost_entry_delete_requests_created_by_tenant_fk;

alter table public.cost_entry_delete_requests enable row level security;
alter table public.cost_entry_delete_requests force row level security;
revoke all privileges on table public.cost_entry_delete_requests
  from public, anon, authenticated;
grant all privileges on table public.cost_entry_delete_requests to service_role;

-- Official writes stay service-owned; authenticated users retain read-only cost
-- access until a reviewed Core canary is approved.
revoke insert, update, delete on table public.cost_entries
  from authenticated;
