-- A fresh source replay lacks the authenticated table grant that the hosted
-- project already has. Keep the existing tenant-scoped SELECT policy as the
-- authorization predicate; grant only the table permission it requires.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.projects') is null or not exists (
    select 1
      from pg_class
     where oid = 'public.projects'::regclass
       and relrowsecurity
  ) then
    raise exception 'Expected RLS-enabled public.projects before read parity grant'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'projects'
       and policyname = 'projects_tenant_read'
       and cmd = 'SELECT'
       and roles = array['authenticated']::name[]
       and qual = '(tenant_id = auth_tenant_id())'
  ) then
    raise exception 'Expected tenant-scoped authenticated projects read policy'
      using errcode = '55000';
  end if;
end
$$;

grant select on table public.projects to authenticated;

commit;

-- Reviewed rollback on a disposable replay: revoke SELECT from authenticated
-- only after confirming no client still depends on it. Do not automatically
-- revoke it on the hosted project: that grant predates this parity migration.
