-- Durable, tenant-scoped idempotency for the disabled PO approval authority.
-- No notification or supplier side effect is performed by this migration slice.

do $$
begin
  create type public.purchase_order_workflow_action as enum (
    'submit_pm_approval',
    'pm_approve',
    'commercial_approve',
    'reject'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.purchase_order_workflow_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.purchase_order_workflow_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null,
  action public.purchase_order_workflow_action not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.purchase_order_workflow_request_state not null
    default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint purchase_order_workflow_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint purchase_order_workflow_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint purchase_order_workflow_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint purchase_order_workflow_requests_state_payload
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
  constraint purchase_order_workflow_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_purchase_order_workflow_requests_tenant_id_id
  on public.purchase_order_workflow_requests (tenant_id, id);

create unique index if not exists
  ux_purchase_order_workflow_requests_tenant_key
  on public.purchase_order_workflow_requests (tenant_id, idempotency_key);

create index if not exists
  idx_purchase_order_workflow_requests_tenant_state
  on public.purchase_order_workflow_requests (tenant_id, state, created_at);

alter table public.purchase_order_workflow_requests
  drop constraint if exists
    purchase_order_workflow_requests_purchase_order_tenant_fk,
  drop constraint if exists
    purchase_order_workflow_requests_created_by_tenant_fk;

alter table public.purchase_order_workflow_requests
  add constraint purchase_order_workflow_requests_purchase_order_tenant_fk
    foreign key (tenant_id, purchase_order_id)
    references public.purchase_orders (tenant_id, id)
    on delete restrict
    not valid,
  add constraint purchase_order_workflow_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.purchase_order_workflow_requests
  validate constraint purchase_order_workflow_requests_purchase_order_tenant_fk,
  validate constraint purchase_order_workflow_requests_created_by_tenant_fk;

alter table public.purchase_order_workflow_requests enable row level security;

revoke all privileges on table public.purchase_order_workflow_requests
  from public, anon, authenticated;

grant all privileges on table public.purchase_order_workflow_requests
  to service_role;
