-- ADR-027: platform-owner identity, lifecycle denial, privileged audit, and
-- explicit support context. This migration is additive and intentionally does
-- not activate ADR-022 tenant memberships as session authority.

do $$
begin
  create type public.platform_role as enum ('platform_owner');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.tenant_lifecycle_status as enum (
    'active',
    'suspended',
    'disabled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.user_account_status as enum (
    'invited',
    'active',
    'suspended',
    'disabled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.platform_invitation_status as enum (
    'pending',
    'sent',
    'accepted',
    'revoked',
    'failed'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.tenants
  add column if not exists status public.tenant_lifecycle_status not null
    default 'active',
  add column if not exists status_reason varchar(500),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid;

alter table public.users
  add column if not exists account_status public.user_account_status not null
    default 'active',
  add column if not exists invited_at timestamptz,
  add column if not exists last_active_at timestamptz,
  add column if not exists status_reason varchar(500),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid;

do $$
begin
  alter table public.tenants
    add constraint tenants_status_changed_by_fk
    foreign key (status_changed_by) references public.users(id)
    on delete restrict;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.users
    add constraint users_status_changed_by_fk
    foreign key (status_changed_by) references public.users(id)
    on delete restrict;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.tenants
    add constraint tenants_inactive_status_reason_check check (
      status = 'active'
      or (
        status_reason = btrim(status_reason)
        and length(status_reason) > 0
        and status_changed_at is not null
        and status_changed_by is not null
      )
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.users
    add constraint users_inactive_status_reason_check check (
      account_status in ('active', 'invited')
      or (
        status_reason = btrim(status_reason)
        and length(status_reason) > 0
        and status_changed_at is not null
        and status_changed_by is not null
      )
    );
exception
  when duplicate_object then null;
end
$$;

create index if not exists idx_tenants_status
  on public.tenants (status, created_at);
create index if not exists idx_users_tenant_account_status
  on public.users (tenant_id, account_status);
create index if not exists idx_users_account_status
  on public.users (account_status, created_at);

create table if not exists public.platform_user_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  normalized_email varchar(255) not null,
  full_name varchar(255) not null,
  role public.role not null,
  status public.platform_invitation_status not null default 'pending',
  invited_by uuid not null references public.users(id) on delete restrict,
  auth_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  failure_reason varchar(500),
  constraint platform_user_invitations_normalized_email_check check (
    normalized_email = lower(btrim(normalized_email))
  ),
  constraint platform_user_invitations_full_name_check check (
    full_name = btrim(full_name) and length(full_name) >= 2
  )
);

create unique index if not exists ux_platform_user_invitations_open_email
  on public.platform_user_invitations (normalized_email)
  where status in ('pending', 'sent');
create index if not exists idx_platform_user_invitations_tenant_status
  on public.platform_user_invitations (tenant_id, status, created_at);

create table if not exists public.platform_role_assignments (
  user_id uuid primary key references public.users(id) on delete restrict,
  role public.platform_role not null default 'platform_owner',
  normalized_email varchar(255) not null,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict,
  revocation_reason text,
  constraint platform_role_assignments_exact_owner_email check (
    normalized_email = 'kurt@thirdcodesolutions.com'
    and normalized_email = lower(btrim(normalized_email))
  ),
  constraint platform_role_assignments_revocation_evidence check (
    (
      revoked_at is null
      and revoked_by is null
      and revocation_reason is null
    )
    or (
      revoked_at is not null
      and revoked_by is not null
      and revocation_reason = btrim(revocation_reason)
      and length(revocation_reason) > 0
    )
  )
);

create unique index if not exists ux_platform_role_assignments_active_role
  on public.platform_role_assignments (role)
  where revoked_at is null;

create table if not exists public.platform_audit_events (
  id bigserial primary key,
  trace_id uuid not null,
  actor_id uuid not null references public.users(id) on delete restrict,
  action varchar(100) not null,
  outcome varchar(32) not null,
  target_type varchar(100) not null,
  target_id text,
  target_tenant_id uuid references public.tenants(id) on delete restrict,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint platform_audit_events_outcome_check check (
    outcome in ('succeeded', 'denied', 'failed')
  )
);

-- A request can produce intent, provider-result, and compensation events.
-- Trace correlation is many-to-one; event identity is the primary key.
create index if not exists idx_platform_audit_events_trace_id
  on public.platform_audit_events (trace_id);
create index if not exists idx_platform_audit_events_created_at
  on public.platform_audit_events (created_at);
create index if not exists idx_platform_audit_events_tenant_created_at
  on public.platform_audit_events (target_tenant_id, created_at);
create index if not exists idx_platform_audit_events_actor_created_at
  on public.platform_audit_events (actor_id, created_at);

create table if not exists public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint platform_support_sessions_reason_check check (
    reason = btrim(reason) and length(reason) > 0
  ),
  constraint platform_support_sessions_expiry_check check (
    expires_at > created_at
    and expires_at <= created_at + interval '4 hours'
  ),
  constraint platform_support_sessions_ended_check check (
    ended_at is null or ended_at >= created_at
  )
);

