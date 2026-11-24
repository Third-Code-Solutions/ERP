-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- A signed-in user reads only the notifications addressed to them.
--
-- Why. notifications_tenant_read (20260512110000) let any signed-in user of a
-- tenant read every colleague's notifications through PostgREST or a Realtime
-- subscription without the recipient filter. notifications.body and link_url
-- carry live links (the CNPS survey link today), so a colleague could open a
-- link meant for someone else.
--
-- What changes: the SELECT policy on public.notifications only.
--   * drops notifications_tenant_read (tenant_id = auth_tenant_id(), all roles)
--   * creates notifications_recipient_read for authenticated:
--       tenant_id = auth_tenant_id() and recipient_user_id = auth.uid()
-- No table, column, grant, index or data change. INSERT, UPDATE and DELETE were
-- already revoked from the browser roles (20260729233017), so there is no
-- write policy to align. Rows with no recipient_user_id become unreadable
-- through the user JWT; the bell never showed them (its Realtime filter is
-- recipient_user_id=eq.<user>), and the list itself comes from Core
-- (/api/notifications), which reads as postgres and is unaffected.
--
-- Readers checked on main: Realtime in components/nav/notifications-dropdown.tsx
-- (filter recipient_user_id=eq.<auth user id>, which this policy still passes);
-- no supabase-js .from('notifications') read anywhere; edge functions and Core
-- read through the service role or Drizzle.
--
-- Locks: DROP POLICY and CREATE POLICY take ACCESS EXCLUSIVE on notifications
-- until commit (catalog only, no scan), so notification inserts wait
-- milliseconds. Bounded by lock_timeout 5s.
--
-- Rollback (restores the tenant-wide read):
--   begin;
--   set local lock_timeout = '5s';
--   set local statement_timeout = '60s';
--   drop policy if exists notifications_recipient_read on public.notifications;
--   create policy "notifications_tenant_read" on public.notifications
--     for select using (tenant_id = public.auth_tenant_id());
--   delete from supabase_migrations.schema_migrations where version = '20261124210000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop policy if exists notifications_tenant_read on public.notifications;
drop policy if exists notifications_recipient_read on public.notifications;

create policy notifications_recipient_read on public.notifications
  for select
  to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and recipient_user_id = (select auth.uid())
  );

commit;
