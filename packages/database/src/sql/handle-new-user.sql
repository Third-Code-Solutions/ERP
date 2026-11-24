-- ---------------------------------------------------------------------------
-- Refuse an Auth identity that has no workspace profile.
--
-- Mirrors supabase/migrations/20261124110000_refuse_self_service_signup.sql.
-- Self-service sign-up no longer creates a tenant. Invitations are placed
-- earlier by a_platform_invited_user_provision, and server code that creates
-- an identity directly inserts its public.users row before calling the Auth
-- admin API. Any other auth.users insert raises P0001 and Auth rolls it back.
-- SECURITY DEFINER with an empty search_path, as before.
-- ---------------------------------------------------------------------------

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to service_role;
