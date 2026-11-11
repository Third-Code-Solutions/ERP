-- Cortex coverage review SEC-H2: audit_log is server-only.
--
-- The audit trigger copies full row images, including the Cortex node
-- attributes that Batch 1 stops mirroring (S1, S2, S3). Until now any tenant
-- user could read them through audit_log_tenant_read. Every reader is
-- server-side behind the audit.read capability (Drizzle as postgres, or
-- service_role, both BYPASSRLS), so no application path loses access.
--
-- Additive: one revoke and FORCE ROW LEVEL SECURITY. RLS, the tenant policy
-- and the no-update/no-delete rules stay as a second layer.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke select on table public.audit_log from authenticated, anon;
alter table public.audit_log force row level security;

commit;