create index if not exists idx_platform_support_sessions_actor_expiry
  on public.platform_support_sessions (actor_id, expires_at);
create index if not exists idx_platform_support_sessions_tenant_expiry
  on public.platform_support_sessions (tenant_id, expires_at);

alter table public.platform_role_assignments enable row level security;
alter table public.platform_role_assignments force row level security;
alter table public.platform_audit_events enable row level security;
alter table public.platform_audit_events force row level security;
alter table public.platform_support_sessions enable row level security;
alter table public.platform_support_sessions force row level security;
alter table public.platform_user_invitations enable row level security;
alter table public.platform_user_invitations force row level security;

revoke all privileges on table public.platform_role_assignments
  from public, anon, authenticated;
revoke all privileges on table public.platform_audit_events
  from public, anon, authenticated;
revoke all privileges on sequence public.platform_audit_events_id_seq
  from public, anon, authenticated;
revoke all privileges on table public.platform_support_sessions
  from public, anon, authenticated;
revoke all privileges on table public.platform_user_invitations
  from public, anon, authenticated;

drop policy if exists deny_direct_client_access
  on public.platform_role_assignments;
create policy deny_direct_client_access
  on public.platform_role_assignments
  for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_direct_client_access
  on public.platform_audit_events;
create policy deny_direct_client_access
  on public.platform_audit_events
  for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_direct_client_access
  on public.platform_support_sessions;
create policy deny_direct_client_access
  on public.platform_support_sessions
  for all to anon, authenticated using (false) with check (false);

drop policy if exists deny_direct_client_access
  on public.platform_user_invitations;
create policy deny_direct_client_access
  on public.platform_user_invitations
  for all to anon, authenticated using (false) with check (false);

-- Trigger names for the same event execute alphabetically. The `a_` prefix
-- deliberately provisions an authorized invitation before the existing
-- `on_auth_user_created` self-signup trigger, which then sees the user row and
-- returns without creating a new tenant.
create or replace function public.provision_platform_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.platform_user_invitations%rowtype;
begin
  select candidate.*
    into invitation
    from public.platform_user_invitations as candidate
   where candidate.normalized_email = lower(btrim(new.email))
     and candidate.status = 'pending'
     and candidate.auth_user_id is null
   order by candidate.created_at desc
   limit 1
   for update;

  if not found then
    return new;
  end if;

  insert into public.users (
    id,
    tenant_id,
    email,
    full_name,
    role,
    account_status,
    invited_at
  ) values (
    new.id,
    invitation.tenant_id,
    invitation.normalized_email,
    invitation.full_name,
    invitation.role,
    'invited',
    now()
  );

  update public.platform_user_invitations
     set status = 'sent',
         auth_user_id = new.id,
         sent_at = now()
   where id = invitation.id;

  return new;
end
$$;

