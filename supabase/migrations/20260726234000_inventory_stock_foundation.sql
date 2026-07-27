-- Third Code ERP inventory receipt, perpetual stock, and valuation workflow.

create or replace function public.auth_can_read_inventory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users app_user
    where app_user.id = auth.uid()
      and app_user.tenant_id = public.auth_tenant_id()
      and app_user.role::text in (
        'finance',
        'procurement',
        'sd_pm_pe',
        'pm',
        'commercial',
        'admin',
        'owner'
      )
  )
$$;

create or replace function public.auth_can_manage_inventory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users app_user
    where app_user.id = auth.uid()
      and app_user.tenant_id = public.auth_tenant_id()
      and app_user.role::text in ('procurement', 'admin', 'owner')
  )
$$;

create or replace function public.guard_inventory_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'units_of_measure' then
    if tg_op = 'DELETE' and exists (
      select 1
      from public.stock_receipt_lines line
      where line.tenant_id = old.tenant_id
        and line.uom_id = old.id
    ) then
      raise exception 'UOM with stock evidence cannot be deleted'
        using errcode = '23503';
    end if;

    if tg_op = 'UPDATE' and exists (
      select 1
      from public.stock_receipt_lines line
      where line.tenant_id = old.tenant_id
        and line.uom_id = old.id
    ) and (
      new.tenant_id is distinct from old.tenant_id
      or new.code is distinct from old.code
      or new.decimal_places is distinct from old.decimal_places
    ) then
      raise exception 'Used UOM identity is immutable'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'warehouses' then
    if tg_op = 'DELETE' and exists (
      select 1
      from public.stock_receipts receipt
      where receipt.tenant_id = old.tenant_id
        and receipt.warehouse_id = old.id
    ) then
      raise exception 'Warehouse with receipt evidence cannot be deleted'
        using errcode = '23503';
    end if;

    if tg_op = 'UPDATE' and exists (
      select 1
      from public.stock_receipts receipt
      where receipt.tenant_id = old.tenant_id
        and receipt.warehouse_id = old.id
    ) and (
      new.tenant_id is distinct from old.tenant_id
      or new.code is distinct from old.code
      or new.project_id is distinct from old.project_id
      or new.created_by is distinct from old.created_by
    ) then
      raise exception 'Used Warehouse identity is immutable'
        using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

drop trigger if exists guard_units_of_measure
  on public.units_of_measure;
create trigger guard_units_of_measure
before update or delete
on public.units_of_measure
for each row execute function public.guard_inventory_master();

drop trigger if exists guard_warehouses
  on public.warehouses;
create trigger guard_warehouses
before update or delete
on public.warehouses
for each row execute function public.guard_inventory_master();

create or replace function public.guard_inventory_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and exists (
    select 1
    from public.stock_ledger_entries stock
    where stock.tenant_id = old.tenant_id
      and stock.material_item_id = old.id
  ) and (
    new.tenant_id is distinct from old.tenant_id
    or new.code is distinct from old.code
    or new.base_uom_id is distinct from old.base_uom_id
    or new.inventory_tracked is distinct from old.inventory_tracked
  ) then
    raise exception 'Item stock identity is immutable after posting'
      using errcode = '55000';
  end if;

  return new;
end
$$;

drop trigger if exists guard_inventory_item
  on public.material_items;
create trigger guard_inventory_item
before update
on public.material_items
for each row execute function public.guard_inventory_item();

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

drop trigger if exists guard_po_line_stock_fields
  on public.po_line_items;
create trigger guard_po_line_stock_fields
before insert or update
on public.po_line_items
for each row execute function public.guard_po_line_stock_fields();

