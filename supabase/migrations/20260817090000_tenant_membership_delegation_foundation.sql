-- ADR-022 Phase 0: additive, dormant membership and delegated-approval
-- foundation. This migration intentionally does NOT activate cross-tenant
-- sessions, alter auth_tenant_id(), repoint existing foreign keys, or grant a
-- browser client access to the new tables.

begin;

do $$
begin
  if to_regclass('public.users') is null
    or to_regclass('public.approval_rules') is null then
    raise exception
      'ADR-022 requires public.users and public.approval_rules before apply'
      using errcode = '55000';
  end if;

  if to_regprocedure('public.audit_log_trigger()') is null then
    raise exception 'ADR-022 requires public.audit_log_trigger() before apply'
      using errcode = '55000';
  end if;
end
$$;

do $$
begin
  create type public.tenant_membership_status as enum (
    'active',
    'suspended',
    'revoked'
  );
exception
  when duplicate_object then null;
end
$$;

-- `users` remains the live compatibility authority in Phase 0. This table is
-- a synchronized representation only; nothing reads it for authorization yet.
create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  user_id uuid not null
    references public.users(id) on delete cascade,
  role public.role not null,
  status public.tenant_membership_status not null default 'active',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_default_requires_active
    check (not is_default or status = 'active')
);

create unique index if not exists ux_tenant_memberships_tenant_id_id
  on public.tenant_memberships (tenant_id, id);
create unique index if not exists ux_tenant_memberships_tenant_user
  on public.tenant_memberships (tenant_id, user_id);
create unique index if not exists ux_tenant_memberships_user_default
  on public.tenant_memberships (user_id)
  where is_default;
create index if not exists idx_tenant_memberships_tenant_status
  on public.tenant_memberships (tenant_id, status, role);
create index if not exists idx_tenant_memberships_user_status
  on public.tenant_memberships (user_id, status);

-- A delegated approval is explicitly scoped to a pre-existing approval rule.
-- It has no generic act-as grant and no runtime evaluator in Phase 0.
create table if not exists public.approval_delegations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  delegator_membership_id uuid not null,
  delegate_membership_id uuid not null,
  approval_rule_id uuid not null,
  delegation_reason text not null,
  effective_from timestamptz not null default now(),
  effective_until timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_delegations_not_self
    check (delegator_membership_id <> delegate_membership_id),
  constraint approval_delegations_effective_window
    check (effective_until > effective_from),
  constraint approval_delegations_reason_nonempty
    check (
      delegation_reason = btrim(delegation_reason)
      and length(delegation_reason) > 0
    ),
  constraint approval_delegations_revocation_reason
    check (
      (revoked_at is null and revocation_reason is null)
      or (
        revoked_at is not null
        and revocation_reason = btrim(revocation_reason)
        and length(revocation_reason) > 0
      )
    )
);

create unique index if not exists ux_approval_delegations_tenant_id_id
  on public.approval_delegations (tenant_id, id);
create index if not exists idx_approval_delegations_tenant_delegator
  on public.approval_delegations (
    tenant_id,
    delegator_membership_id,
    effective_from,
    effective_until
  );
create index if not exists idx_approval_delegations_tenant_delegate
  on public.approval_delegations (
    tenant_id,
    delegate_membership_id,
    effective_from,
    effective_until
  );
create index if not exists idx_approval_delegations_tenant_rule
  on public.approval_delegations (
    tenant_id,
    approval_rule_id,
    effective_from,
    effective_until
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_delegations'::regclass
      and conname = 'approval_delegations_delegator_membership_tenant_fk'
  ) then
    alter table public.approval_delegations
      add constraint approval_delegations_delegator_membership_tenant_fk
      foreign key (tenant_id, delegator_membership_id)
      references public.tenant_memberships (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_delegations'::regclass
      and conname = 'approval_delegations_delegate_membership_tenant_fk'
  ) then
    alter table public.approval_delegations
      add constraint approval_delegations_delegate_membership_tenant_fk
      foreign key (tenant_id, delegate_membership_id)
      references public.tenant_memberships (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_delegations'::regclass
      and conname = 'approval_delegations_rule_tenant_fk'
  ) then
    alter table public.approval_delegations
      add constraint approval_delegations_rule_tenant_fk
      foreign key (tenant_id, approval_rule_id)
      references public.approval_rules (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

-- Capture the backfill itself in the existing append-only audit chain. The
-- audit trigger is attached before data is copied so a Phase 0 record never
-- appears without an auditable creation event.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.tenant_memberships'::regclass
      and tgname = 'audit_tenant_memberships'
  ) then
    create trigger audit_tenant_memberships
      after insert or update or delete on public.tenant_memberships
      for each row
      execute function public.audit_log_trigger();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.approval_delegations'::regclass
      and tgname = 'audit_approval_delegations'
  ) then
    create trigger audit_approval_delegations
      after insert or update or delete on public.approval_delegations
      for each row
      execute function public.audit_log_trigger();
  end if;
