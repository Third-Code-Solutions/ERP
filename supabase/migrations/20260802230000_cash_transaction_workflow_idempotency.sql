-- Durable tenant-scoped idempotency for cash posting and reversal.
-- Existing PostgreSQL functions remain accounting and journal authorities.

do $$
begin
  create type public.cash_transaction_workflow_action as enum (
    'post',
    'reverse'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.cash_transaction_workflow_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.cash_transaction_workflow_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  cash_transaction_id uuid not null,
  action public.cash_transaction_workflow_action not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.cash_transaction_workflow_request_state not null
    default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cash_transaction_workflow_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint cash_transaction_workflow_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint cash_transaction_workflow_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint cash_transaction_workflow_requests_state_payload
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
  constraint cash_transaction_workflow_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_cash_transaction_workflow_requests_tenant_id_id
  on public.cash_transaction_workflow_requests (tenant_id, id);

create unique index if not exists
  ux_cash_transaction_workflow_requests_tenant_key
  on public.cash_transaction_workflow_requests (tenant_id, idempotency_key);

create index if not exists
  idx_cash_transaction_workflow_requests_tenant_state
  on public.cash_transaction_workflow_requests (tenant_id, state, created_at);

alter table public.cash_transaction_workflow_requests
  drop constraint if exists cash_transaction_workflow_requests_transaction_tenant_fk,
  drop constraint if exists cash_transaction_workflow_requests_created_by_tenant_fk;

alter table public.cash_transaction_workflow_requests
  add constraint cash_transaction_workflow_requests_transaction_tenant_fk
    foreign key (tenant_id, cash_transaction_id)
    references public.cash_transactions (tenant_id, id)
    on delete restrict not valid,
  add constraint cash_transaction_workflow_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.cash_transaction_workflow_requests
  validate constraint cash_transaction_workflow_requests_transaction_tenant_fk,
  validate constraint cash_transaction_workflow_requests_created_by_tenant_fk;

alter table public.cash_transaction_workflow_requests enable row level security;
alter table public.cash_transaction_workflow_requests force row level security;
revoke all privileges on table public.cash_transaction_workflow_requests
  from public, anon, authenticated;
grant all privileges on table public.cash_transaction_workflow_requests
  to service_role;
