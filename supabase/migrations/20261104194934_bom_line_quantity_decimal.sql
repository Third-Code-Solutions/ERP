-- D-5 (expand): a BOQ quantity is numeric(18,4), not an integer.
--
-- bom_line_items.quantity is an integer, so takeoff areas (12.5 sqm) and the
-- PRD 4.2 example (0.10 cu.m) cannot be stored. Production is treated as live
-- (docs/erp/STATE.md), so this release only expands:
--   * quantity_decimal numeric(18,4) is added, backfilled exactly from
--     quantity, then made NOT NULL. It is the source of truth from now on.
--   * The integer column stays, so a rollback to code that only knows
--     `quantity` keeps working. A BEFORE trigger keeps both in step:
--       - a write that sets quantity_decimal also sets
--         quantity = round(quantity_decimal) (half-up for these
--         non-negative values; it raises past the integer range);
--       - a write that sets only quantity (old code mid-deploy or after a
--         rollback) also sets quantity_decimal = quantity.
--   * quantity_decimal has no default on purpose: NULL on insert is how the
--     trigger recognises an integer-only writer.
-- The integer column has no CHECK constraint, so none is added here.
-- A later contract release drops the integer column and this trigger.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.bom_line_items
  add column if not exists quantity_decimal numeric(18,4);

create or replace function public.bom_line_items_sync_quantity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity_decimal is null then
      new.quantity_decimal := new.quantity;
    else
      new.quantity := pg_catalog.round(new.quantity_decimal)::integer;
    end if;
  elsif new.quantity_decimal is distinct from old.quantity_decimal then
    new.quantity := pg_catalog.round(new.quantity_decimal)::integer;
  elsif new.quantity is distinct from old.quantity then
    new.quantity_decimal := new.quantity;
  end if;
  return new;
end
$$;

revoke execute on function public.bom_line_items_sync_quantity() from public, anon, authenticated;
grant execute on function public.bom_line_items_sync_quantity() to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.bom_line_items'::regclass
      and tgname = 'bom_line_items_sync_quantity'
      and not tgisinternal
  ) then
    create trigger bom_line_items_sync_quantity
      before insert or update of quantity, quantity_decimal
      on public.bom_line_items
      for each row execute function public.bom_line_items_sync_quantity();
  end if;
end
$$;

-- Exact: every integer fits numeric(18,4).
update public.bom_line_items
   set quantity_decimal = quantity
 where quantity_decimal is null;

alter table public.bom_line_items
  alter column quantity_decimal set not null;

comment on column public.bom_line_items.quantity_decimal is
  'D-5: BOQ quantity, numeric(18,4). Source of truth for amounts.';
comment on column public.bom_line_items.quantity is
  'Deprecated (D-5): legacy mirror, round(quantity_decimal). Dropped in a later contract release.';

commit;
