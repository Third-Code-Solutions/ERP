-- ADR-040: ownership belongs to this installation's verified immutable user.
-- Preserve all existing bindings; this migration never selects or grants one.
begin;

alter table public.platform_role_assignments
  drop constraint platform_role_assignments_exact_owner_email,
  add constraint platform_role_assignments_normalized_email check (
    normalized_email = lower(btrim(normalized_email))
    and length(normalized_email) > 0
  );

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) = 1 and coalesce(bool_and(
    assignment.user_id = (select auth.uid())
    and assignment.role = 'platform_owner'
    and lower(btrim(auth_user.email)) = assignment.normalized_email
    and auth_user.email_confirmed_at is not null
    and app_user.account_status = 'active'
    and tenant.status = 'active'
  ), false)
  from public.platform_role_assignments as assignment
  join auth.users as auth_user on auth_user.id = assignment.user_id
  join public.users as app_user on app_user.id = assignment.user_id
  join public.tenants as tenant on tenant.id = app_user.tenant_id
  where assignment.revoked_at is null;
$$;

revoke execute on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated, service_role;

-- Not exposed through PostgREST. Invoker privileges + explicit owner check
-- require an offline database-owner connection, never an application API key.
create schema if not exists erp_private;
revoke all on schema erp_private from public, anon, authenticated, service_role;

create function erp_private.bootstrap_platform_owner(
  selected_user_id uuid,
  expected_email text,
  bootstrap_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  verified_email text;
  selected_tenant_id uuid;
  event_trace_id uuid := gen_random_uuid();
begin
  if current_user <> (
    select pg_catalog.pg_get_userbyid(relowner)
    from pg_catalog.pg_class where oid = 'public.platform_role_assignments'::regclass
  ) then
    raise exception 'Platform bootstrap requires the assignment table owner' using errcode = '42501';
  end if;
  if expected_email is null or expected_email <> lower(btrim(expected_email))
     or length(expected_email) not between 3 and 255
     or bootstrap_reason is null or length(btrim(bootstrap_reason)) not between 3 and 500 then
    raise exception 'Explicit normalized email and bootstrap reason are required' using errcode = '22023';
  end if;

  lock table public.platform_role_assignments in share row exclusive mode;
  if exists (select 1 from public.platform_role_assignments) then
    raise exception 'Platform ownership already initialized; bootstrap cannot transfer ownership' using errcode = '55000';
  end if;

  select lower(btrim(auth_user.email)), app_user.tenant_id
    into verified_email, selected_tenant_id
  from auth.users as auth_user
  join public.users as app_user on app_user.id = auth_user.id
  join public.tenants as tenant on tenant.id = app_user.tenant_id
  where auth_user.id = selected_user_id
    and auth_user.email_confirmed_at is not null
    and lower(btrim(auth_user.email)) = expected_email
    and lower(btrim(app_user.email)) = expected_email
    and app_user.account_status = 'active'
    and tenant.status = 'active'
  for share of auth_user, app_user, tenant;
  if verified_email is null then
    raise exception 'Selected owner must have the matching verified active identity and tenant' using errcode = '42501';
  end if;

  insert into public.platform_role_assignments(user_id, normalized_email, created_by)
  values (selected_user_id, verified_email, selected_user_id);
  insert into public.platform_audit_events(
    trace_id, actor_id, action, outcome, target_type, target_id, target_tenant_id, metadata
  ) values (
    event_trace_id, selected_user_id, 'platform.owner.bootstrap', 'succeeded',
    'platform_role_assignment', selected_user_id::text, selected_tenant_id,
    jsonb_build_object('reason', btrim(bootstrap_reason), 'database_actor', current_user)
  );
  return event_trace_id;
end
$$;

revoke all on function erp_private.bootstrap_platform_owner(uuid, text, text)
  from public, anon, authenticated, service_role;

commit;

-- Recovery: keep existing immutable bindings and audit events. If application
-- rollback is required, keep platform routes closed until its guard supports
-- the stored identity. Never replace or delete an owner to recover a deploy.
