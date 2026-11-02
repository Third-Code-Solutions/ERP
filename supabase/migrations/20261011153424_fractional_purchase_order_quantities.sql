-- ADR-041: widen without repricing historical Purchase Orders. Stock remains in micros.
-- Recovery: retain widened columns and roll forward; never narrow after fractional writes.
alter table public.po_line_items alter column quantity type numeric using quantity::numeric;
alter table public.po_line_items alter column received_qty type numeric using received_qty::numeric;

create or replace function public.guard_po_line_stock_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.quantity is distinct from old.quantity
     or new.quantity_micros is distinct from old.quantity_micros then
    if new.quantity < 0 or new.quantity > 2147483647 or new.quantity <> trunc(new.quantity, 6) then
      raise exception 'Purchase Order quantity requires at most six decimal places within the supported range' using errcode = '22003';
    end if;
    if tg_op = 'INSERT' then
      if new.quantity_micros = 0 then new.quantity_micros := (new.quantity * 1000000)::bigint; end if;
    elsif new.quantity is distinct from old.quantity
       and new.quantity_micros is not distinct from old.quantity_micros then
      new.quantity_micros := (new.quantity * 1000000)::bigint;
    end if;
    if new.quantity * 1000000 <> new.quantity_micros then
      raise exception 'Purchase Order quantity and stock micros must agree' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' then return new; end if;

  if coalesce(pg_catalog.current_setting('app.stock_receipt_projection', true), '') = 'on' then
    -- Existing receipt functions populate the legacy whole-unit projection. Derive it exactly.
    new.received_qty := new.received_quantity_micros::numeric / 1000000;
  elsif new.legacy_received_quantity_micros is distinct from old.legacy_received_quantity_micros
    or new.received_quantity_micros is distinct from old.received_quantity_micros
    or new.received_qty is distinct from old.received_qty
    or new.received_at is distinct from old.received_at
    or new.received_by is distinct from old.received_by then
    raise exception 'Received quantity is derived from posted Stock Receipts' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.stock_receipt_lines receipt_line
    where receipt_line.tenant_id = old.tenant_id and receipt_line.po_line_item_id = old.id
  ) and (
    new.tenant_id is distinct from old.tenant_id or new.po_id is distinct from old.po_id
    or new.material_item_id is distinct from old.material_item_id or new.uom_id is distinct from old.uom_id
    or new.quantity_micros is distinct from old.quantity_micros or new.unit_cost_cents is distinct from old.unit_cost_cents
  ) then
    raise exception 'Purchase Order stock terms are immutable after receipt' using errcode = '55000';
  end if;
  return new;
end $$;
