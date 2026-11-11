-- Cortex coverage review SEC-H2: audit_log is server-only.
--
-- The audit trigger copies full row images, including the Cortex node
-- attributes that Batch 1 stops mirroring (S1, S2, S3). Until now any tenant
-- user could read them through audit_log_tenant_read. Every reader is
-- server-side behind the audit.read capability (Drizzle as postgres, or
-- service_role, both BYPASSRLS), so no application path loses access.
--
-- SELECT is revoked from the client roles, and the tenant read policy is
-- replaced by the server-only deny policy (20260817110000), so a later
-- re-grant cannot quietly re-open tenant reads. RLS stays forced and the
-- no-update/no-delete rules stay.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke select on table public.audit_log from authenticated, anon;

drop policy if exists audit_log_tenant_read on public.audit_log;
drop policy if exists deny_direct_client_access on public.audit_log;
create policy deny_direct_client_access on public.audit_log
  for all to anon, authenticated using (false) with check (false);

-- Forced RLS binds the table owner too. The audit triggers (SECURITY
-- DEFINER) read and insert audit_log as their owner, and only a superuser or
-- BYPASSRLS role gets past the deny policy: stop rather than break every
-- audited write. The API's direct insert runs as the runtime role, which
-- this migration cannot see: the runbook preflight checks that one.
do $$
declare v_role name;
begin
  for v_role in
    select current_user
    union
    select pg_catalog.pg_get_userbyid(c.relowner)
      from pg_catalog.pg_class c
     where c.oid = 'public.audit_log'::regclass
    union
    select pg_catalog.pg_get_userbyid(p.proowner)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'audit_log_trigger'
  loop
    if not exists (
      select 1 from pg_catalog.pg_roles r where r.rolname = v_role and (r.rolsuper or r.rolbypassrls)
    ) then
      raise exception 'audit_log_server_only: role % is neither superuser nor BYPASSRLS; audited writes would fail under forced RLS', v_role;
    end if;
  end loop;
end
$$;

alter table public.audit_log force row level security;

commit;
