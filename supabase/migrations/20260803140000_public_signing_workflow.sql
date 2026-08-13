-- Durable replay ledger for token-authorized public canvas signatures.
-- The signing token remains the only external authority; this table is
-- service-role-only and never grants browser database access.

do $$
begin
  create type public.public_signing_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.public_signing_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  signature_session_id uuid not null
    references public.signature_sessions(id) on delete cascade,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.public_signing_request_state not null default 'processing',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint public_signing_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint public_signing_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint public_signing_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint public_signing_requests_state_payload
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
  constraint public_signing_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_public_signing_requests_tenant_id_id
  on public.public_signing_requests (tenant_id, id);

create unique index if not exists
  ux_public_signing_requests_tenant_key
  on public.public_signing_requests (tenant_id, idempotency_key);

create index if not exists
  idx_public_signing_requests_tenant_session
  on public.public_signing_requests (tenant_id, signature_session_id);

create index if not exists
  idx_public_signing_requests_tenant_state
  on public.public_signing_requests (tenant_id, state, created_at);

alter table public.public_signing_requests enable row level security;
alter table public.public_signing_requests force row level security;
revoke all privileges on table public.public_signing_requests
  from public, anon, authenticated;
grant all privileges on table public.public_signing_requests to service_role;