create or replace function public.guard_stock_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po_project_id uuid;
  v_warehouse_project_id uuid;
  v_warehouse_active boolean;
  v_delivery_po_id uuid;
  v_delivery_status text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Posted Stock Receipt evidence cannot be deleted'
        using errcode = '55000';
    end if;
    return old;
  end if;

  select po.project_id
    into v_po_project_id
    from public.purchase_orders po
   where po.id = new.purchase_order_id
     and po.tenant_id = new.tenant_id;

  select warehouse.project_id, warehouse.is_active
    into v_warehouse_project_id, v_warehouse_active
    from public.warehouses warehouse
   where warehouse.id = new.warehouse_id
     and warehouse.tenant_id = new.tenant_id;

  if v_po_project_id is null or not coalesce(v_warehouse_active, false) then
    raise exception 'Stock Receipt requires a valid PO and active Warehouse'
      using errcode = '23514';
  end if;

  if v_warehouse_project_id is not null
     and v_warehouse_project_id <> v_po_project_id then
    raise exception 'Project Warehouse must match the Purchase Order project'
      using errcode = '23514';
  end if;

  if new.delivery_schedule_id is not null then
    select delivery.purchase_order_id, delivery.status::text
      into v_delivery_po_id, v_delivery_status
      from public.delivery_schedules delivery
     where delivery.id = new.delivery_schedule_id
       and delivery.tenant_id = new.tenant_id;

    if v_delivery_po_id is null
       or v_delivery_po_id <> new.purchase_order_id
       or v_delivery_status <> 'accepted' then
      raise exception 'Linked Delivery must be accepted for the same PO'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (
      new.tenant_id is distinct from old.tenant_id
      or new.warehouse_id is distinct from old.warehouse_id
      or new.purchase_order_id is distinct from old.purchase_order_id
      or new.delivery_schedule_id is distinct from old.delivery_schedule_id
      or new.internal_number is distinct from old.internal_number
      or new.supplier_delivery_reference
        is distinct from old.supplier_delivery_reference
      or new.received_date is distinct from old.received_date
      or new.currency is distinct from old.currency
      or new.notes is distinct from old.notes
      or new.posting_journal_entry_id
        is distinct from old.posting_journal_entry_id
      or new.posted_by is distinct from old.posted_by
      or new.posted_at is distinct from old.posted_at
      or new.created_by is distinct from old.created_by
    ) then
      raise exception 'Posted Stock Receipt terms are immutable'
        using errcode = '55000';
    end if;

    if old.status = 'draft' and new.status = 'posted' then
      if coalesce(
        pg_catalog.current_setting('app.stock_receipt_post', true),
        ''
      ) <> new.id::text then
        raise exception 'Use the Stock Receipt posting workflow'
          using errcode = '55000';
      end if;
    elsif old.status = 'posted' and new.status = 'reversed' then
      if coalesce(
        pg_catalog.current_setting('app.stock_receipt_reversal', true),
        ''
      ) <> new.id::text then
        raise exception 'Use the Stock Receipt reversal workflow'
          using errcode = '55000';
      end if;
    elsif new.status is distinct from old.status then
      raise exception 'Invalid Stock Receipt state transition'
        using errcode = '23514';
    end if;

    if old.status = 'reversed' then
      raise exception 'Reversed Stock Receipt evidence is immutable'
        using errcode = '55000';
    end if;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

create or replace function public.guard_stock_receipt_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.stock_receipts%rowtype;
  v_po_line public.po_line_items%rowtype;
  v_item public.material_items%rowtype;
