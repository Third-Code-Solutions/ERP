-- ADR-042. Preserve historical reservations; enforce evidence for new consumption.
-- Recovery is forward-only: never remove posted inventory/accounting evidence.
alter table public.inventory_reservations
  add column consumption_movement_id uuid,
  add constraint inventory_reservations_consumption_tenant_fk
    foreign key (tenant_id,consumption_movement_id)
    references public.stock_movements(tenant_id,id) on delete restrict;
create unique index inventory_reservations_consumption_unique
  on public.inventory_reservations(tenant_id,consumption_movement_id)
  where consumption_movement_id is not null;

create function public.guard_reserved_stock_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_stock numeric; v_reserved numeric;
begin
  if new.quantity_delta_micros >= 0 then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.tenant_id::text||':'||new.warehouse_id::text||':'||new.material_item_id::text,0));
  select coalesce(sum(quantity_delta_micros),0) into v_stock
    from public.stock_ledger_entries where tenant_id=new.tenant_id
      and warehouse_id=new.warehouse_id and material_item_id=new.material_item_id;
  select coalesce(sum(quantity_micros),0) into v_reserved
    from public.inventory_reservations where tenant_id=new.tenant_id
      and warehouse_id=new.warehouse_id and material_item_id=new.material_item_id
      and status='active' and (expires_at is null or expires_at>clock_timestamp());
  if v_stock+new.quantity_delta_micros<v_reserved then
    raise exception 'Stock movement exceeds unreserved available quantity' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.guard_reserved_stock_balance() from public,anon,authenticated;
create trigger guard_reserved_stock_balance before insert on public.stock_ledger_entries
for each row execute function public.guard_reserved_stock_balance();

create function public.guard_inventory_reservation_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_stock numeric; v_reserved numeric;
begin
  if tg_op='UPDATE' then
    if (new.tenant_id,new.warehouse_id,new.material_item_id,new.uom_id,new.quantity_micros,new.project_id,new.cost_code_id,new.expires_at)
      is distinct from (old.tenant_id,old.warehouse_id,old.material_item_id,old.uom_id,old.quantity_micros,old.project_id,old.cost_code_id,old.expires_at) then
      raise exception 'Reservation terms are immutable; release and reserve again' using errcode='23514';
    end if;
    if old.status<>'active' and (new.status,new.consumption_movement_id) is distinct from (old.status,old.consumption_movement_id) then
      raise exception 'Terminal reservation cannot transition again' using errcode='23514';
    end if;
  elsif new.status<>'active' then
    raise exception 'New reservation must start active' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.tenant_id::text||':'||new.warehouse_id::text||':'||new.material_item_id::text,0));
  if new.status='active' then
    if not exists(select 1 from public.material_items where id=new.material_item_id
      and tenant_id=new.tenant_id and base_uom_id=new.uom_id and inventory_tracked and is_active) then
      raise exception 'Reservation requires an active tracked item in its base unit' using errcode='23514';
    end if;
    if new.expires_at is not null and new.expires_at<=clock_timestamp() then
      raise exception 'New reservation expiry must be in the future' using errcode='23514';
    end if;
    select coalesce(sum(quantity_delta_micros),0) into v_stock from public.stock_ledger_entries
      where tenant_id=new.tenant_id and warehouse_id=new.warehouse_id and material_item_id=new.material_item_id;
    select coalesce(sum(quantity_micros),0) into v_reserved from public.inventory_reservations
      where tenant_id=new.tenant_id and warehouse_id=new.warehouse_id and material_item_id=new.material_item_id
        and id<>new.id and status='active' and (expires_at is null or expires_at>clock_timestamp());
    if v_stock-v_reserved<new.quantity_micros then
      raise exception 'Reservation exceeds unreserved available quantity' using errcode='23514';
    end if;
  elsif new.status='expired' and (new.expires_at is null or new.expires_at>clock_timestamp()) then
    raise exception 'Reservation has not reached its expiry' using errcode='23514';
  elsif new.status='consumed' and old.status<>'consumed' and (new.consumption_movement_id is null or (new.expires_at is not null and new.expires_at<=clock_timestamp())) then
    raise exception 'Consumption requires a linked movement and unexpired reservation' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.guard_inventory_reservation_balance() from public,anon,authenticated;
create trigger guard_inventory_reservation_balance before insert or update on public.inventory_reservations
for each row execute function public.guard_inventory_reservation_balance();

create function public.verify_reservation_consumption_evidence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_reservation public.inventory_reservations%rowtype;
begin
  select * into v_reservation from public.inventory_reservations where id=new.id;
  if v_reservation.status<>'consumed' then return null; end if;
  if not exists(
    select 1 from public.stock_movements m
    join public.stock_movement_lines l on l.stock_movement_id=m.id and l.tenant_id=m.tenant_id
    join public.stock_ledger_entries e on e.stock_movement_id=m.id and e.stock_movement_line_id=l.id and e.tenant_id=m.tenant_id
    where m.id=v_reservation.consumption_movement_id and m.tenant_id=v_reservation.tenant_id
      and m.status='posted' and m.movement_type='consumption'
      and m.posting_journal_entry_id is not null
      and m.source_warehouse_id=v_reservation.warehouse_id
      and m.project_id is not distinct from v_reservation.project_id
      and l.material_item_id=v_reservation.material_item_id and l.uom_id=v_reservation.uom_id
      and l.cost_code_id is not distinct from v_reservation.cost_code_id
      and l.quantity_micros=v_reservation.quantity_micros
      and e.event_type='consumption' and e.quantity_delta_micros=-v_reservation.quantity_micros
      and (select count(*) from public.stock_movement_lines where stock_movement_id=m.id)=1
  ) then raise exception 'Consumed reservation requires matching posted stock and journal evidence' using errcode='23514'; end if;
  return null;
end $$;
revoke all on function public.verify_reservation_consumption_evidence() from public,anon,authenticated;
create constraint trigger verify_reservation_consumption_evidence
after update on public.inventory_reservations deferrable initially deferred
for each row when (new.status='consumed' and old.status<>'consumed')
execute function public.verify_reservation_consumption_evidence();
