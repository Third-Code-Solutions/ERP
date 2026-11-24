-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- Index the CNPS survey response token.
--
-- The public survey page finds its survey by response_token_hash on every
-- unauthenticated request, and nothing indexed that column, so each request
-- scanned cnps_surveys. A partial index over the issued tokens serves that
-- lookup. cnps_surveys is small, so a plain CREATE INDEX (SHARE lock: reads
-- continue, writes wait for the build) is used inside the migration
-- transaction instead of CREATE INDEX CONCURRENTLY.
--
-- Rollback:
--   begin;
--   set local lock_timeout = '5s';
--   drop index if exists public.idx_cnps_response_token_hash;
--   delete from supabase_migrations.schema_migrations where version = '20261124160000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index if not exists idx_cnps_response_token_hash
  on public.cnps_surveys (response_token_hash)
  where response_token_hash is not null;

commit;
