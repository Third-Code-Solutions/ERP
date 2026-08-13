-- Tenant-scoped idempotency and server-only authority for Client Change Requests.
-- The application flag remains closed until hosted reconciliation and a canary.

do $$
begin
  create type public.change_request_create_request_state as enum ('processing', 'succeeded');
exception
  when duplicate_object then null;
end
$$;

create unique index if not exists
  ux_change_requests_tenant_id_id
  on public.change_requests (tenant_id, id);

create table if not exists public.change_request_create_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.change_request_create_request_state not null default 'processing',
  change_request_id uuid,
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint change_request_create_requests_key_nonempty
    check (idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256),
  constraint change_request_create_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint change_request_create_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint change_request_create_requests_state_payload
    check (
      (state = 'processing' and change_request_id is null and result is null and completed_at is null)
      or
      (state = 'succeeded' and change_request_id is not null and result is not null and completed_at is not null)
    ),
  constraint change_request_create_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_change_request_create_requests_tenant_id_id
  on public.change_request_create_requests (tenant_id, id);
create unique index if not exists
  ux_change_request_create_requests_tenant_key
  on public.change_request_create_requests (tenant_id, idempotency_key);
create index if not exists
  idx_change_request_create_requests_tenant_state
  on public.change_request_create_requests (tenant_id, state, created_at);

alter table public.change_request_create_requests
  drop constraint if exists change_request_create_requests_change_request_tenant_fk,
  drop constraint if exists change_request_create_requests_created_by_tenant_fk;

alter table public.change_request_create_requests
  add constraint change_request_create_requests_change_request_tenant_fk
    foreign key (tenant_id, change_request_id)
    references public.change_requests (tenant_id, id)
    on delete restrict not valid,
  add constraint change_request_create_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.change_request_create_requests
  validate constraint change_request_create_requests_change_request_tenant_fk,
  validate constraint change_request_create_requests_created_by_tenant_fk;

alter table public.change_request_create_requests enable row level security;
revoke all privileges on table public.change_request_create_requests
  from public, anon, authenticated;
grant all privileges on table public.change_request_create_requests to service_role;
