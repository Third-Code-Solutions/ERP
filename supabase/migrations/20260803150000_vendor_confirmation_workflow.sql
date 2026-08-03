-- Supplier response authority for an issued Purchase Order.
-- The token is hashed, single-purpose, tenant-scoped, and closed by default
-- in NestJS. This migration is source-only until the ordered hosted suffix is
-- reconciled and the disposable replay/rollback gates are approved.

do $$
begin
  create type public.vendor_confirmation_state as enum (
    'pending',
    'accepted',
    'declined',
    'changes_requested'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.vendor_confirmation_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.vendor_confirmation_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null,
  vendor_id uuid not null,
  token_hash varchar(64) not null,
  state public.vendor_confirmation_state not null default 'pending',
  expires_at timestamptz not null,
  responder_name varchar(255),
  responder_email varchar(255),
  response_note varchar(2000),
  responder_ip varchar(45),
  responder_user_agent varchar(1000),
  responded_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint vendor_confirmation_sessions_token_hash_hex
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint vendor_confirmation_sessions_state_response
    check (
      (
        state = 'pending'
        and responded_at is null
        and responder_name is null
        and response_note is null
      )
      or (
        state in ('accepted', 'declined', 'changes_requested')
        and responded_at is not null
        and responder_name is not null
        and length(btrim(responder_name)) > 0
      )
    ),
  constraint vendor_confirmation_sessions_decision_note
    check (
      state in ('pending', 'accepted')
      or (
        state in ('declined', 'changes_requested')
        and response_note is not null
        and length(btrim(response_note)) > 0
      )
    ),
  constraint vendor_confirmation_sessions_responder_email
    check (
      responder_email is null
      or (
        responder_email = btrim(responder_email)
        and length(responder_email) between 3 and 255
        and position('@' in responder_email) > 1
      )
    ),
  constraint vendor_confirmation_sessions_expiry_after_created
    check (expires_at > created_at)
);

create unique index if not exists
  ux_vendor_confirmation_sessions_tenant_id_id
  on public.vendor_confirmation_sessions (tenant_id, id);

create unique index if not exists
  ux_vendor_confirmation_sessions_token_hash
  on public.vendor_confirmation_sessions (token_hash);

create index if not exists
  idx_vendor_confirmation_sessions_tenant_po
  on public.vendor_confirmation_sessions (tenant_id, purchase_order_id);

create index if not exists
  idx_vendor_confirmation_sessions_tenant_state
  on public.vendor_confirmation_sessions (tenant_id, state, expires_at);

alter table public.vendor_confirmation_sessions
  drop constraint if exists vendor_confirmation_sessions_purchase_order_tenant_fk,
  drop constraint if exists vendor_confirmation_sessions_vendor_tenant_fk,
  drop constraint if exists vendor_confirmation_sessions_created_by_tenant_fk;

alter table public.vendor_confirmation_sessions
  add constraint vendor_confirmation_sessions_purchase_order_tenant_fk
    foreign key (tenant_id, purchase_order_id)
    references public.purchase_orders (tenant_id, id)
    on delete cascade
    not valid,
  add constraint vendor_confirmation_sessions_vendor_tenant_fk
    foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id)
    on delete restrict
    not valid,
  add constraint vendor_confirmation_sessions_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict
    not valid;

alter table public.vendor_confirmation_sessions
  validate constraint vendor_confirmation_sessions_purchase_order_tenant_fk,
  validate constraint vendor_confirmation_sessions_vendor_tenant_fk,
  validate constraint vendor_confirmation_sessions_created_by_tenant_fk;

create table if not exists public.vendor_confirmation_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  vendor_confirmation_session_id uuid not null,
  purchase_order_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.vendor_confirmation_request_state not null default 'processing',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint vendor_confirmation_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint vendor_confirmation_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint vendor_confirmation_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint vendor_confirmation_requests_state_payload
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
  constraint vendor_confirmation_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_vendor_confirmation_requests_tenant_id_id
  on public.vendor_confirmation_requests (tenant_id, id);

create unique index if not exists
  ux_vendor_confirmation_requests_tenant_key
  on public.vendor_confirmation_requests (tenant_id, idempotency_key);

create index if not exists
  idx_vendor_confirmation_requests_tenant_session
  on public.vendor_confirmation_requests (
    tenant_id,
    vendor_confirmation_session_id
  );

create index if not exists
  idx_vendor_confirmation_requests_tenant_state
  on public.vendor_confirmation_requests (tenant_id, state, created_at);

alter table public.vendor_confirmation_requests
  drop constraint if exists vendor_confirmation_requests_session_tenant_fk,
  drop constraint if exists vendor_confirmation_requests_purchase_order_tenant_fk;

alter table public.vendor_confirmation_requests
  add constraint vendor_confirmation_requests_session_tenant_fk
    foreign key (tenant_id, vendor_confirmation_session_id)
    references public.vendor_confirmation_sessions (tenant_id, id)
    on delete cascade
    not valid,
  add constraint vendor_confirmation_requests_purchase_order_tenant_fk
    foreign key (tenant_id, purchase_order_id)
    references public.purchase_orders (tenant_id, id)
    on delete cascade
    not valid;

alter table public.vendor_confirmation_requests
  validate constraint vendor_confirmation_requests_session_tenant_fk,
  validate constraint vendor_confirmation_requests_purchase_order_tenant_fk;

alter table public.vendor_confirmation_sessions enable row level security;
alter table public.vendor_confirmation_sessions force row level security;
revoke all privileges on table public.vendor_confirmation_sessions
  from public, anon, authenticated;
grant all privileges on table public.vendor_confirmation_sessions to service_role;

alter table public.vendor_confirmation_requests enable row level security;
alter table public.vendor_confirmation_requests force row level security;
revoke all privileges on table public.vendor_confirmation_requests
  from public, anon, authenticated;
grant all privileges on table public.vendor_confirmation_requests to service_role;
