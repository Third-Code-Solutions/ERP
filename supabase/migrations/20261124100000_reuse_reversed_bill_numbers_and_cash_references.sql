-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
-- Release batch B: two unique-index swaps with an abort-if-unsafe rollback.
--
-- S10a: a number used by a REVERSED document can be used again.
--
-- A reversed supplier bill kept its vendor bill number, and a reversed cash
-- transaction kept its reference, so correcting the entry with the same number
-- (the normal fix for a keying error) failed with "already exists". The
-- reversed row stays as evidence; only live rows now compete for a number:
--   * ux_supplier_bills_vendor_number  becomes partial: where status <> 'reversed'
--   * ux_cash_transactions_reference   becomes partial: where status <> 'reversed'
-- Each is built under a temporary name, the old index is dropped, and the new
-- one is renamed back, so error mapping and verify-database-repro keep working.
-- Two live (draft or posted) rows with the same number are still rejected, and
-- a reversal is final (no reversed row ever returns to draft or posted), so a
-- live row can never end up beside another live row with its number.
--
-- Rollback (aborts if a number is now used by more than one row, because the
-- old unique indexes could not be rebuilt without deleting evidence):
--   begin;
--   set local lock_timeout = '5s';
--   do $$
--   begin
--     if exists (
--       select 1
--       from public.supplier_bills
--       group by tenant_id, vendor_id, lower(btrim(vendor_bill_number))
--       having count(*) > 1
--     ) or exists (
--       select 1
--       from public.cash_transactions
--       group by tenant_id, cash_account_id, direction, lower(btrim(reference_number))
--       having count(*) > 1
--     ) then
--       raise exception 'A reversed number has been reused; the old unique indexes cannot be restored'
--         using errcode = '55000';
--     end if;
--   end
--   $$;
--   create unique index ux_supplier_bills_vendor_number_old
--     on public.supplier_bills (tenant_id, vendor_id, lower(btrim(vendor_bill_number)));
--   drop index public.ux_supplier_bills_vendor_number;
--   alter index public.ux_supplier_bills_vendor_number_old
--     rename to ux_supplier_bills_vendor_number;
--   create unique index ux_cash_transactions_reference_old
--     on public.cash_transactions (
--       tenant_id, cash_account_id, direction, lower(btrim(reference_number))
--     );
--   drop index public.ux_cash_transactions_reference;
--   alter index public.ux_cash_transactions_reference_old
--     rename to ux_cash_transactions_reference;
--   commit;
begin;

set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'supplier_bills'
      and indexname = 'ux_supplier_bills_vendor_number'
      and indexdef like '%reversed%'
  ) then
    create unique index ux_supplier_bills_vendor_number_live
      on public.supplier_bills (
        tenant_id,
        vendor_id,
        lower(btrim(vendor_bill_number))
      )
      where status <> 'reversed';
    drop index if exists public.ux_supplier_bills_vendor_number;
    alter index public.ux_supplier_bills_vendor_number_live
      rename to ux_supplier_bills_vendor_number;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'cash_transactions'
      and indexname = 'ux_cash_transactions_reference'
      and indexdef like '%reversed%'
  ) then
    create unique index ux_cash_transactions_reference_live
      on public.cash_transactions (
        tenant_id,
        cash_account_id,
        direction,
        lower(btrim(reference_number))
      )
      where status <> 'reversed';
    drop index if exists public.ux_cash_transactions_reference;
    alter index public.ux_cash_transactions_reference_live
      rename to ux_cash_transactions_reference;
  end if;
end
$$;

commit;
