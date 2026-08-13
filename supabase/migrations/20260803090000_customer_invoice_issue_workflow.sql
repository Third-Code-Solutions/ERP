-- Durable tenant-scoped idempotency for customer invoice issuance.
-- The existing PostgreSQL function remains receivables and journal authority.

do $$
begin
  create type public.customer_invoice_issue_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.customer_invoice_issue_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  invoice_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.customer_invoice_issue_request_state not null
    default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint customer_invoice_issue_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint customer_invoice_issue_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_invoice_issue_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint customer_invoice_issue_requests_state_payload
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
  constraint customer_invoice_issue_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_customer_invoice_issue_requests_tenant_id_id
  on public.customer_invoice_issue_requests (tenant_id, id);

create unique index if not exists
  ux_customer_invoice_issue_requests_tenant_key
  on public.customer_invoice_issue_requests (tenant_id, idempotency_key);

create index if not exists
  idx_customer_invoice_issue_requests_tenant_state
  on public.customer_invoice_issue_requests (tenant_id, state, created_at);

alter table public.customer_invoice_issue_requests
  drop constraint if exists customer_invoice_issue_requests_invoice_tenant_fk,
  drop constraint if exists customer_invoice_issue_requests_created_by_tenant_fk;

alter table public.customer_invoice_issue_requests
  add constraint customer_invoice_issue_requests_invoice_tenant_fk
    foreign key (tenant_id, invoice_id)
    references public.invoices (tenant_id, id)
    on delete restrict not valid,
  add constraint customer_invoice_issue_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.customer_invoice_issue_requests
  validate constraint customer_invoice_issue_requests_invoice_tenant_fk,
  validate constraint customer_invoice_issue_requests_created_by_tenant_fk;

alter table public.customer_invoice_issue_requests enable row level security;
alter table public.customer_invoice_issue_requests force row level security;
revoke all privileges on table public.customer_invoice_issue_requests
  from public, anon, authenticated;
grant all privileges on table public.customer_invoice_issue_requests
  to service_role;
