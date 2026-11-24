-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- S4b: a Purchase Order records that the supplier confirmed it.
--
-- The supplier confirms by email or phone and Procurement records it here. The
-- four columns are a record, not a workflow: no purchase_order_status value is
-- added or changed, and nothing reads them to gate a transition. Expand-only:
-- nullable columns, no default, no backfill, so existing rows and code that
-- does not know them are unaffected. The audit log carries who recorded it.
--   * supplier_confirmed_at: when the supplier confirmed (not when it was typed)
--   * supplier_confirmed_by_name: who at the supplier
--   * supplier_confirmed_channel: email | phone | in_person | other
--   * supplier_confirmed_note: free text (what was agreed, reference)
-- A confirmation has a time and a channel together, or neither.
--
-- Locks, held until commit: ADD COLUMN (nullable, no default: catalog only, no
-- rewrite) and ADD CONSTRAINT take ACCESS EXCLUSIVE on purchase_orders, so its
-- reads and writes wait for the commit. VALIDATE then scans the table once while
-- that lock is still held; no existing row sets these columns, so every row
-- passes. purchase_orders is small, so this is milliseconds.
--
-- Rollback (recorded confirmations are lost; take a dump of them first, and
-- revert the web code that reads the columns first):
--   begin;
--   set local lock_timeout = '5s';
--   set local statement_timeout = '60s';
--   alter table public.purchase_orders
--     drop constraint if exists purchase_orders_supplier_confirmation_check,
--     drop column if exists supplier_confirmed_note,
--     drop column if exists supplier_confirmed_channel,
--     drop column if exists supplier_confirmed_by_name,
--     drop column if exists supplier_confirmed_at;
--   delete from supabase_migrations.schema_migrations where version = '20261124180000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.purchase_orders
  add column if not exists supplier_confirmed_at timestamptz,
  add column if not exists supplier_confirmed_by_name varchar(255),
  add column if not exists supplier_confirmed_channel varchar(20),
  add column if not exists supplier_confirmed_note text;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_supplier_confirmation_check;
alter table public.purchase_orders
  add constraint purchase_orders_supplier_confirmation_check
  check (
    (supplier_confirmed_at is null) = (supplier_confirmed_channel is null)
    and (
      supplier_confirmed_channel is null
      or supplier_confirmed_channel in ('email', 'phone', 'in_person', 'other')
    )
  ) not valid;
-- No existing row sets these columns, so validation only takes a brief scan.
alter table public.purchase_orders
  validate constraint purchase_orders_supplier_confirmation_check;

commit;
