-- WO-20: serialize warehouse/item balances before reversal evidence.
-- Reversal remains append-only, but cannot create a negative quantity or value
-- after dependent receipts, movements, adjustments, or consumption.

create or replace function public.reverse_stock_receipt(
  p_receipt_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_posting_date date default current_date
)
returns table (
  stock_receipt_id uuid,
  reversal_journal_entry_id uuid,
  reversal_journal_entry_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.stock_receipts%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_lock_key text;
  v_balance_quantity bigint;
  v_balance_value bigint;
  v_projected_quantity bigint;
  v_projected_value bigint;
  v_reversal_id uuid;
  v_reversal_number text;
  v_reversal_line record;
begin
  if length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Stock Receipt reversal reason is required'
      using errcode = '23514';
  end if;

  select receipt.*
    into v_receipt
    from public.stock_receipts receipt
   where receipt.id = p_receipt_id
   for update;

  if not found then
    raise exception 'Stock Receipt not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_receipt.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot reverse this Stock Receipt'
      using errcode = '42501';
  end if;

  if v_receipt.status <> 'posted'
     or v_receipt.posting_journal_entry_id is null then
    raise exception 'Only a posted Stock Receipt can be reversed'
      using errcode = '23514';
  end if;

  if p_posting_date < v_receipt.received_date then
    raise exception 'Reversal date cannot precede receipt date'
      using errcode = '23514';
  end if;

  perform 1
    from public.po_line_items po_line
   where po_line.tenant_id = v_receipt.tenant_id
     and po_line.po_id = v_receipt.purchase_order_id
   order by po_line.id
   for update;

  -- Match movement posting/reversal serialization. Every balance key is
  -- acquired in tenant/warehouse/item order before it is read.
  for v_lock_key in
    select lock_row.lock_key
    from (
      select distinct
        v_receipt.tenant_id::text
          || ':' || v_receipt.warehouse_id::text
          || ':' || receipt_line.material_item_id::text as lock_key
      from public.stock_receipt_lines receipt_line
      where receipt_line.stock_receipt_id = v_receipt.id
        and receipt_line.tenant_id = v_receipt.tenant_id
    ) lock_row
    order by lock_row.lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_lock_key, 0)
    );
  end loop;

  -- Group lines by warehouse/item so a multi-line receipt cannot pass
  -- per-line checks while its combined reversal would overdraw a balance.
  for v_reversal_line in
    select
      receipt_line.material_item_id,
      sum(receipt_line.quantity_micros)::bigint as quantity_micros,
      sum(receipt_line.line_total_cents)::bigint as value_cents
    from public.stock_receipt_lines receipt_line
    where receipt_line.stock_receipt_id = v_receipt.id
      and receipt_line.tenant_id = v_receipt.tenant_id
    group by receipt_line.material_item_id
    order by receipt_line.material_item_id
  loop
    select
      coalesce(sum(entry.quantity_delta_micros), 0)::bigint,
      coalesce(sum(entry.value_delta_cents), 0)::bigint
      into v_balance_quantity, v_balance_value
      from public.stock_ledger_entries entry
     where entry.tenant_id = v_receipt.tenant_id
       and entry.warehouse_id = v_receipt.warehouse_id
       and entry.material_item_id = v_reversal_line.material_item_id;

    v_projected_quantity :=
      v_balance_quantity - v_reversal_line.quantity_micros;
    v_projected_value :=
      v_balance_value - v_reversal_line.value_cents;

    if v_projected_quantity < 0 then
      raise exception 'Stock Receipt reversal exceeds available stock quantity'
        using errcode = '23514';
    end if;
    if v_projected_value < 0 then
      raise exception 'Stock Receipt reversal exceeds available stock value'
        using errcode = '23514';
    end if;
  end loop;

  perform pg_catalog.set_config(
    'app.stock_receipt_reversal',
    v_receipt.id::text,
    true
  );

  select
    reversal.reversal_entry_id,
    reversal.reversal_number
    into v_reversal_id, v_reversal_number
    from public.reverse_journal_entry(
      v_receipt.posting_journal_entry_id,
      p_actor_id,
      p_reason,
      p_posting_date
    ) reversal;

  perform pg_catalog.set_config(
    'app.stock_ledger_write',
    v_receipt.id::text,
    true
  );

  insert into public.stock_ledger_entries (
    tenant_id,
    event_type,
    stock_receipt_id,
    stock_receipt_line_id,
    warehouse_id,
    material_item_id,
    uom_id,
    occurred_on,
    quantity_delta_micros,
    value_delta_cents,
    created_by
  )
  select
    line.tenant_id,
    'receipt_reversal',
    line.stock_receipt_id,
    line.id,
    v_receipt.warehouse_id,
    line.material_item_id,
    line.uom_id,
    p_posting_date,
    -line.quantity_micros,
    -line.line_total_cents,
    p_actor_id
  from public.stock_receipt_lines line
  where line.stock_receipt_id = v_receipt.id
    and line.tenant_id = v_receipt.tenant_id;

  update public.stock_receipts
     set status = 'reversed',
         reversal_journal_entry_id = v_reversal_id,
         reversed_by = p_actor_id,
         reversed_at = pg_catalog.clock_timestamp(),
         reversal_reason = pg_catalog.btrim(p_reason),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_receipt.id;

  perform pg_catalog.set_config(
    'app.stock_receipt_projection',
    'on',
    true
  );

  update public.po_line_items po_line
     set received_quantity_micros = coalesce(totals.received_micros, 0),
         received_qty = (
           coalesce(totals.received_micros, 0) / 1000000
         )::integer,
         received_at = case
           when coalesce(totals.received_micros, 0) > 0
             then po_line.received_at
           else null
         end,
         received_by = case
           when coalesce(totals.received_micros, 0) > 0
             then po_line.received_by
           else null
         end
    from (
      select
        target.id as po_line_item_id,
        target.legacy_received_quantity_micros + coalesce(
          sum(receipt_line.quantity_micros) filter (
          where receipt.status = 'posted'
          ),
          0
        )::bigint as received_micros
      from public.po_line_items target
      left join public.stock_receipt_lines receipt_line
        on receipt_line.po_line_item_id = target.id
       and receipt_line.tenant_id = target.tenant_id
      left join public.stock_receipts receipt
        on receipt.id = receipt_line.stock_receipt_id
       and receipt.tenant_id = receipt_line.tenant_id
      where target.tenant_id = v_receipt.tenant_id
        and target.po_id = v_receipt.purchase_order_id
      group by target.id, target.legacy_received_quantity_micros
    ) totals
   where po_line.id = totals.po_line_item_id
     and po_line.tenant_id = v_receipt.tenant_id;

  return query
  select v_receipt.id, v_reversal_id, v_reversal_number;