begin
  select receipt.*
    into v_receipt
    from public.stock_receipts receipt
   where receipt.id = coalesce(
     new.stock_receipt_id,
     old.stock_receipt_id
   );

  if not found or v_receipt.status <> 'draft' then
    raise exception 'Only draft Stock Receipt lines can change'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select line.*
    into v_po_line
    from public.po_line_items line
   where line.id = new.po_line_item_id
     and line.tenant_id = new.tenant_id;

  select item.*
    into v_item
    from public.material_items item
   where item.id = new.material_item_id
     and item.tenant_id = new.tenant_id;

  if new.tenant_id <> v_receipt.tenant_id
     or v_po_line.id is null
     or v_po_line.po_id <> v_receipt.purchase_order_id
     or v_po_line.material_item_id is null
     or v_po_line.uom_id is null
     or v_po_line.material_item_id <> new.material_item_id
     or v_po_line.uom_id <> new.uom_id
     or v_po_line.unit_cost_cents <> new.unit_cost_cents
     or v_item.id is null
     or not v_item.is_active
     or not v_item.inventory_tracked
     or v_item.base_uom_id <> new.uom_id then
    raise exception 'Receipt line must match a tracked PO Item, UOM, and cost'
      using errcode = '23514';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

create or replace function public.guard_stock_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.stock_receipt_lines%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Stock Ledger Entries are append-only'
      using errcode = '55000';
  end if;

  if coalesce(
    pg_catalog.current_setting('app.stock_ledger_write', true),
    ''
  ) <> new.stock_receipt_id::text then
    raise exception 'Use a Stock Receipt workflow to write the Stock Ledger'
      using errcode = '42501';
  end if;

  select line.*
    into v_line
    from public.stock_receipt_lines line
   where line.id = new.stock_receipt_line_id
     and line.tenant_id = new.tenant_id;

  if v_line.id is null
     or v_line.stock_receipt_id <> new.stock_receipt_id
     or v_line.material_item_id <> new.material_item_id
     or v_line.uom_id <> new.uom_id
     or pg_catalog.abs(new.quantity_delta_micros)
       <> v_line.quantity_micros
     or pg_catalog.abs(new.value_delta_cents)
       <> v_line.line_total_cents then
    raise exception 'Stock Ledger Entry must exactly mirror its receipt line'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists guard_stock_receipt
  on public.stock_receipts;
create trigger guard_stock_receipt
before insert or update or delete
on public.stock_receipts
for each row execute function public.guard_stock_receipt();

drop trigger if exists guard_stock_receipt_line
  on public.stock_receipt_lines;
create trigger guard_stock_receipt_line
before insert or update or delete
on public.stock_receipt_lines
for each row execute function public.guard_stock_receipt_line();

drop trigger if exists guard_stock_ledger_entry
  on public.stock_ledger_entries;
create trigger guard_stock_ledger_entry
before insert or update or delete
on public.stock_ledger_entries
for each row execute function public.guard_stock_ledger_entry();

create or replace function public.guard_stock_journal_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
begin
  if new.source_type = 'reversal'
     and new.reverses_entry_id is not null then
    select original.reference_id
      into v_receipt_id
      from public.journal_entries original
     where original.id = new.reverses_entry_id
       and original.tenant_id = new.tenant_id
       and original.reference_type = 'stock_receipt';

    if v_receipt_id is not null
       and coalesce(
         pg_catalog.current_setting('app.stock_receipt_reversal', true),
         ''
       ) <> v_receipt_id::text then
      raise exception 'Use the Stock Receipt reversal workflow'
        using errcode = '55000';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists guard_stock_journal_reversal
  on public.journal_entries;
create trigger guard_stock_journal_reversal
before insert
on public.journal_entries
for each row execute function public.guard_stock_journal_reversal();

