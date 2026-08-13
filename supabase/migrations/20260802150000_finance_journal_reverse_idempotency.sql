-- Durable tenant-scoped idempotency for the disabled Nest journal-reversal
-- authority. The existing PostgreSQL function remains the ledger authority.

do $$
begin
  create type public.journal_reverse_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.journal_reverse_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  journal_entry_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.journal_reverse_request_state not null default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint journal_reverse_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint journal_reverse_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint journal_reverse_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint journal_reverse_requests_state_payload
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
  constraint journal_reverse_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_journal_reverse_requests_tenant_id_id
  on public.journal_reverse_requests (tenant_id, id);

create unique index if not exists
  ux_journal_reverse_requests_tenant_key
  on public.journal_reverse_requests (tenant_id, idempotency_key);

create index if not exists
  idx_journal_reverse_requests_tenant_state
  on public.journal_reverse_requests (tenant_id, state, created_at);

alter table public.journal_reverse_requests
  drop constraint if exists journal_reverse_requests_journal_entry_tenant_fk,
  drop constraint if exists journal_reverse_requests_created_by_tenant_fk;

alter table public.journal_reverse_requests
  add constraint journal_reverse_requests_journal_entry_tenant_fk
    foreign key (tenant_id, journal_entry_id)
    references public.journal_entries (tenant_id, id)
    on delete restrict not valid,
  add constraint journal_reverse_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.journal_reverse_requests
  validate constraint journal_reverse_requests_journal_entry_tenant_fk,
  validate constraint journal_reverse_requests_created_by_tenant_fk;

alter table public.journal_reverse_requests enable row level security;
alter table public.journal_reverse_requests force row level security;
revoke all privileges on table public.journal_reverse_requests
  from public, anon, authenticated;
grant all privileges on table public.journal_reverse_requests to service_role;