end
$$;

create or replace function public.reverse_stock_movement(
  p_movement_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_reversal_date date default current_date
)
returns table (
  stock_movement_id uuid,
  reversal_journal_entry_id uuid,
  reversal_journal_entry_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.stock_movements%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_lock_key text;
  v_balance record;
  v_balance_quantity bigint;
  v_balance_value bigint;
  v_projected_quantity bigint;
  v_projected_value bigint;
  v_reversal_id uuid;
  v_reversal_number text;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Stock Movement reversal reason is required'
      using errcode = '22023';
  end if;
  select movement.*
    into v_movement
    from public.stock_movements movement
   where movement.id = p_movement_id
   for update;
  if not found then
    raise exception 'Stock Movement not found'
      using errcode = 'P0002';
  end if;
  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;
  if v_actor_tenant is null
     or v_actor_tenant <> v_movement.tenant_id
     or v_actor_role not in ('finance', 'admin', 'owner') then
    raise exception 'Actor cannot reverse this Stock Movement'
      using errcode = '42501';
  end if;
  if v_movement.status <> 'posted' then
    raise exception 'Only a posted Stock Movement can be reversed'
      using errcode = '23514';
  end if;
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object(
      'sub',
      p_actor_id,
      'role',
      'authenticated'
    )::text,
    true
  );
  if p_reversal_date < v_movement.movement_date then
    raise exception 'Reversal date cannot precede movement date'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.fiscal_periods period
    where period.tenant_id = v_movement.tenant_id
      and period.status = 'open'
      and p_reversal_date between period.starts_on and period.ends_on
  ) then
    raise exception 'Reversal date is not in an open fiscal period'
      using errcode = '23514';
  end if;

  for v_lock_key in
    select distinct
      entry.tenant_id::text
        || ':' || entry.warehouse_id::text
        || ':' || entry.material_item_id::text
    from public.stock_ledger_entries entry
    where entry.stock_movement_id = v_movement.id
      and entry.tenant_id = v_movement.tenant_id
      and entry.event_type <> 'movement_reversal'
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_lock_key, 0)
    );
  end loop;

  -- Validate the complete movement footprint per warehouse/item. A movement
  -- may have several evidence rows for one key, so per-entry checks would
  -- miss a combined negative quantity or value after reversal.
  for v_balance in
    select
      entry.tenant_id,
      entry.warehouse_id,
      entry.material_item_id,
      sum(entry.quantity_delta_micros)::bigint
        as reversal_quantity_micros,
      sum(entry.value_delta_cents)::bigint
        as reversal_value_cents
    from public.stock_ledger_entries entry
    where entry.stock_movement_id = v_movement.id
      and entry.tenant_id = v_movement.tenant_id
      and entry.event_type <> 'movement_reversal'
    group by entry.tenant_id, entry.warehouse_id, entry.material_item_id
    order by entry.tenant_id, entry.warehouse_id, entry.material_item_id
  loop
    select
      coalesce(sum(entry.quantity_delta_micros), 0)::bigint,
      coalesce(sum(entry.value_delta_cents), 0)::bigint
      into v_balance_quantity, v_balance_value
      from public.stock_ledger_entries entry
     where entry.tenant_id = v_balance.tenant_id
       and entry.warehouse_id = v_balance.warehouse_id
       and entry.material_item_id = v_balance.material_item_id;

    v_projected_quantity :=
      v_balance_quantity - v_balance.reversal_quantity_micros;
    v_projected_value :=
      v_balance_value - v_balance.reversal_value_cents;

    if v_projected_quantity < 0 then
      raise exception 'Stock Movement reversal exceeds available stock'
        using errcode = '23514';
    end if;
    if v_projected_value < 0 then
      raise exception 'Stock Movement reversal exceeds available stock value'
        using errcode = '23514';
    end if;
  end loop;

  perform pg_catalog.set_config(
    'app.stock_movement_reversal',
    v_movement.id::text,
    true
  );
  perform pg_catalog.set_config(
    'app.stock_ledger_write',
    v_movement.id::text,
    true
  );

  insert into public.stock_ledger_entries (
    tenant_id,
    event_type,
    stock_movement_id,
    stock_movement_line_id,
    reverses_stock_ledger_entry_id,
    warehouse_id,
    material_item_id,
    uom_id,
    occurred_on,
    quantity_delta_micros,
    value_delta_cents,
    created_by
  )
  select
    entry.tenant_id,
    'movement_reversal',
    entry.stock_movement_id,
    entry.stock_movement_line_id,
    entry.id,
    entry.warehouse_id,
    entry.material_item_id,
    entry.uom_id,
    p_reversal_date,
    -entry.quantity_delta_micros,
    -entry.value_delta_cents,
    p_actor_id
  from public.stock_ledger_entries entry
  where entry.stock_movement_id = v_movement.id
    and entry.tenant_id = v_movement.tenant_id
    and entry.event_type <> 'movement_reversal'
  order by entry.id;

  if v_movement.posting_journal_entry_id is not null then
    select
      reversal.reversal_entry_id,
      reversal.reversal_number
      into v_reversal_id, v_reversal_number
      from public.reverse_journal_entry(
        v_movement.posting_journal_entry_id,
        p_actor_id,
        p_reason,
        p_reversal_date
      ) reversal;
  end if;

  update public.stock_movements
     set status = 'reversed',
         reversal_journal_entry_id = v_reversal_id,
         reversed_by = p_actor_id,
         reversed_at = pg_catalog.clock_timestamp(),
         reversal_reason = btrim(p_reason),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_movement.id;

  return query
  select v_movement.id, v_reversal_id, v_reversal_number;
end
$$;
