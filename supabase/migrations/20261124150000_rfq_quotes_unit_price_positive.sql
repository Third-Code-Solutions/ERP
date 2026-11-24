-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- An RFQ quote must carry a positive unit price.
--
-- A zero or negative unit price is not a real quote. The web and Core refuse
-- one; this check is the database backstop. It is added validated: Postgres scans
-- rfq_quotes once and aborts the migration, changing nothing, if any row has
-- unit_price_cents <= 0. If a constraint of this name already exists unvalidated
-- (added NOT VALID by hand), it is validated instead, with the same scan.
--
-- Rollback:
--   begin;
--   set local lock_timeout = '5s';
--   alter table public.rfq_quotes
--     drop constraint if exists rfq_quotes_unit_price_positive;
--   delete from supabase_migrations.schema_migrations where version = '20261124150000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.rfq_quotes'::regclass
      and conname = 'rfq_quotes_unit_price_positive'
  ) then
    alter table public.rfq_quotes
      add constraint rfq_quotes_unit_price_positive
      check (unit_price_cents > 0);
  else
    alter table public.rfq_quotes
      validate constraint rfq_quotes_unit_price_positive;
  end if;
end
$$;

commit;