create or replace function public.post_stock_receipt(
  p_receipt_id uuid,
  p_actor_id uuid,
  p_posting_date date default current_date
)
returns table (
  stock_receipt_id uuid,
  receipt_number text,
  journal_entry_id uuid,
  journal_entry_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.stock_receipts%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_po public.purchase_orders%rowtype;
  v_line_count integer;
  v_total_value bigint;
  v_inventory_account_id uuid;
  v_grni_account_id uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_sequence_key text;
  v_sequence_value bigint;
  v_receipt_number text;
  line_record record;
begin
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
    raise exception 'Actor cannot post this Stock Receipt'
      using errcode = '42501';
  end if;

  if v_receipt.status <> 'draft' then
    raise exception 'Only a draft Stock Receipt can be posted'
      using errcode = '23514';
  end if;

  if p_posting_date < v_receipt.received_date then
    raise exception 'Posting date cannot precede receipt date'
      using errcode = '23514';
  end if;

  select po.*
    into v_po
    from public.purchase_orders po
   where po.id = v_receipt.purchase_order_id
     and po.tenant_id = v_receipt.tenant_id
   for update;

  if v_po.id is null
     or v_po.status::text not in (
       'issued',
       'confirmed',
       'partial_delivery',
       'delivered',
       'fully_delivered'
     ) then
    raise exception 'Stock Receipt requires an issued Purchase Order'
      using errcode = '23514';
  end if;

  perform 1
    from public.po_line_items po_line
   where po_line.tenant_id = v_receipt.tenant_id
     and po_line.po_id = v_receipt.purchase_order_id
   order by po_line.id
   for update;

  select
    count(*)::integer,
    coalesce(sum(line.line_total_cents), 0)::bigint
    into v_line_count, v_total_value
    from public.stock_receipt_lines line
   where line.stock_receipt_id = v_receipt.id
     and line.tenant_id = v_receipt.tenant_id;

  if v_line_count = 0 or v_total_value <= 0 then
    raise exception 'Stock Receipt requires positive-valued lines'
      using errcode = '23514';
  end if;

  for line_record in
    select
      receipt_line.po_line_item_id,
      receipt_line.quantity_micros,
      po_line.quantity_micros as ordered_micros,
      po_line.legacy_received_quantity_micros + coalesce((
        select sum(previous_line.quantity_micros)
        from public.stock_receipt_lines previous_line
        join public.stock_receipts previous_receipt
          on previous_receipt.id = previous_line.stock_receipt_id
         and previous_receipt.tenant_id = previous_line.tenant_id
        where previous_line.tenant_id = receipt_line.tenant_id
          and previous_line.po_line_item_id =
            receipt_line.po_line_item_id
          and previous_receipt.status = 'posted'
      ), 0)::bigint as previously_received_micros
    from public.stock_receipt_lines receipt_line
    join public.po_line_items po_line
      on po_line.id = receipt_line.po_line_item_id
     and po_line.tenant_id = receipt_line.tenant_id
    where receipt_line.stock_receipt_id = v_receipt.id
      and receipt_line.tenant_id = v_receipt.tenant_id
    order by receipt_line.po_line_item_id
  loop
    if line_record.previously_received_micros
       + line_record.quantity_micros
       > line_record.ordered_micros then
      raise exception 'Stock Receipt quantity exceeds remaining PO quantity'
        using errcode = '23514';
    end if;
  end loop;

  select account.id
    into v_inventory_account_id
    from public.ledger_accounts account
   where account.tenant_id = v_receipt.tenant_id
     and account.system_key = 'inventory'
     and account.account_type = 'asset'
     and account.normal_balance = 'debit'
     and account.is_active
   for share;

  select account.id
    into v_grni_account_id
    from public.ledger_accounts account
   where account.tenant_id = v_receipt.tenant_id
     and account.system_key = 'goods_received_not_invoiced'
     and account.account_type = 'liability'
     and account.normal_balance = 'credit'
     and account.is_active
   for share;

  if v_inventory_account_id is null or v_grni_account_id is null then
    raise exception 'Inventory and Goods Received Not Invoiced accounts required'
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

  insert into public.journal_entries (
    tenant_id,
    posting_date,
    description,
    reference_type,
    reference_id,
    currency,
    source_type,
    created_by
  )
  values (
    v_receipt.tenant_id,
    p_posting_date,
    'Stock Receipt valuation',
    'stock_receipt',
    v_receipt.id,
    v_receipt.currency,
    'system',
    p_actor_id
  )
  returning id into v_journal_id;

  insert into public.journal_lines (
    tenant_id,
    journal_entry_id,
    ledger_account_id,
    project_id,
    vendor_id,
    line_number,
    description,
    debit_cents,
    credit_cents
  )
  values
    (
      v_receipt.tenant_id,
      v_journal_id,
      v_inventory_account_id,
      v_po.project_id,
      v_po.vendor_id,
      1,
      'Inventory received',
      v_total_value,
      0
    ),
    (
      v_receipt.tenant_id,
      v_journal_id,
      v_grni_account_id,
      v_po.project_id,
      v_po.vendor_id,
      2,
      'Goods received, not invoiced',
      0,
      v_total_value
    );

  select posted.posted_number
    into v_journal_number
    from public.post_journal_entry(v_journal_id, p_actor_id) posted;

  v_sequence_key :=
    'stock_receipt:' || pg_catalog.to_char(v_receipt.received_date, 'YYYY');

  insert into public.financial_sequences (
    tenant_id,
    sequence_key,
    next_value,
    updated_at
  )
  values (
    v_receipt.tenant_id,
    v_sequence_key,
    2,
    pg_catalog.clock_timestamp()
  )
  on conflict (tenant_id, sequence_key)
  do update set
    next_value = public.financial_sequences.next_value + 1,
    updated_at = pg_catalog.clock_timestamp()
  returning next_value - 1
    into v_sequence_value;

  v_receipt_number := pg_catalog.format(
    'SR-%s-%s',
    pg_catalog.to_char(v_receipt.received_date, 'YYYY'),
    pg_catalog.lpad(v_sequence_value::text, 6, '0')
  );

  perform pg_catalog.set_config(
    'app.stock_receipt_post',
    v_receipt.id::text,
    true
  );

  update public.stock_receipts
     set status = 'posted',
         internal_number = v_receipt_number,
         posting_journal_entry_id = v_journal_id,
         posted_by = p_actor_id,
         posted_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_receipt.id;

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
    'receipt',
    line.stock_receipt_id,
    line.id,
    v_receipt.warehouse_id,
    line.material_item_id,
    line.uom_id,
    v_receipt.received_date,
    line.quantity_micros,
    line.line_total_cents,
    p_actor_id
  from public.stock_receipt_lines line
  where line.stock_receipt_id = v_receipt.id
    and line.tenant_id = v_receipt.tenant_id;

  perform pg_catalog.set_config(
    'app.stock_receipt_projection',
    'on',
    true
  );

  update public.po_line_items po_line
     set received_quantity_micros = totals.received_micros,
         received_qty = (totals.received_micros / 1000000)::integer,
         received_at = pg_catalog.clock_timestamp(),
         received_by = p_actor_id
    from (
      select
        receipt_line.po_line_item_id,
        po_line.legacy_received_quantity_micros
          + sum(receipt_line.quantity_micros)::bigint as received_micros
      from public.stock_receipt_lines receipt_line
      join public.stock_receipts receipt
        on receipt.id = receipt_line.stock_receipt_id
       and receipt.tenant_id = receipt_line.tenant_id
      join public.po_line_items po_line
        on po_line.id = receipt_line.po_line_item_id
       and po_line.tenant_id = receipt_line.tenant_id
      where receipt_line.tenant_id = v_receipt.tenant_id
        and receipt.purchase_order_id = v_receipt.purchase_order_id
        and receipt.status = 'posted'
      group by
        receipt_line.po_line_item_id,
        po_line.legacy_received_quantity_micros
    ) totals
   where po_line.id = totals.po_line_item_id
     and po_line.tenant_id = v_receipt.tenant_id;

  return query
  select
    v_receipt.id,
    v_receipt_number,
    v_journal_id,
    v_journal_number;
end
$$;

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
  v_reversal_id uuid;
  v_reversal_number text;
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

create or replace function public.cortex_mirror_inventory_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_tenant_id uuid;
  v_ref_id uuid;
  v_node_type public.cortex_node_type;
  v_title text;
  v_summary text;
begin
  begin
    v_row := case
      when tg_op = 'DELETE' then to_jsonb(old)
      else to_jsonb(new)
    end;
    v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid;
    v_ref_id := nullif(v_row ->> 'id', '')::uuid;

    if v_tenant_id is null or v_ref_id is null then
      return coalesce(new, old);
    end if;

    if tg_table_name = 'warehouses' then
      v_node_type := 'warehouse';
      v_title := v_row ->> 'name';
      v_summary := pg_catalog.format(
        '%s | %s',
        v_row ->> 'code',
        case when (v_row ->> 'is_active')::boolean
          then 'Active' else 'Inactive' end
      );
    elsif tg_table_name = 'stock_receipts' then
      v_node_type := 'stock_receipt';
      v_title := coalesce(
        v_row ->> 'internal_number',
        'Draft Stock Receipt'
      );
      v_summary := pg_catalog.format(
        '%s | received %s',
        v_row ->> 'status',
        v_row ->> 'received_date'
      );
    else
      v_node_type := 'stock_ledger_entry';
      v_title := pg_catalog.format(
        '%s stock movement',
        v_row ->> 'event_type'
      );
      v_summary := pg_catalog.format(
        '%s micro-units | %s minor units',
        v_row ->> 'quantity_delta_micros',
        v_row ->> 'value_delta_cents'
      );
    end if;

    if tg_op = 'DELETE' then
      perform public.cortex_close_node(
        v_tenant_id,
        tg_table_name,
        v_ref_id,
        auth.uid(),
        tg_table_name || ':delete'
      );
      return old;
    end if;

    perform public.cortex_upsert_node(
      v_tenant_id,
      v_node_type,
      tg_table_name,
      v_ref_id,
      v_title,
      v_summary,
      v_row
        - 'created_by'
        - 'posted_by'
        - 'reversed_by',
      auth.uid(),
      tg_table_name || ':' || lower(tg_op)
    );
  exception
    when others then
      raise warning 'cortex_mirror_inventory_record failed: %', sqlerrm;
  end;

  return coalesce(new, old);
end
$$;

drop trigger if exists cortex_mirror_warehouse
  on public.warehouses;
create trigger cortex_mirror_warehouse
after insert or update or delete
on public.warehouses
for each row execute function public.cortex_mirror_inventory_record();

drop trigger if exists cortex_mirror_stock_receipt
  on public.stock_receipts;
create trigger cortex_mirror_stock_receipt
after insert or update or delete
on public.stock_receipts
for each row execute function public.cortex_mirror_inventory_record();

drop trigger if exists cortex_mirror_stock_ledger_entry
  on public.stock_ledger_entries;
create trigger cortex_mirror_stock_ledger_entry
after insert
on public.stock_ledger_entries
for each row execute function public.cortex_mirror_inventory_record();

create or replace function public.auth_can_read_cortex_node_type(
  p_node_type public.cortex_node_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_node_type::text in (
      'invoice',
      'supplier_bill',
      'cash_account',
      'cash_transaction',
      'bank_statement',
      'fiscal_period',
      'ledger_account',
      'journal_entry',
      'journal_line'
    ) then exists (
      select 1
      from public.users app_user
      where app_user.id = auth.uid()
        and app_user.tenant_id = public.auth_tenant_id()
        and app_user.role::text in ('finance', 'admin', 'owner')
    )
    when p_node_type::text in (
      'warehouse',
      'stock_receipt',
      'stock_ledger_entry'
    ) then public.auth_can_read_inventory()
    else true
  end
$$;

drop trigger if exists audit_units_of_measure
  on public.units_of_measure;
create trigger audit_units_of_measure
after insert or update or delete
on public.units_of_measure
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_warehouses
  on public.warehouses;
create trigger audit_warehouses
after insert or update or delete
on public.warehouses
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_stock_receipts
  on public.stock_receipts;
create trigger audit_stock_receipts
after insert or update or delete
on public.stock_receipts
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_stock_receipt_lines
  on public.stock_receipt_lines;
create trigger audit_stock_receipt_lines
after insert or update or delete
on public.stock_receipt_lines
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_stock_ledger_entries
  on public.stock_ledger_entries;
create trigger audit_stock_ledger_entries
after insert
on public.stock_ledger_entries
for each row execute function public.audit_log_trigger();

alter table public.units_of_measure enable row level security;
alter table public.units_of_measure force row level security;
alter table public.warehouses enable row level security;
alter table public.warehouses force row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipts force row level security;
alter table public.stock_receipt_lines enable row level security;
alter table public.stock_receipt_lines force row level security;
alter table public.stock_ledger_entries enable row level security;
alter table public.stock_ledger_entries force row level security;

create policy units_of_measure_inventory_read
on public.units_of_measure
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_inventory()
);

create policy units_of_measure_inventory_insert
on public.units_of_measure
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and public.auth_can_manage_inventory()
);