create or replace function public.activate_current_invited_user()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  activated_id uuid;
begin
  update public.users as app_user
     set account_status = 'active',
         last_active_at = now(),
         updated_at = now()
   where app_user.id = (select auth.uid())
     and app_user.account_status = 'invited'
     and exists (
       select 1
         from auth.users as auth_user
        where auth_user.id = app_user.id
          and auth_user.email_confirmed_at is not null
          and lower(auth_user.email) = lower(app_user.email)
     )
     and exists (
       select 1
         from public.platform_user_invitations as invitation
        where invitation.auth_user_id = app_user.id
          and invitation.tenant_id = app_user.tenant_id
          and invitation.status = 'sent'
     )
  returning app_user.id into activated_id;

  if activated_id is null then
    return false;
  end if;

  update public.platform_user_invitations
     set status = 'accepted',
         accepted_at = now()
   where auth_user_id = activated_id
     and status = 'sent';

  return true;
end
$$;

drop trigger if exists a_platform_invited_user_provision
  on auth.users;
create trigger a_platform_invited_user_provision
after insert on auth.users
for each row execute function public.provision_platform_invited_user();

revoke execute on function public.provision_platform_invited_user()
  from public, anon, authenticated;
grant execute on function public.provision_platform_invited_user()
  to service_role;
revoke execute on function public.activate_current_invited_user()
  from public, anon;
grant execute on function public.activate_current_invited_user()
  to authenticated, service_role;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where assignment.revoked_at is null) = 1
    and bool_and(
      assignment.user_id = (select auth.uid())
      and assignment.role = 'platform_owner'
      and assignment.normalized_email = 'kurt@thirdcodesolutions.com'
      and lower(auth_user.email) = assignment.normalized_email
      and auth_user.email_confirmed_at is not null
      and app_user.account_status = 'active'
    )
  from public.platform_role_assignments as assignment
  join auth.users as auth_user on auth_user.id = assignment.user_id
  join public.users as app_user on app_user.id = assignment.user_id
  where assignment.revoked_at is null;
$$;

revoke execute on function public.is_platform_owner()
  from public, anon;
grant execute on function public.is_platform_owner()
  to authenticated, service_role;

-- Suspension/disablement removes the tenant identity used by every existing
-- tenant-scoped RLS policy. The helper stays single-tenant per ADR-022.
create or replace function public.auth_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app_user.tenant_id
  from public.users as app_user
  join public.tenants as tenant on tenant.id = app_user.tenant_id
  where app_user.id = (select auth.uid())
    and app_user.account_status = 'active'
    and tenant.status = 'active'
$$;

revoke execute on function public.auth_tenant_id()
  from public, anon;
grant execute on function public.auth_tenant_id()
  to authenticated, service_role;

create or replace function public.prevent_platform_owner_assignment_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'platform owner assignment is immutable; use a reviewed security migration'
    using errcode = '42501';
end
$$;

create or replace function public.prevent_platform_owner_account_lockout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.platform_role_assignments as assignment
    where assignment.user_id = old.id
      and assignment.revoked_at is null
  ) then
    if tg_op = 'DELETE' or new.account_status <> 'active' then
      raise exception 'the active platform owner cannot be deleted, suspended, or disabled'
        using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create or replace function public.prevent_platform_owner_tenant_lockout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active'
     and exists (
       select 1
       from public.platform_role_assignments as assignment
       join public.users as app_user on app_user.id = assignment.user_id
       where app_user.tenant_id = old.id
         and assignment.revoked_at is null
     ) then
    raise exception 'the tenant containing the active platform owner cannot be suspended or disabled'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.prevent_platform_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'platform audit events are append-only'
    using errcode = '42501';
end
$$;

create or replace function public.restrict_platform_support_session_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'platform support sessions cannot be deleted'
      using errcode = '42501';
  end if;
  if old.ended_at is not null
     or new.id <> old.id
     or new.actor_id <> old.actor_id
     or new.tenant_id <> old.tenant_id
     or new.reason <> old.reason
     or new.created_at <> old.created_at
     or new.expires_at <> old.expires_at
     or new.ended_at is null then
    raise exception 'only ending an active platform support session is allowed'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists protect_platform_owner_assignment
  on public.platform_role_assignments;
