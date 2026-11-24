-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
-- Release batch B: index swap with an abort-if-unsafe rollback.
--
-- S8a: two identical bank statement lines are two real bank entries.
--
-- ux_bank_statement_lines_fingerprint made (statement, date, reference, amount,
-- description) unique, so a statement with two identical rows (two same-day
-- same-amount fees, repeated card settlements) could not be imported at all.
-- This release:
--   * adds bank_statement_lines.occurrence smallint not null default 1 (check > 0).
--     Every existing row keeps 1; the old unique index already guaranteed no two
--     existing rows share a fingerprint, so no backfill is needed. The importer
--     numbers the Nth identical row N.
--   * creates the fingerprint index again with occurrence as its last column,
--     drops the old index, and renames the new one back to the old name so the
--     error mapping and verify-database-repro keep working.
-- The swap runs in one transaction. The table is small and the build takes a
-- short write lock; lock_timeout makes it fail fast instead of queueing.
--
-- Rollback (aborts if any statement now holds identical lines, because the old
-- unique index could not be rebuilt without deleting evidence):
--   begin;
--   set local lock_timeout = '5s';
--   do $$
--   begin
--     if exists (
--       select 1
--       from public.bank_statement_lines
--       group by bank_statement_id, transaction_date,
--                coalesce(reference_number, ''), amount_cents,
--                lower(btrim(description))
--       having count(*) > 1
--     ) then
--       raise exception 'Identical bank statement lines exist; the old unique index cannot be restored'
--         using errcode = '55000';
--     end if;
--   end
--   $$;
--   create unique index ux_bank_statement_lines_fingerprint_old
--     on public.bank_statement_lines (
--       bank_statement_id, transaction_date, coalesce(reference_number, ''),
--       amount_cents, lower(btrim(description))
--     );
--   drop index public.ux_bank_statement_lines_fingerprint;
--   alter index public.ux_bank_statement_lines_fingerprint_old
--     rename to ux_bank_statement_lines_fingerprint;
--   alter table public.bank_statement_lines
--     drop constraint if exists bank_statement_lines_occurrence_positive;
--   alter table public.bank_statement_lines drop column if exists occurrence;
--   delete from supabase_migrations.schema_migrations where version = '20261124130000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.bank_statement_lines
  add column if not exists occurrence smallint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.bank_statement_lines'::regclass
      and conname = 'bank_statement_lines_occurrence_positive'
  ) then
    alter table public.bank_statement_lines
      add constraint bank_statement_lines_occurrence_positive
      check (occurrence > 0);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'bank_statement_lines'
      and indexname = 'ux_bank_statement_lines_fingerprint'
      and indexdef like '%occurrence%'
  ) then
    return;
  end if;

  create unique index ux_bank_statement_lines_fingerprint_occurrence
    on public.bank_statement_lines (
      bank_statement_id,
      transaction_date,
      coalesce(reference_number, ''),
      amount_cents,
      lower(btrim(description)),
      occurrence
    );
  drop index if exists public.ux_bank_statement_lines_fingerprint;
  alter index public.ux_bank_statement_lines_fingerprint_occurrence
    rename to ux_bank_statement_lines_fingerprint;
end
$$;

comment on column public.bank_statement_lines.occurrence is
  'S8a: 1 for the first row with a given fingerprint on a statement, N for the Nth identical row.';

commit;