create policy units_of_measure_inventory_update
on public.units_of_measure
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
);

create policy units_of_measure_inventory_delete
on public.units_of_measure
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
);

create policy warehouses_inventory_read
on public.warehouses
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_inventory()
);

create policy warehouses_inventory_insert
on public.warehouses
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and public.auth_can_manage_inventory()
);

create policy warehouses_inventory_update
on public.warehouses
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
);

create policy warehouses_inventory_delete
on public.warehouses
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
);

create policy stock_receipts_inventory_read
on public.stock_receipts
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_inventory()
);

create policy stock_receipts_inventory_insert
on public.stock_receipts
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and public.auth_can_manage_inventory()
);

create policy stock_receipts_inventory_update
on public.stock_receipts
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_inventory()
)
with check (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_inventory()
);

create policy stock_receipts_inventory_delete
on public.stock_receipts
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_inventory()
);

create policy stock_receipt_lines_inventory_read
on public.stock_receipt_lines
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_inventory()
);

create policy stock_receipt_lines_inventory_insert
on public.stock_receipt_lines
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_receipts receipt
    where receipt.id = stock_receipt_lines.stock_receipt_id
      and receipt.tenant_id = stock_receipt_lines.tenant_id
      and receipt.status = 'draft'
  )
);

create policy stock_receipt_lines_inventory_update
on public.stock_receipt_lines
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_receipts receipt
    where receipt.id = stock_receipt_lines.stock_receipt_id
      and receipt.tenant_id = stock_receipt_lines.tenant_id
      and receipt.status = 'draft'
  )
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_receipts receipt
    where receipt.id = stock_receipt_lines.stock_receipt_id
      and receipt.tenant_id = stock_receipt_lines.tenant_id
      and receipt.status = 'draft'
  )
);