create trigger protect_platform_owner_assignment
before update or delete on public.platform_role_assignments
for each row execute function public.prevent_platform_owner_assignment_mutation();

drop trigger if exists protect_platform_owner_account
  on public.users;
create trigger protect_platform_owner_account
before update of account_status or delete on public.users
for each row execute function public.prevent_platform_owner_account_lockout();

drop trigger if exists protect_platform_owner_tenant
  on public.tenants;
create trigger protect_platform_owner_tenant
before update of status on public.tenants
for each row execute function public.prevent_platform_owner_tenant_lockout();

drop trigger if exists platform_audit_events_append_only
  on public.platform_audit_events;
create trigger platform_audit_events_append_only
before update or delete on public.platform_audit_events
for each row execute function public.prevent_platform_audit_mutation();

drop trigger if exists restrict_platform_support_session_update
  on public.platform_support_sessions;
create trigger restrict_platform_support_session_update
before update or delete on public.platform_support_sessions
for each row execute function public.restrict_platform_support_session_update();

revoke execute on function public.prevent_platform_owner_assignment_mutation()
  from public, anon, authenticated;
revoke execute on function public.prevent_platform_owner_account_lockout()
  from public, anon, authenticated;
revoke execute on function public.prevent_platform_owner_tenant_lockout()
  from public, anon, authenticated;
revoke execute on function public.prevent_platform_audit_mutation()
  from public, anon, authenticated;
revoke execute on function public.restrict_platform_support_session_update()
  from public, anon, authenticated;

-- Every state transition is durable even when it originates in an Auth trigger
-- rather than Core. These global records must NOT enter tenant-visible audit_log.
-- Command-level events remain separate from these one-per-row state events.
create or replace function public.audit_platform_state_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row jsonb;
  previous_row jsonb;
  event_actor uuid;
begin
  if tg_table_schema <> 'public' or tg_table_name not in (
    'platform_support_sessions', 'platform_user_invitations'
  ) then
    raise exception 'unsupported platform audit source' using errcode = '42501';
  end if;
  previous_row := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  current_row := case when tg_op = 'DELETE' then previous_row else to_jsonb(new) end;
  event_actor := coalesce(
    auth.uid(),
    (current_row->>'actor_id')::uuid,
    (current_row->>'invited_by')::uuid
  );
  insert into public.platform_audit_events (
    trace_id, actor_id, action, outcome, target_type, target_id,
    target_tenant_id, metadata
  ) values (
    gen_random_uuid(), event_actor, tg_table_name || '.' || lower(tg_op),
    'succeeded', tg_table_name, current_row->>'id',
    (current_row->>'tenant_id')::uuid,
    jsonb_build_object(
      'source', 'database_state_transition',
      'before', case when previous_row is null then null else jsonb_build_object(
        'status', previous_row->'status', 'role', previous_row->'role',
        'expires_at', previous_row->'expires_at', 'ended_at', previous_row->'ended_at'
      ) end,
      'after', case when tg_op = 'DELETE' then null else jsonb_build_object(
        'status', current_row->'status', 'role', current_row->'role',
        'expires_at', current_row->'expires_at', 'ended_at', current_row->'ended_at'
      ) end
    )
  );
  return coalesce(new, old);
end
$$;
revoke execute on function public.audit_platform_state_change()
  from public, anon, authenticated;

do $$
declare
  source_table text;
begin
  foreach source_table in array array['document_upload_reservations', 'project_retirement_requests'] loop
    if not exists (select 1 from pg_trigger
      where tgrelid = format('public.%I', source_table)::regclass and tgname = 'audit_' || source_table) then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()',
        'audit_' || source_table, source_table);
    end if;
  end loop;
  foreach source_table in array array['platform_support_sessions', 'platform_user_invitations'] loop
    if not exists (select 1 from pg_trigger
      where tgrelid = format('public.%I', source_table)::regclass and tgname = 'audit_' || source_table) then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_platform_state_change()',
        'audit_' || source_table, source_table);
    end if;
  end loop;
end
$$;
