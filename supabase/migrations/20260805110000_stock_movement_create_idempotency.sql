-- Durable, tenant-scoped idempotency for the disabled NestJS Stock Movement
-- draft-creation command. Posting and reversal remain database workflows.

do $$
begin
  create type public.stock_movement_create_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.stock_movement_create_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.stock_movement_create_request_state not null
    default 'processing',
  stock_movement_id uuid,
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint stock_movement_create_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint stock_movement_create_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint stock_movement_create_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint stock_movement_create_requests_state_payload
    check (
      (
        state = 'processing'
        and stock_movement_id is null
        and result is null
        and completed_at is null
      )
      or (
        state = 'succeeded'
        and stock_movement_id is not null
        and result is not null
        and completed_at is not null
      )
    ),
  constraint stock_movement_create_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_stock_movement_create_requests_tenant_id_id
  on public.stock_movement_create_requests (tenant_id, id);

create unique index if not exists
  ux_stock_movement_create_requests_tenant_key
  on public.stock_movement_create_requests (tenant_id, idempotency_key);

create index if not exists
  idx_stock_movement_create_requests_tenant_state
  on public.stock_movement_create_requests (tenant_id, state, created_at);

alter table public.stock_movement_create_requests
  drop constraint if exists
    stock_movement_create_requests_stock_movement_tenant_fk,
  drop constraint if exists
    stock_movement_create_requests_created_by_tenant_fk;

alter table public.stock_movement_create_requests
  add constraint stock_movement_create_requests_stock_movement_tenant_fk
    foreign key (tenant_id, stock_movement_id)
    references public.stock_movements (tenant_id, id)
    on delete restrict
    not valid,
  add constraint stock_movement_create_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.stock_movement_create_requests
  validate constraint stock_movement_create_requests_stock_movement_tenant_fk,
  validate constraint stock_movement_create_requests_created_by_tenant_fk;

alter table public.stock_movement_create_requests enable row level security;
alter table public.stock_movement_create_requests force row level security;

revoke all privileges on table public.stock_movement_create_requests
  from public, anon, authenticated;

grant all privileges on table public.stock_movement_create_requests
  to service_role;