create policy stock_receipt_lines_inventory_delete
on public.stock_receipt_lines
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_receipts receipt
    where receipt.id = stock_receipt_lines.stock_receipt_id
      and receipt.tenant_id = stock_receipt_lines.tenant_id
      and receipt.status = 'draft'
  )
);

create policy stock_ledger_entries_inventory_read
on public.stock_ledger_entries
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_inventory()
);

revoke all privileges on table public.units_of_measure
  from public, anon, authenticated;
revoke all privileges on table public.warehouses
  from public, anon, authenticated;
revoke all privileges on table public.stock_receipts
  from public, anon, authenticated;
revoke all privileges on table public.stock_receipt_lines
  from public, anon, authenticated;
revoke all privileges on table public.stock_ledger_entries
  from public, anon, authenticated;

grant select on table public.units_of_measure
  to authenticated;
grant insert (
  tenant_id,
  code,
  name,
  decimal_places,
  is_active,
  created_by
)
on table public.units_of_measure
to authenticated;
grant update (
  code,
  name,
  decimal_places,
  is_active,
  updated_at
)
on table public.units_of_measure
to authenticated;
grant delete on table public.units_of_measure
  to authenticated;

grant select on table public.warehouses
  to authenticated;
grant insert (
  tenant_id,
  code,
  name,
  project_id,
  is_active,
  created_by
)
on table public.warehouses
to authenticated;
grant update (
  code,
  name,
  project_id,
  is_active,
  updated_at
)
on table public.warehouses
to authenticated;
grant delete on table public.warehouses
  to authenticated;

