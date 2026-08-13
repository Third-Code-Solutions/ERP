-- Durable, tenant-scoped idempotency and number uniqueness for the original
-- NestJS standalone Purchase Order command. Browser roles never write this
-- server-only evidence table.

do $$
begin
  create type public.purchase_order_create_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  if exists (
    select 1
      from public.purchase_orders
     group by tenant_id, po_number
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce tenant Purchase Order number uniqueness while duplicates exist';
  end if;
end
$$;

create unique index if not exists ux_purchase_orders_tenant_po_number
  on public.purchase_orders (tenant_id, po_number);

create table if not exists public.purchase_order_create_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.purchase_order_create_request_state not null
    default 'processing',
  purchase_order_id uuid,
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint purchase_order_create_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint purchase_order_create_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_order_create_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint purchase_order_create_requests_state_payload
    check (
      (
        state = 'processing'
        and purchase_order_id is null
        and result is null
        and completed_at is null
      )
      or (
        state = 'succeeded'
        and purchase_order_id is not null
        and result is not null
        and completed_at is not null
      )
    ),
  constraint purchase_order_create_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_purchase_order_create_requests_tenant_id_id
  on public.purchase_order_create_requests (tenant_id, id);

create unique index if not exists
  ux_purchase_order_create_requests_tenant_key
  on public.purchase_order_create_requests (tenant_id, idempotency_key);

create index if not exists
  idx_purchase_order_create_requests_tenant_state
  on public.purchase_order_create_requests (tenant_id, state, created_at);

alter table public.purchase_order_create_requests
  drop constraint if exists
    purchase_order_create_requests_purchase_order_tenant_fk,
  drop constraint if exists
    purchase_order_create_requests_created_by_tenant_fk;

alter table public.purchase_order_create_requests
  add constraint purchase_order_create_requests_purchase_order_tenant_fk
    foreign key (tenant_id, purchase_order_id)
    references public.purchase_orders (tenant_id, id)
    on delete restrict
    not valid,
  add constraint purchase_order_create_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.purchase_order_create_requests
  validate constraint purchase_order_create_requests_purchase_order_tenant_fk,
  validate constraint purchase_order_create_requests_created_by_tenant_fk;

alter table public.purchase_order_create_requests enable row level security;

revoke all privileges on table public.purchase_order_create_requests
  from public, anon, authenticated;

grant all privileges on table public.purchase_order_create_requests
  to service_role;
