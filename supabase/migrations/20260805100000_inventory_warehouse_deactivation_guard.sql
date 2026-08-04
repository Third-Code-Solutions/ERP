-- M3.72: keep Warehouse deactivation and stock-ledger writes consistent.
-- Forward-only. Apply only after the hosted migration ledger is reconciled.

create or replace function public.guard_warehouse_deactivation_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantity_micros bigint;
  v_value_cents bigint;
begin
  if tg_op = 'UPDATE'
     and old.is_active
     and not new.is_active then
    select
      coalesce(sum(entry.quantity_delta_micros), 0)::bigint,
      coalesce(sum(entry.value_delta_cents), 0)::bigint
      into v_quantity_micros, v_value_cents
      from public.stock_ledger_entries entry
     where entry.tenant_id = old.tenant_id
       and entry.warehouse_id = old.id;

    if v_quantity_micros <> 0 or v_value_cents <> 0 then
      raise exception 'Warehouse cannot be deactivated while stock balance is nonzero'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists guard_warehouse_deactivation_balance
  on public.warehouses;
create trigger guard_warehouse_deactivation_balance
before update
on public.warehouses
for each row execute function public.guard_warehouse_deactivation_balance();

create or replace function public.guard_stock_ledger_warehouse_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_active boolean;
begin
  select warehouse.is_active
    into v_is_active
    from public.warehouses warehouse
   where warehouse.tenant_id = new.tenant_id
     and warehouse.id = new.warehouse_id
   for share;

  if not found then
    raise exception 'Stock Ledger Warehouse is invalid'
      using errcode = '23503';
  end if;

  if not coalesce(v_is_active, false)
     and new.event_type::text not in (
       'receipt_reversal',
       'movement_reversal'
     ) then
    raise exception 'Only stock reversals may write to an inactive Warehouse'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists guard_stock_ledger_warehouse_state
  on public.stock_ledger_entries;
create trigger guard_stock_ledger_warehouse_state
before insert
on public.stock_ledger_entries
for each row execute function public.guard_stock_ledger_warehouse_state();

revoke execute on function public.guard_warehouse_deactivation_balance()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_ledger_warehouse_state()
  from public, anon, authenticated;

grant execute on function public.guard_warehouse_deactivation_balance()
  to service_role;
grant execute on function public.guard_stock_ledger_warehouse_state()
  to service_role;