grant select on table public.stock_receipts
  to authenticated;
grant insert (
  tenant_id,
  warehouse_id,
  purchase_order_id,
  delivery_schedule_id,
  supplier_delivery_reference,
  status,
  received_date,
  currency,
  notes,
  created_by
)
on table public.stock_receipts
to authenticated;
grant update (
  warehouse_id,
  purchase_order_id,
  delivery_schedule_id,
  supplier_delivery_reference,
  received_date,
  currency,
  notes,
  updated_at
)
on table public.stock_receipts
to authenticated;
grant delete on table public.stock_receipts
  to authenticated;

grant select on table public.stock_receipt_lines
  to authenticated;
grant insert (
  tenant_id,
  stock_receipt_id,
  po_line_item_id,
  material_item_id,
  uom_id,
  line_number,
  description,
  quantity_micros,
  unit_cost_cents,
  line_total_cents
)
on table public.stock_receipt_lines
to authenticated;
grant update (
  po_line_item_id,
  material_item_id,
  uom_id,
  line_number,
  description,
  quantity_micros,
  unit_cost_cents,
  line_total_cents,
  updated_at
)
on table public.stock_receipt_lines
to authenticated;
grant delete on table public.stock_receipt_lines
  to authenticated;

grant select on table public.stock_ledger_entries
  to authenticated;

