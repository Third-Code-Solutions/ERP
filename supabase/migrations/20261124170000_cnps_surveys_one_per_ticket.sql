-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- One CNPS survey per warranty ticket.
--
-- Two senders create surveys: the cnps-survey-sender edge function and the
-- Inngest cron / 48-hour event. Each checks for an existing survey and then
-- inserts, so two runs at the same moment could both insert and both email
-- the client. This unique index makes the second insert a conflict. Both
-- senders insert with ON CONFLICT (tenant_id, ticket_id) DO NOTHING and email
-- only when their own insert created the row.
--
-- A preflight aborts, changing nothing, if a ticket already has two surveys.
-- cnps_surveys is small, so a plain CREATE UNIQUE INDEX (SHARE lock: reads
-- continue, writes wait for the build) runs inside the migration transaction
-- instead of CREATE INDEX CONCURRENTLY.
--
-- Rollback (roll the senders back first: their ON CONFLICT (tenant_id,
-- ticket_id) needs this index and fails with 42P10 without it):
--   begin;
--   set local lock_timeout = '5s';
--   drop index if exists public.ux_cnps_surveys_tenant_ticket;
--   delete from supabase_migrations.schema_migrations where version = '20261124170000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1
    from public.cnps_surveys
    group by tenant_id, ticket_id
    having count(*) > 1
  ) then
    raise exception 'cnps_surveys has a ticket with more than one survey; resolve the duplicates first'
      using errcode = '23505';
  end if;
end
$$;

create unique index if not exists ux_cnps_surveys_tenant_ticket
  on public.cnps_surveys (tenant_id, ticket_id);

commit;
