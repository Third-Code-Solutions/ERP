-- The PO line stock guard covers INSERT, and the receipt projection flag lasts
-- one statement.
--
-- guard_po_line_stock_fields() (20260726234000_inventory_stock_foundation)
-- refuses a direct write of a PO line's received fields on UPDATE unless
-- post_stock_receipt() or reverse_stock_receipt() set
-- app.stock_receipt_projection. Two gaps, with no current caller:
-- 1. an INSERT could start a line already received;
-- 2. both functions set the flag transaction-locally and never reset it, so a
--    later PO line update in the same transaction skipped the guard.
-- The INSERT branch now refuses any received value, and a statement-level
-- trigger resets the flag after every UPDATE of po_line_items, so it covers
-- only the projection UPDATE that set it. The UPDATE branch is unchanged; no
-- persisted row changes. A caller that sets the flag must run its projection
-- as the next UPDATE of po_line_items; any UPDATE in between clears the flag
-- and the projection is refused (fails closed).
begin;

set local lock_timeout = '5s';

create or replace function public.guard_po_line_stock_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity_micros = 0 and new.quantity > 0 then
      new.quantity_micros := new.quantity::bigint * 1000000;
    end if;
    if new.legacy_received_quantity_micros <> 0
       or new.received_quantity_micros <> 0
       or new.received_qty <> 0
       or new.received_at is not null
       or new.received_by is not null then
      raise exception 'Received quantity is derived from posted Stock Receipts'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.quantity is distinct from old.quantity
     and new.quantity_micros is not distinct from old.quantity_micros then
    new.quantity_micros := new.quantity::bigint * 1000000;
  end if;

  if (
    new.legacy_received_quantity_micros
      is distinct from old.legacy_received_quantity_micros
    or
    new.received_quantity_micros is distinct from old.received_quantity_micros
    or new.received_qty is distinct from old.received_qty
    or new.received_at is distinct from old.received_at
    or new.received_by is distinct from old.received_by
  ) and coalesce(
    pg_catalog.current_setting('app.stock_receipt_projection', true),
    ''
  ) <> 'on' then
    raise exception 'Received quantity is derived from posted Stock Receipts'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.stock_receipt_lines receipt_line
    where receipt_line.tenant_id = old.tenant_id
      and receipt_line.po_line_item_id = old.id
  ) and (
    new.tenant_id is distinct from old.tenant_id
    or new.po_id is distinct from old.po_id
    or new.material_item_id is distinct from old.material_item_id
    or new.uom_id is distinct from old.uom_id
    or new.quantity_micros is distinct from old.quantity_micros
    or new.unit_cost_cents is distinct from old.unit_cost_cents
  ) then
    raise exception 'Purchase Order stock terms are immutable after receipt'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create or replace function public.reset_stock_receipt_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('app.stock_receipt_projection', '', true);
  return null;
end
$$;

drop trigger if exists reset_stock_receipt_projection
  on public.po_line_items;
create trigger reset_stock_receipt_projection
after update
on public.po_line_items
for each statement execute function public.reset_stock_receipt_projection();

-- Same privileges as the other trigger functions.
revoke execute on function public.guard_po_line_stock_fields()
  from public, anon, authenticated;
grant execute on function public.guard_po_line_stock_fields()
  to service_role;
revoke execute on function public.reset_stock_receipt_projection()
  from public, anon, authenticated;
grant execute on function public.reset_stock_receipt_projection()
  to service_role;

commit;
