-- Durable tenant-scoped idempotency for Supplier Bill posting.
-- The existing PostgreSQL function remains payable and journal authority.

do $$
begin
  create type public.supplier_bill_post_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.supplier_bill_post_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  supplier_bill_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.supplier_bill_post_request_state not null
    default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint supplier_bill_post_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint supplier_bill_post_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint supplier_bill_post_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint supplier_bill_post_requests_state_payload
    check (
      (
        state = 'processing'
        and result is null
        and completed_at is null
      )
      or (
        state = 'succeeded'
        and result is not null
        and completed_at is not null
      )
    ),
  constraint supplier_bill_post_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_supplier_bill_post_requests_tenant_id_id
  on public.supplier_bill_post_requests (tenant_id, id);

create unique index if not exists
  ux_supplier_bill_post_requests_tenant_key
  on public.supplier_bill_post_requests (tenant_id, idempotency_key);

create index if not exists
  idx_supplier_bill_post_requests_tenant_state
  on public.supplier_bill_post_requests (tenant_id, state, created_at);

alter table public.supplier_bill_post_requests
  drop constraint if exists supplier_bill_post_requests_bill_tenant_fk,
  drop constraint if exists supplier_bill_post_requests_created_by_tenant_fk;

alter table public.supplier_bill_post_requests
  add constraint supplier_bill_post_requests_bill_tenant_fk
    foreign key (tenant_id, supplier_bill_id)
    references public.supplier_bills (tenant_id, id)
    on delete restrict not valid,
  add constraint supplier_bill_post_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.supplier_bill_post_requests
  validate constraint supplier_bill_post_requests_bill_tenant_fk,
  validate constraint supplier_bill_post_requests_created_by_tenant_fk;

alter table public.supplier_bill_post_requests enable row level security;
alter table public.supplier_bill_post_requests force row level security;
revoke all privileges on table public.supplier_bill_post_requests
  from public, anon, authenticated;
grant all privileges on table public.supplier_bill_post_requests
  to service_role;
