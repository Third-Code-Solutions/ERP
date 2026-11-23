-- Fractional CAD scope quantity (expand), the D-5 pattern applied to
-- scope_items.
--
-- scope_items.quantity is an integer, so a DXF floor area (12.3457 sqm)
-- cannot be stored and CAD evidence with fractional areas is refused.
-- This release only expands:
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
-- A later contract release drops the integer column and this trigger.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.scope_items
  add column if not exists quantity_decimal numeric(18,4);

create or replace function public.scope_items_sync_quantity()
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

revoke execute on function public.scope_items_sync_quantity() from public, anon, authenticated;
grant execute on function public.scope_items_sync_quantity() to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.scope_items'::regclass
      and tgname = 'scope_items_sync_quantity'
      and not tgisinternal
  ) then
    create trigger scope_items_sync_quantity
      before insert or update of quantity, quantity_decimal
      on public.scope_items
      for each row execute function public.scope_items_sync_quantity();
  end if;
end
$$;

-- Exact: every integer fits numeric(18,4).
update public.scope_items
   set quantity_decimal = quantity
 where quantity_decimal is null;

alter table public.scope_items
  alter column quantity_decimal set not null;

comment on column public.scope_items.quantity_decimal is
  'Scope quantity, numeric(18,4). Source of truth.';
comment on column public.scope_items.quantity is
  'Deprecated: legacy mirror, round(quantity_decimal). Dropped in a later contract release.';

commit;
