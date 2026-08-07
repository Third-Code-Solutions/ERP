-- Nest/Core becomes the only browser-reachable authority for user role changes.

begin;

do $$
begin
  create type public.user_role_assignment_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.user_role_assignment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.user_role_assignment_request_state not null
    default 'processing',
  target_user_id uuid not null,
  result jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint user_role_assignment_requests_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint user_role_assignment_requests_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint user_role_assignment_requests_result_object check (
    result is null or jsonb_typeof(result) = 'object'
  ),
  constraint user_role_assignment_requests_state_payload check (
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
  constraint user_role_assignment_requests_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index if not exists
  ux_user_role_assignment_requests_tenant_id_id
  on public.user_role_assignment_requests (tenant_id, id);
create unique index if not exists
  ux_user_role_assignment_requests_tenant_key
  on public.user_role_assignment_requests (tenant_id, idempotency_key);
create index if not exists
  idx_user_role_assignment_requests_tenant_target
  on public.user_role_assignment_requests (
    tenant_id,
    target_user_id,
    created_at
  );

alter table public.user_role_assignment_requests enable row level security;
alter table public.user_role_assignment_requests force row level security;
revoke all privileges on table public.user_role_assignment_requests
  from public, anon, authenticated;
grant all privileges on table public.user_role_assignment_requests
  to service_role;

-- Preserve tenant-scoped reads. All official mutations now pass through a
-- server-authorized command boundary; RLS tenant equality alone is not enough
-- to authorize role changes.
drop policy if exists users_tenant_write on public.users;
drop policy if exists users_tenant_update on public.users;
revoke insert, update, delete on table public.users
  from public, anon, authenticated;
revoke insert (id, tenant_id, email, full_name, role, created_at, updated_at),
  update (id, tenant_id, email, full_name, role, created_at, updated_at)
  on table public.users from public, anon, authenticated;

commit;
