-- Closed-by-default, tenant-scoped cost-entry restore workflow.
-- Restore is a new idempotent command; it never reopens a physical delete.

do $$
begin
  create type public.cost_entry_restore_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.cost_entry_restore_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  cost_entry_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.cost_entry_restore_request_state not null default 'processing',
  result jsonb,
  snapshot jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cost_entry_restore_requests_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint cost_entry_restore_requests_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cost_entry_restore_requests_result_object check (
    result is null or jsonb_typeof(result) = 'object'
  ),
  constraint cost_entry_restore_requests_snapshot_object check (
    snapshot is null or jsonb_typeof(snapshot) = 'object'
  ),
  constraint cost_entry_restore_requests_state_payload check (
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
  constraint cost_entry_restore_requests_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index if not exists ux_cost_entry_restore_requests_tenant_id_id
  on public.cost_entry_restore_requests (tenant_id, id);
create unique index if not exists ux_cost_entry_restore_requests_tenant_key
  on public.cost_entry_restore_requests (tenant_id, idempotency_key);
create index if not exists idx_cost_entry_restore_requests_tenant_state
  on public.cost_entry_restore_requests (tenant_id, state, created_at);

alter table public.cost_entry_restore_requests
  drop constraint if exists cost_entry_restore_requests_cost_entry_tenant_fk,
  drop constraint if exists cost_entry_restore_requests_project_tenant_fk,
  drop constraint if exists cost_entry_restore_requests_created_by_tenant_fk;

alter table public.cost_entry_restore_requests
  add constraint cost_entry_restore_requests_cost_entry_tenant_fk
    foreign key (tenant_id, cost_entry_id)
    references public.cost_entries (tenant_id, id)
    on delete restrict not valid,
  add constraint cost_entry_restore_requests_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict not valid,
  add constraint cost_entry_restore_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.cost_entry_restore_requests
  validate constraint cost_entry_restore_requests_cost_entry_tenant_fk;
alter table public.cost_entry_restore_requests
  validate constraint cost_entry_restore_requests_project_tenant_fk;
alter table public.cost_entry_restore_requests
  validate constraint cost_entry_restore_requests_created_by_tenant_fk;

alter table public.cost_entry_restore_requests enable row level security;
alter table public.cost_entry_restore_requests force row level security;
revoke all privileges on table public.cost_entry_restore_requests
  from public, anon, authenticated;
grant all privileges on table public.cost_entry_restore_requests to service_role;