grant all privileges on table public.units_of_measure
  to service_role;
grant all privileges on table public.warehouses
  to service_role;
grant all privileges on table public.stock_receipts
  to service_role;
grant all privileges on table public.stock_receipt_lines
  to service_role;
grant all privileges on table public.stock_ledger_entries
  to service_role;

revoke execute on function public.auth_can_read_inventory()
  from public, anon;
revoke execute on function public.auth_can_manage_inventory()
  from public, anon;
revoke execute on function public.guard_inventory_master()
  from public, anon, authenticated;
revoke execute on function public.guard_inventory_item()
  from public, anon, authenticated;
revoke execute on function public.guard_po_line_stock_fields()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_receipt()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_receipt_line()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_ledger_entry()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_journal_reversal()
  from public, anon, authenticated;
revoke execute on function public.post_stock_receipt(uuid, uuid, date)
  from public, anon, authenticated;
revoke execute on function public.reverse_stock_receipt(
  uuid,
  uuid,
  text,
  date
)
  from public, anon, authenticated;
revoke execute on function public.cortex_mirror_inventory_record()
  from public, anon, authenticated;

grant execute on function public.auth_can_read_inventory()
  to authenticated, service_role;
grant execute on function public.auth_can_manage_inventory()
  to authenticated, service_role;
grant execute on function public.guard_inventory_master()
  to service_role;
grant execute on function public.guard_inventory_item()
  to service_role;
grant execute on function public.guard_po_line_stock_fields()
  to service_role;
grant execute on function public.guard_stock_receipt()
  to service_role;
grant execute on function public.guard_stock_receipt_line()
  to service_role;
grant execute on function public.guard_stock_ledger_entry()
  to service_role;
grant execute on function public.guard_stock_journal_reversal()
  to service_role;
grant execute on function public.post_stock_receipt(uuid, uuid, date)
  to service_role;
grant execute on function public.reverse_stock_receipt(
  uuid,
  uuid,
  text,
  date
)
  to service_role;
grant execute on function public.cortex_mirror_inventory_record()
  to service_role;
