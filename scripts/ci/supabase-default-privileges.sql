-- CI-only role/default-privilege parity for Supabase CLI's managed local DB.
-- Do not recreate auth/storage objects here; the CLI owns those schemas.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

-- The legacy Project table predates the repository's explicit privilege
-- hardening migrations. Reproduce only the reviewed authenticated RLS test
-- surface; anonymous clients must not receive direct ERP-table privileges.
revoke all privileges
  on table public.projects
  from public, anon;
grant select, insert, update, delete
  on table public.projects
  to authenticated;

-- User role changes are Core-owned. Authenticated users retain tenant-scoped
-- reads through RLS; anonymous users must not receive a direct ERP-table grant.
grant select
  on table public.users
  to authenticated;
revoke all privileges
  on table public.users
  from public, anon;

commit;
