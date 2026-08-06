-- M3.116: server-authoritative Togal BOM line commit.
-- Keep Core flag closed until hosted parity, replay, and tenant canary pass.

begin;

do $$
begin
  create type public.togal_bom_commit_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.togal_bom_commit_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  bom_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.togal_bom_commit_request_state not null default 'processing',
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint togal_bom_commit_requests_key_nonempty
    check (
      idempotency_key = btrim(idempotency_key)
      and length(idempotency_key) between 1 and 256
    ),
  constraint togal_bom_commit_requests_hash_hex
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint togal_bom_commit_requests_result_object
    check (result is null or jsonb_typeof(result) = 'object'),
  constraint togal_bom_commit_requests_state_payload
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
  constraint togal_bom_commit_requests_completed_after_created
    check (completed_at is null or completed_at >= created_at)
);

create unique index if not exists
  ux_togal_bom_commit_requests_tenant_id_id
  on public.togal_bom_commit_requests (tenant_id, id);
create unique index if not exists
  ux_togal_bom_commit_requests_tenant_key
  on public.togal_bom_commit_requests (tenant_id, idempotency_key);
create index if not exists
  idx_togal_bom_commit_requests_tenant_state
  on public.togal_bom_commit_requests (tenant_id, state, created_at);

alter table public.togal_bom_commit_requests
  drop constraint if exists togal_bom_commit_requests_bom_tenant_fk,
  drop constraint if exists togal_bom_commit_requests_created_by_tenant_fk;

alter table public.togal_bom_commit_requests
  add constraint togal_bom_commit_requests_bom_tenant_fk
    foreign key (tenant_id, bom_id)
    references public.boms (tenant_id, id)
    on delete restrict not valid,
  add constraint togal_bom_commit_requests_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict not valid;

alter table public.togal_bom_commit_requests
  validate constraint togal_bom_commit_requests_bom_tenant_fk,
  validate constraint togal_bom_commit_requests_created_by_tenant_fk;

alter table public.togal_bom_commit_requests enable row level security;
alter table public.togal_bom_commit_requests force row level security;
revoke all privileges on table public.togal_bom_commit_requests
  from public, anon, authenticated;
grant all privileges on table public.togal_bom_commit_requests to service_role;

commit;
