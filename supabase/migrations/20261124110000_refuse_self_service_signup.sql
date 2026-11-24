-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- Auth sign-up no longer creates a workspace.
--
-- Supabase Auth public sign-up is on, and handle_new_user() (trigger
-- on_auth_user_created, AFTER INSERT on auth.users) created a new tenant and
-- an Admin profile for every identity that had no public.users row yet. Anyone
-- holding the public anon key could POST /auth/v1/signup and receive an Admin
-- workspace. Legitimate onboarding never reaches that branch: platform and
-- tenant-admin invitations are placed first by a_platform_invited_user_provision,
-- and server code that creates an identity directly places its public.users
-- row before it calls the Auth admin API.
--
-- handle_new_user() now returns unchanged when the identity already has a
-- profile and otherwise raises P0001, so Auth rolls back the auth.users insert.
-- The trigger, SECURITY DEFINER, the empty search_path and the grants are
-- unchanged.
--
-- provision_platform_invited_user() binds a new identity to a pending
-- invitation by email alone, so any sign-up route could claim a pending
-- invitation that was left behind. Both server flows create the identity
-- seconds after they create the invitation (the Auth admin call times out
-- after 8 seconds), so the claim now matches only an invitation created in the
-- last 5 minutes. Older pending rows stay as they are and can no longer be
-- claimed. The email link's own expiry applies later, to the bound 'sent'
-- invitation, and is unchanged.
--
-- Rollback: re-run the create or replace function public.handle_new_user()
-- statement and its revoke/grant from
-- 20260729054456_persist_signup_organization_type.sql (the tenants column and
-- check it also adds already exist and must not be re-run), and the
-- create or replace function public.provision_platform_invited_user()
-- statement and its revoke/grant from
-- 20260904020000_platform_owner_administration_boundary.sql.
begin;

set local lock_timeout = '5s';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.users
     where id = new.id
  ) then
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'Self-service sign-up is disabled. Ask your workspace administrator for an invitation.';
end;
$$;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to service_role;

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
     and candidate.created_at > now() - interval '5 minutes'
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

revoke execute on function public.provision_platform_invited_user()
  from public, anon, authenticated;
grant execute on function public.provision_platform_invited_user()
  to service_role;

commit;
