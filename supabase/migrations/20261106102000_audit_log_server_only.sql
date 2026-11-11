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

alter table public.audit_log force row level security;

commit;