end
$$;

-- Backfill exactly one default active membership for every legacy user. The
-- conflict target makes a retry safe and never rewrites a later membership.
insert into public.tenant_memberships (
  tenant_id,
  user_id,
  role,
  status,
  is_default,
  created_at,
  updated_at
)
select
  legacy_user.tenant_id,
  legacy_user.id,
  legacy_user.role,
  'active'::public.tenant_membership_status,
  true,
  legacy_user.created_at,
  legacy_user.updated_at
from public.users legacy_user
on conflict (tenant_id, user_id) do nothing;

-- Keep the dormant projection complete for legacy user creation and role
-- changes. Tenant reassignment is intentionally not handled here: it needs
-- the future controlled tenant-switch/FK migration described in ADR-022.
create or replace function public.sync_legacy_user_default_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role then
    return new;
  end if;

  insert into public.tenant_memberships (
    tenant_id,
    user_id,
    role,
    status,
    is_default,
    created_at,
    updated_at
  )
  values (
    new.tenant_id,
    new.id,
    new.role,
    'active'::public.tenant_membership_status,
    true,
    new.created_at,
    new.updated_at
  )
  on conflict (tenant_id, user_id) do update
  set role = excluded.role;

  return new;
end
$$;

revoke all on function public.sync_legacy_user_default_membership()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.users'::regclass
      and tgname = 'sync_legacy_user_default_membership'
  ) then
    create trigger sync_legacy_user_default_membership
      after insert or update of role on public.users
      for each row
      execute function public.sync_legacy_user_default_membership();
  end if;
end
$$;

create or replace function public.tenant_memberships_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Tenant membership identity and creation metadata are immutable'
      using errcode = '55000';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end
$$;

create or replace function public.approval_delegations_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.delegator_membership_id is distinct from old.delegator_membership_id
    or new.delegate_membership_id is distinct from old.delegate_membership_id
    or new.approval_rule_id is distinct from old.approval_rule_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Approval delegation identity and creation metadata are immutable'
      using errcode = '55000';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.tenant_memberships'::regclass
      and tgname = 'tenant_memberships_set_updated_at'
  ) then
    create trigger tenant_memberships_set_updated_at
      before update on public.tenant_memberships
      for each row
      execute function public.tenant_memberships_set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.approval_delegations'::regclass
      and tgname = 'approval_delegations_set_updated_at'
  ) then
    create trigger approval_delegations_set_updated_at
      before update on public.approval_delegations
      for each row
      execute function public.approval_delegations_set_updated_at();
  end if;

end
$$;

-- The Phase 0 tables have no client surface. RLS default-deny plus revoked
-- client grants prevents a row from being mistaken for executable authority.
alter table public.tenant_memberships enable row level security;
alter table public.tenant_memberships force row level security;
alter table public.approval_delegations enable row level security;
alter table public.approval_delegations force row level security;

revoke all privileges on table public.tenant_memberships
  from public, anon, authenticated;
revoke all privileges on table public.approval_delegations
  from public, anon, authenticated;
grant all privileges on table public.tenant_memberships to service_role;
grant all privileges on table public.approval_delegations to service_role;

-- Explicit reject policies retain the existing server-only posture while
-- documenting the intent for the Database Advisor. The service role remains
-- the Core-only path; no browser policy is introduced in Phase 0.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_memberships'
      and policyname = 'deny_direct_client_access'
  ) then
    execute 'create policy deny_direct_client_access on public.tenant_memberships for all to anon, authenticated using (false) with check (false)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'approval_delegations'
      and policyname = 'deny_direct_client_access'
  ) then
    execute 'create policy deny_direct_client_access on public.approval_delegations for all to anon, authenticated using (false) with check (false)';
  end if;
end
$$;

comment on table public.tenant_memberships is
  'ADR-022 Phase 0 dormant membership projection; not an active session authority.';
comment on table public.approval_delegations is
  'ADR-022 Phase 0 dormant delegation ledger; no row grants approval authority.';

commit;
