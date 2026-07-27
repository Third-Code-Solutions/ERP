-- Third Code ERP controlled Stock Movement workflow.

create or replace function public.guard_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_active boolean;
  v_source_project_id uuid;
  v_target_active boolean;
  v_target_project_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only a draft Stock Movement can be deleted'
        using errcode = '55000';
    end if;
    perform pg_catalog.set_config(
      'app.stock_movement_delete',
      old.id::text,
      true
    );
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.created_by is distinct from old.created_by then
      raise exception 'Stock Movement ownership is immutable'
        using errcode = '55000';
    end if;

    if old.status = 'reversed' then
      raise exception 'Reversed Stock Movement evidence is immutable'
        using errcode = '55000';
    end if;

    if old.status = 'posted' then
      if new.status <> 'reversed'
         or pg_catalog.current_setting(
           'app.stock_movement_reversal',
           true
         ) is distinct from new.id::text then
        raise exception 'Use the Stock Movement reversal workflow'
          using errcode = '55000';
      end if;
      if new.movement_type is distinct from old.movement_type
         or new.internal_number is distinct from old.internal_number
         or new.source_warehouse_id is distinct from old.source_warehouse_id
         or new.target_warehouse_id is distinct from old.target_warehouse_id
         or new.project_id is distinct from old.project_id
         or new.movement_date is distinct from old.movement_date
         or new.currency is distinct from old.currency
         or new.reason is distinct from old.reason
         or new.posting_journal_entry_id
           is distinct from old.posting_journal_entry_id
         or new.posted_by is distinct from old.posted_by
         or new.posted_at is distinct from old.posted_at
         or new.reversed_by is null
         or new.reversed_at is null
         or length(btrim(coalesce(new.reversal_reason, ''))) < 3
         or (
           new.movement_type = 'transfer'
           and new.reversal_journal_entry_id is not null
         )
         or (
           new.movement_type <> 'transfer'
           and new.reversal_journal_entry_id is null
         ) then
        raise exception 'Stock Movement reversal evidence is invalid'
          using errcode = '55000';
      end if;
      new.reversal_reason := btrim(new.reversal_reason);
      new.updated_at := pg_catalog.clock_timestamp();
      return new;
    end if;

    if new.status = 'draft' then
      if new.internal_number is distinct from old.internal_number
         or new.posting_journal_entry_id
           is distinct from old.posting_journal_entry_id
         or new.reversal_journal_entry_id
           is distinct from old.reversal_journal_entry_id
         or new.posted_by is distinct from old.posted_by
         or new.posted_at is distinct from old.posted_at
         or new.reversed_by is distinct from old.reversed_by
         or new.reversed_at is distinct from old.reversed_at
         or new.reversal_reason is distinct from old.reversal_reason then
        raise exception 'Stock Movement workflow evidence is system-managed'
          using errcode = '55000';
      end if;
    elsif new.status = 'posted' then
      if pg_catalog.current_setting(
        'app.stock_movement_post',
        true
      ) is distinct from new.id::text then
        raise exception 'Use the Stock Movement posting workflow'
          using errcode = '55000';
      end if;
      if new.movement_type is distinct from old.movement_type
         or new.source_warehouse_id is distinct from old.source_warehouse_id
         or new.target_warehouse_id is distinct from old.target_warehouse_id
         or new.project_id is distinct from old.project_id
         or new.movement_date is distinct from old.movement_date
         or new.currency is distinct from old.currency
         or new.reason is distinct from old.reason
         or new.internal_number is null
         or new.posted_by is null
         or new.posted_at is null
         or (
           new.movement_type = 'transfer'
           and new.posting_journal_entry_id is not null
         )
         or (
           new.movement_type <> 'transfer'
           and new.posting_journal_entry_id is null
         )
         or new.reversal_journal_entry_id is not null
         or new.reversed_by is not null
         or new.reversed_at is not null
         or new.reversal_reason is not null then
        raise exception 'Stock Movement posting evidence is invalid'
          using errcode = '55000';
      end if;
    else
      raise exception 'Use the Stock Movement posting workflow'
        using errcode = '55000';
    end if;
  end if;

  select warehouse.is_active, warehouse.project_id
    into v_source_active, v_source_project_id
    from public.warehouses warehouse
   where warehouse.id = new.source_warehouse_id
     and warehouse.tenant_id = new.tenant_id;
  if not coalesce(v_source_active, false) then
    raise exception 'Stock Movement requires an active source Warehouse'
      using errcode = '23514';
  end if;

  if new.movement_type = 'transfer' then
    if new.target_warehouse_id is null
       or new.target_warehouse_id = new.source_warehouse_id then
      raise exception 'Transfer requires a different target Warehouse'
        using errcode = '23514';
    end if;
    select warehouse.is_active, warehouse.project_id
      into v_target_active, v_target_project_id
      from public.warehouses warehouse
     where warehouse.id = new.target_warehouse_id
       and warehouse.tenant_id = new.tenant_id;
    if not coalesce(v_target_active, false) then
      raise exception 'Transfer requires an active target Warehouse'
        using errcode = '23514';
    end if;
    if (v_source_project_id is not null or v_target_project_id is not null)
       and new.project_id is null then
      raise exception 'Site Warehouse transfer requires its Project'
        using errcode = '23514';
    end if;
    if new.project_id is not null and (
      (
        v_source_project_id is not null
        and v_source_project_id <> new.project_id
      )
      or
      (
        v_target_project_id is not null
        and v_target_project_id <> new.project_id
      )
    ) then
      raise exception 'Transfer Warehouse must match its Project'
        using errcode = '23514';
    end if;
  elsif new.movement_type = 'consumption' then
    if new.target_warehouse_id is not null or new.project_id is null then
      raise exception 'Consumption requires one source Warehouse and Project'
        using errcode = '23514';
    end if;
    if v_source_project_id is not null
       and v_source_project_id <> new.project_id then
      raise exception 'Consumption Warehouse must match its Project'
        using errcode = '23514';
    end if;
  elsif new.movement_type = 'adjustment' then
    if new.target_warehouse_id is not null then
      raise exception 'Adjustment uses one source Warehouse'
        using errcode = '23514';
    end if;
    if v_source_project_id is not null and (
      new.project_id is null
      or v_source_project_id <> new.project_id
    ) then
      raise exception 'Site Warehouse adjustment requires its Project'
        using errcode = '23514';
    end if;
  end if;

  if new.project_id is not null and not exists (
    select 1
    from public.projects project
    where project.id = new.project_id
      and project.tenant_id = new.tenant_id
  ) then
    raise exception 'Stock Movement Project is invalid'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and (
    new.status <> 'draft'
    or new.internal_number is not null
    or new.posting_journal_entry_id is not null
    or new.reversal_journal_entry_id is not null
    or new.posted_by is not null
    or new.posted_at is not null
    or new.reversed_by is not null
    or new.reversed_at is not null
    or new.reversal_reason is not null
  ) then
    raise exception 'New Stock Movement must start as a draft'
      using errcode = '23514';
  end if;

  new.reason := btrim(new.reason);
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

create or replace function public.guard_stock_movement_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.stock_movements%rowtype;
  v_item public.material_items%rowtype;
  v_code public.cost_codes%rowtype;
  v_movement_id uuid;
  v_tenant_id uuid;
  v_post_write boolean;
begin
  if tg_op = 'DELETE' then
    if coalesce(
      pg_catalog.current_setting('app.stock_movement_delete', true),
      ''
    ) = old.stock_movement_id::text then
      return old;
    end if;
    v_movement_id := old.stock_movement_id;
    v_tenant_id := old.tenant_id;
  else
    v_movement_id := new.stock_movement_id;
    v_tenant_id := new.tenant_id;
  end if;

  select movement.*
    into v_movement
    from public.stock_movements movement
   where movement.id = v_movement_id
     and movement.tenant_id = v_tenant_id;
  if not found or v_movement.status <> 'draft' then
    raise exception 'Only draft Stock Movement lines can change'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  v_post_write := coalesce(
    pg_catalog.current_setting('app.stock_movement_post', true),
    ''
  ) = v_movement.id::text;

  if tg_op = 'INSERT' and (
    new.posted_unit_cost_cents is not null
    or new.posted_value_cents is not null
  ) and not v_post_write then
    raise exception 'Posted Stock Movement value is workflow-derived'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' and (
    new.posted_unit_cost_cents
      is distinct from old.posted_unit_cost_cents
    or new.posted_value_cents is distinct from old.posted_value_cents
  ) and not v_post_write then
    raise exception 'Posted Stock Movement value is workflow-derived'
      using errcode = '55000';
  end if;

  select item.*
    into v_item
    from public.material_items item
   where item.id = new.material_item_id
     and item.tenant_id = new.tenant_id;
  if not found
     or not v_item.is_active
     or not v_item.inventory_tracked
     or v_item.base_uom_id <> new.uom_id then
    raise exception 'Stock Movement requires an active tracked Item and base UOM'
      using errcode = '23514';
  end if;

  if v_movement.movement_type in ('transfer', 'consumption') then
    if new.quantity_micros <= 0
       or new.declared_unit_cost_cents is not null then
      raise exception 'Transfer and consumption quantity must be positive'
        using errcode = '23514';
    end if;
  else
    if new.quantity_micros > 0
       and new.declared_unit_cost_cents is null then
      raise exception 'Positive adjustment requires an evidenced unit cost'
        using errcode = '23514';
    end if;
    if new.quantity_micros < 0
       and new.declared_unit_cost_cents is not null then
      raise exception 'Negative adjustment uses current weighted-average cost'
        using errcode = '23514';
    end if;
  end if;

  if v_movement.movement_type = 'consumption' then
    if new.cost_code_id is null then
      raise exception 'Consumption requires a Cost Code'
        using errcode = '23514';
    end if;
    select cost_code.*
      into v_code
      from public.cost_codes cost_code
     where cost_code.id = new.cost_code_id
       and cost_code.tenant_id = new.tenant_id;
    if not found or not v_code.is_active then
      raise exception 'Consumption requires an active Cost Code'
        using errcode = '23514';
    end if;
  elsif new.cost_code_id is not null then
    select cost_code.*
      into v_code
      from public.cost_codes cost_code
     where cost_code.id = new.cost_code_id
       and cost_code.tenant_id = new.tenant_id;
    if not found or not v_code.is_active then
      raise exception 'Stock Movement Cost Code must be active'
        using errcode = '23514';
    end if;
  end if;

  new.description := btrim(new.description);
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

create or replace function public.guard_inventory_movement_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'units_of_measure' then
    if tg_op = 'DELETE' and exists (
      select 1
      from public.stock_movement_lines line
      where line.tenant_id = old.tenant_id
        and line.uom_id = old.id
    ) then
      raise exception 'UOM with Stock Movement evidence cannot be deleted'
        using errcode = '23503';
    end if;
    if tg_op = 'UPDATE' and exists (
      select 1
      from public.stock_movement_lines line
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
      from public.stock_movements movement
      where movement.tenant_id = old.tenant_id
        and (
          movement.source_warehouse_id = old.id
          or movement.target_warehouse_id = old.id
        )
    ) then
      raise exception 'Warehouse with Stock Movement evidence cannot be deleted'
        using errcode = '23503';
    end if;
    if tg_op = 'UPDATE' and exists (
      select 1
      from public.stock_movements movement
      where movement.tenant_id = old.tenant_id
        and (
          movement.source_warehouse_id = old.id
          or movement.target_warehouse_id = old.id
        )
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
  v_receipt_line public.stock_receipt_lines%rowtype;
  v_movement public.stock_movements%rowtype;
  v_movement_line public.stock_movement_lines%rowtype;
  v_original public.stock_ledger_entries%rowtype;
  v_write_id text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Stock Ledger Entries are append-only'
      using errcode = '55000';
  end if;

  v_write_id := coalesce(
    pg_catalog.current_setting('app.stock_ledger_write', true),
    ''
  );

  if new.stock_receipt_id is not null then
    if v_write_id <> new.stock_receipt_id::text then
      raise exception 'Use a Stock Receipt workflow to write the Stock Ledger'
        using errcode = '42501';
    end if;
    select line.*
      into v_receipt_line
      from public.stock_receipt_lines line
     where line.id = new.stock_receipt_line_id
       and line.tenant_id = new.tenant_id;
    if not found
       or v_receipt_line.stock_receipt_id <> new.stock_receipt_id
       or v_receipt_line.material_item_id <> new.material_item_id
       or v_receipt_line.uom_id <> new.uom_id
       or pg_catalog.abs(new.quantity_delta_micros)
         <> v_receipt_line.quantity_micros
       or pg_catalog.abs(new.value_delta_cents)
         <> v_receipt_line.line_total_cents
       or (
         new.event_type = 'receipt'
         and (
           new.quantity_delta_micros <= 0
           or new.value_delta_cents <= 0
         )
       )
       or (
         new.event_type = 'receipt_reversal'
         and (
           new.quantity_delta_micros >= 0
           or new.value_delta_cents >= 0
         )
       )
       or new.event_type not in ('receipt', 'receipt_reversal') then
      raise exception 'Stock Ledger Entry must exactly mirror its receipt line'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.stock_movement_id is null
     or v_write_id <> new.stock_movement_id::text then
    raise exception 'Use a Stock Movement workflow to write the Stock Ledger'
      using errcode = '42501';
  end if;

  select movement.*
    into v_movement
    from public.stock_movements movement
   where movement.id = new.stock_movement_id
     and movement.tenant_id = new.tenant_id;
  select line.*
    into v_movement_line
    from public.stock_movement_lines line
   where line.id = new.stock_movement_line_id
     and line.tenant_id = new.tenant_id;

  if v_movement.id is null
     or v_movement_line.id is null
     or v_movement_line.stock_movement_id <> v_movement.id
     or v_movement_line.material_item_id <> new.material_item_id
     or v_movement_line.uom_id <> new.uom_id
     or v_movement_line.posted_value_cents is null
     or pg_catalog.abs(new.quantity_delta_micros)
       <> pg_catalog.abs(v_movement_line.quantity_micros)
     or pg_catalog.abs(new.value_delta_cents)
       <> v_movement_line.posted_value_cents then
    raise exception 'Stock Ledger Entry must exactly mirror its movement line'
      using errcode = '23514';
  end if;

  if new.event_type = 'movement_reversal' then
    if new.reverses_stock_ledger_entry_id is null then
      raise exception 'Movement reversal requires original Stock Ledger evidence'
        using errcode = '23514';
    end if;
    select original.*
      into v_original
      from public.stock_ledger_entries original
     where original.id = new.reverses_stock_ledger_entry_id
       and original.tenant_id = new.tenant_id;
    if not found
       or v_original.event_type = 'movement_reversal'
       or v_original.stock_movement_id <> new.stock_movement_id
       or v_original.stock_movement_line_id
         <> new.stock_movement_line_id
       or v_original.warehouse_id <> new.warehouse_id
       or v_original.material_item_id <> new.material_item_id
       or v_original.uom_id <> new.uom_id
       or new.quantity_delta_micros
         <> -v_original.quantity_delta_micros
       or new.value_delta_cents <> -v_original.value_delta_cents then
      raise exception 'Movement reversal must negate original Stock Ledger evidence'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.reverses_stock_ledger_entry_id is not null or (
    v_movement.movement_type = 'transfer'
    and not (
      (
        new.event_type = 'transfer_out'
        and new.warehouse_id = v_movement.source_warehouse_id
        and new.quantity_delta_micros < 0
        and new.value_delta_cents < 0
      )
      or
      (
        new.event_type = 'transfer_in'
        and new.warehouse_id = v_movement.target_warehouse_id
        and new.quantity_delta_micros > 0
        and new.value_delta_cents > 0
      )
    )
  ) or (
    v_movement.movement_type = 'consumption'
    and not (
      new.event_type = 'consumption'
      and new.warehouse_id = v_movement.source_warehouse_id
      and new.quantity_delta_micros < 0
      and new.value_delta_cents < 0
    )
  ) or (
    v_movement.movement_type = 'adjustment'
    and not (
      new.event_type = 'adjustment'
      and new.warehouse_id = v_movement.source_warehouse_id
      and (
        (
          v_movement_line.quantity_micros > 0
          and new.quantity_delta_micros > 0
          and new.value_delta_cents > 0
        )
        or
        (
          v_movement_line.quantity_micros < 0
          and new.quantity_delta_micros < 0
          and new.value_delta_cents < 0
        )
      )
    )
  ) then
    raise exception 'Stock Ledger movement event is invalid'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function public.guard_stock_journal_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference_type text;
  v_reference_id uuid;
begin
  if new.source_type = 'reversal'
     and new.reverses_entry_id is not null then
    select original.reference_type, original.reference_id
      into v_reference_type, v_reference_id
      from public.journal_entries original
     where original.id = new.reverses_entry_id
       and original.tenant_id = new.tenant_id;

    if v_reference_type = 'stock_receipt'
       and coalesce(
         pg_catalog.current_setting('app.stock_receipt_reversal', true),
         ''
       ) <> v_reference_id::text then
      raise exception 'Use the Stock Receipt reversal workflow'
        using errcode = '55000';
    end if;
    if v_reference_type = 'stock_movement'
       and coalesce(
         pg_catalog.current_setting('app.stock_movement_reversal', true),
         ''
       ) <> v_reference_id::text then
      raise exception 'Use the Stock Movement reversal workflow'
        using errcode = '55000';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.post_stock_movement(
  p_movement_id uuid,
  p_actor_id uuid
)
returns table (
  stock_movement_id uuid,
  movement_number text,
  journal_entry_id uuid,
  journal_entry_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement public.stock_movements%rowtype;
  v_line public.stock_movement_lines%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_lock_key text;
  v_balance_quantity bigint;
  v_balance_value bigint;
  v_quantity bigint;
  v_unit_cost bigint;
  v_value bigint;
  v_inventory_account_id uuid;
  v_consumption_account_id uuid;
  v_adjustment_gain_account_id uuid;
  v_adjustment_loss_account_id uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_number text;
  v_prefix text;
  v_previous_number text;
begin
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
    raise exception 'Actor cannot post this Stock Movement'
      using errcode = '42501';
  end if;
  if v_movement.status <> 'draft' then
    raise exception 'Only a draft Stock Movement can be posted'
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
  if not exists (
    select 1
    from public.stock_movement_lines line
    where line.stock_movement_id = v_movement.id
      and line.tenant_id = v_movement.tenant_id
  ) then
    raise exception 'Stock Movement requires at least one line'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.fiscal_periods period
    where period.tenant_id = v_movement.tenant_id
      and period.status = 'open'
      and v_movement.movement_date
        between period.starts_on and period.ends_on
  ) then
    raise exception 'Movement date is not in an open fiscal period'
      using errcode = '23514';
  end if;

  for v_lock_key in
    select lock_row.lock_key
    from (
      select distinct
        v_movement.tenant_id::text
          || ':' || warehouse_id::text
          || ':' || line.material_item_id::text as lock_key
      from public.stock_movement_lines line
      cross join lateral (
        values (v_movement.source_warehouse_id),
          (v_movement.target_warehouse_id)
      ) warehouse(warehouse_id)
      where line.stock_movement_id = v_movement.id
        and line.tenant_id = v_movement.tenant_id
        and warehouse_id is not null
    ) lock_row
    order by lock_row.lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_lock_key, 0)
    );
  end loop;

  perform pg_catalog.set_config(
    'app.stock_movement_post',
    v_movement.id::text,
    true
  );

  for v_line in
    select line.*
    from public.stock_movement_lines line
    where line.stock_movement_id = v_movement.id
      and line.tenant_id = v_movement.tenant_id
    order by line.material_item_id
    for update
  loop
    v_quantity := pg_catalog.abs(v_line.quantity_micros);
    if v_movement.movement_type = 'adjustment'
       and v_line.quantity_micros > 0 then
      v_unit_cost := v_line.declared_unit_cost_cents;
      v_value := pg_catalog.round(
        v_quantity::numeric * v_unit_cost::numeric / 1000000
      )::bigint;
    else
      select
        coalesce(sum(entry.quantity_delta_micros), 0)::bigint,
        coalesce(sum(entry.value_delta_cents), 0)::bigint
        into v_balance_quantity, v_balance_value
        from public.stock_ledger_entries entry
       where entry.tenant_id = v_movement.tenant_id
         and entry.warehouse_id = v_movement.source_warehouse_id
         and entry.material_item_id = v_line.material_item_id;

      if v_balance_quantity < v_quantity
         or v_balance_quantity <= 0
         or v_balance_value <= 0 then
        raise exception 'Stock Movement quantity exceeds available stock'
          using errcode = '23514';
      end if;
      if v_balance_quantity = v_quantity then
        v_value := v_balance_value;
      else
        v_value := pg_catalog.round(
          v_balance_value::numeric
            * v_quantity::numeric
            / v_balance_quantity::numeric
        )::bigint;
      end if;
      v_unit_cost := pg_catalog.round(
        v_value::numeric * 1000000 / v_quantity::numeric
      )::bigint;
    end if;
    if v_value <= 0 or v_unit_cost <= 0 then
      raise exception 'Stock Movement value must be positive'
        using errcode = '23514';
    end if;

    update public.stock_movement_lines
       set posted_unit_cost_cents = v_unit_cost,
           posted_value_cents = v_value,
           updated_at = pg_catalog.clock_timestamp()
     where id = v_line.id;
  end loop;

  perform pg_catalog.set_config(
    'app.stock_ledger_write',
    v_movement.id::text,
    true
  );

  if v_movement.movement_type = 'transfer' then
    insert into public.stock_ledger_entries (
      tenant_id,
      event_type,
      stock_movement_id,
      stock_movement_line_id,
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
      event.event_type::public.stock_ledger_event_type,
      line.stock_movement_id,
      line.id,
      event.warehouse_id,
      line.material_item_id,
      line.uom_id,
      v_movement.movement_date,
      event.sign * pg_catalog.abs(line.quantity_micros),
      event.sign * line.posted_value_cents,
      p_actor_id
    from public.stock_movement_lines line
    cross join lateral (
      values
        ('transfer_out', v_movement.source_warehouse_id, -1),
        ('transfer_in', v_movement.target_warehouse_id, 1)
    ) event(event_type, warehouse_id, sign)
    where line.stock_movement_id = v_movement.id
      and line.tenant_id = v_movement.tenant_id;
  elsif v_movement.movement_type = 'consumption' then
    insert into public.stock_ledger_entries (
      tenant_id,
      event_type,
      stock_movement_id,
      stock_movement_line_id,
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
      'consumption',
      line.stock_movement_id,
      line.id,
      v_movement.source_warehouse_id,
      line.material_item_id,
      line.uom_id,
      v_movement.movement_date,
      -pg_catalog.abs(line.quantity_micros),
      -line.posted_value_cents,
      p_actor_id
    from public.stock_movement_lines line
    where line.stock_movement_id = v_movement.id
      and line.tenant_id = v_movement.tenant_id;
  else
    insert into public.stock_ledger_entries (
      tenant_id,
      event_type,
      stock_movement_id,
      stock_movement_line_id,
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
      'adjustment',
      line.stock_movement_id,
      line.id,
      v_movement.source_warehouse_id,
      line.material_item_id,
      line.uom_id,
      v_movement.movement_date,
      line.quantity_micros,
      case
        when line.quantity_micros > 0 then line.posted_value_cents
        else -line.posted_value_cents
      end,
      p_actor_id
    from public.stock_movement_lines line
    where line.stock_movement_id = v_movement.id
      and line.tenant_id = v_movement.tenant_id;
  end if;

  if v_movement.movement_type <> 'transfer' then
    select account.id
      into v_inventory_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_movement.tenant_id
       and account.system_key = 'inventory'
       and account.is_active;
    if v_inventory_account_id is null then
      raise exception 'Inventory account required for Stock Movement'
        using errcode = '23514';
    end if;

    if v_movement.movement_type = 'consumption' then
      select account.id
        into v_consumption_account_id
        from public.ledger_accounts account
       where account.tenant_id = v_movement.tenant_id
         and account.system_key = 'inventory_consumption'
         and account.is_active;
      if v_consumption_account_id is null then
        raise exception 'Inventory Consumption account required'
          using errcode = '23514';
      end if;
    else
      if exists (
        select 1
        from public.stock_movement_lines line
        where line.stock_movement_id = v_movement.id
          and line.quantity_micros > 0
      ) then
        select account.id
          into v_adjustment_gain_account_id
          from public.ledger_accounts account
         where account.tenant_id = v_movement.tenant_id
           and account.system_key = 'inventory_adjustment_gain'
           and account.is_active;
        if v_adjustment_gain_account_id is null then
          raise exception 'Inventory Adjustment Gain account required'
            using errcode = '23514';
        end if;
      end if;
      if exists (
        select 1
        from public.stock_movement_lines line
        where line.stock_movement_id = v_movement.id
          and line.quantity_micros < 0
      ) then
        select account.id
          into v_adjustment_loss_account_id
          from public.ledger_accounts account
         where account.tenant_id = v_movement.tenant_id
           and account.system_key = 'inventory_adjustment_loss'
           and account.is_active;
        if v_adjustment_loss_account_id is null then
          raise exception 'Inventory Adjustment Loss account required'
            using errcode = '23514';
        end if;
      end if;
    end if;

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
      v_movement.tenant_id,
      v_movement.movement_date,
      pg_catalog.format(
        'Stock %s: %s',
        v_movement.movement_type::text,
        v_movement.reason
      ),
      'stock_movement',
      v_movement.id,
      v_movement.currency,
      'system',
      p_actor_id
    )
    returning id into v_journal_id;

    if v_movement.movement_type = 'consumption' then
      insert into public.journal_lines (
        tenant_id,
        journal_entry_id,
        ledger_account_id,
        project_id,
        line_number,
        description,
        debit_cents,
        credit_cents
      )
      select
        line.tenant_id,
        v_journal_id,
        case when side.line_side = 1
          then v_consumption_account_id
          else v_inventory_account_id
        end,
        case when side.line_side = 1
          then v_movement.project_id
          else null
        end,
        (line.line_number * 2) - (2 - side.line_side),
        line.description,
        case when side.line_side = 1
          then line.posted_value_cents
          else 0
        end,
        case when side.line_side = 2
          then line.posted_value_cents
          else 0
        end
      from public.stock_movement_lines line
      cross join (values (1), (2)) side(line_side)
      where line.stock_movement_id = v_movement.id
        and line.tenant_id = v_movement.tenant_id;
    else
      insert into public.journal_lines (
        tenant_id,
        journal_entry_id,
        ledger_account_id,
        project_id,
        line_number,
        description,
        debit_cents,
        credit_cents
      )
      select
        line.tenant_id,
        v_journal_id,
        case
          when line.quantity_micros > 0 and side.line_side = 1
            then v_inventory_account_id
          when line.quantity_micros > 0 and side.line_side = 2
            then v_adjustment_gain_account_id
          when line.quantity_micros < 0 and side.line_side = 1
            then v_adjustment_loss_account_id
          else v_inventory_account_id
        end,
        v_movement.project_id,
        (line.line_number * 2) - (2 - side.line_side),
        line.description,
        case
          when side.line_side = 1 then line.posted_value_cents
          else 0
        end,
        case
          when side.line_side = 2 then line.posted_value_cents
          else 0
        end
      from public.stock_movement_lines line
      cross join (values (1), (2)) side(line_side)
      where line.stock_movement_id = v_movement.id
        and line.tenant_id = v_movement.tenant_id;
    end if;

    select posted.posted_number
      into v_journal_number
      from public.post_journal_entry(v_journal_id, p_actor_id) posted;
  end if;

  v_prefix := 'SM-' || extract(year from v_movement.movement_date)::int
    || '-';
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_movement.tenant_id::text || ':' || v_prefix,
      0
    )
  );
  select movement.internal_number
    into v_previous_number
    from public.stock_movements movement
   where movement.tenant_id = v_movement.tenant_id
     and movement.internal_number like v_prefix || '%'
   order by movement.internal_number desc
   limit 1;
  v_number := v_prefix || pg_catalog.lpad(
    (
      coalesce(
        nullif(
          pg_catalog.regexp_replace(
            coalesce(v_previous_number, ''),
            '^.*-',
            ''
          ),
          ''
        )::integer,
        0
      ) + 1
    )::text,
    6,
    '0'
  );

  update public.stock_movements
     set status = 'posted',
         internal_number = v_number,
         posting_journal_entry_id = v_journal_id,
         posted_by = p_actor_id,
         posted_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_movement.id;

  return query
  select v_movement.id, v_number, v_journal_id, v_journal_number;
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
  v_entry public.stock_ledger_entries%rowtype;
  v_balance_quantity bigint;
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

  for v_entry in
    select entry.*
    from public.stock_ledger_entries entry
    where entry.stock_movement_id = v_movement.id
      and entry.tenant_id = v_movement.tenant_id
      and entry.event_type <> 'movement_reversal'
    order by entry.warehouse_id, entry.material_item_id, entry.id
  loop
    if v_entry.quantity_delta_micros > 0 then
      select coalesce(sum(entry.quantity_delta_micros), 0)::bigint
        into v_balance_quantity
        from public.stock_ledger_entries entry
       where entry.tenant_id = v_entry.tenant_id
         and entry.warehouse_id = v_entry.warehouse_id
         and entry.material_item_id = v_entry.material_item_id;
      if v_balance_quantity < v_entry.quantity_delta_micros then
        raise exception 'Stock Movement reversal exceeds available stock'
          using errcode = '23514';
      end if;
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

drop trigger if exists guard_stock_movement
  on public.stock_movements;
create trigger guard_stock_movement
before insert or update or delete
on public.stock_movements
for each row execute function public.guard_stock_movement();

drop trigger if exists guard_stock_movement_line
  on public.stock_movement_lines;
create trigger guard_stock_movement_line
before insert or update or delete
on public.stock_movement_lines
for each row execute function public.guard_stock_movement_line();

drop trigger if exists guard_inventory_movement_uom
  on public.units_of_measure;
create trigger guard_inventory_movement_uom
before update or delete
on public.units_of_measure
for each row execute function public.guard_inventory_movement_master();

drop trigger if exists guard_inventory_movement_warehouse
  on public.warehouses;
create trigger guard_inventory_movement_warehouse
before update or delete
on public.warehouses
for each row execute function public.guard_inventory_movement_master();

drop trigger if exists guard_stock_ledger_entry
  on public.stock_ledger_entries;
create trigger guard_stock_ledger_entry
before insert or update or delete
on public.stock_ledger_entries
for each row execute function public.guard_stock_ledger_entry();

drop trigger if exists guard_stock_journal_reversal
  on public.journal_entries;
create trigger guard_stock_journal_reversal
before insert
on public.journal_entries
for each row execute function public.guard_stock_journal_reversal();

drop trigger if exists audit_stock_movements
  on public.stock_movements;
create trigger audit_stock_movements
after insert or update or delete
on public.stock_movements
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_stock_movement_lines
  on public.stock_movement_lines;
create trigger audit_stock_movement_lines
after insert or update or delete
on public.stock_movement_lines
for each row execute function public.audit_log_trigger();

drop trigger if exists cortex_mirror_stock_movement
  on public.stock_movements;
create trigger cortex_mirror_stock_movement
after insert or update or delete
on public.stock_movements
for each row execute function public.cortex_mirror_generic(
  'stock_movement',
  'reason',
  'status'
);

alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;
alter table public.stock_movement_lines enable row level security;
alter table public.stock_movement_lines force row level security;

create policy stock_movements_inventory_read
on public.stock_movements for select to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_inventory()
);
create policy stock_movements_inventory_insert
on public.stock_movements for insert to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and public.auth_can_manage_inventory()
);
create policy stock_movements_inventory_update
on public.stock_movements for update to authenticated
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
create policy stock_movements_inventory_delete
on public.stock_movements for delete to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_inventory()
);

create policy stock_movement_lines_inventory_read
on public.stock_movement_lines for select to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_inventory()
);
create policy stock_movement_lines_inventory_insert
on public.stock_movement_lines for insert to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_movements movement
    where movement.id = stock_movement_lines.stock_movement_id
      and movement.tenant_id = stock_movement_lines.tenant_id
      and movement.status = 'draft'
  )
);
create policy stock_movement_lines_inventory_update
on public.stock_movement_lines for update to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_movements movement
    where movement.id = stock_movement_lines.stock_movement_id
      and movement.tenant_id = stock_movement_lines.tenant_id
      and movement.status = 'draft'
  )
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_movements movement
    where movement.id = stock_movement_lines.stock_movement_id
      and movement.tenant_id = stock_movement_lines.tenant_id
      and movement.status = 'draft'
  )
);
create policy stock_movement_lines_inventory_delete
on public.stock_movement_lines for delete to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_inventory()
  and exists (
    select 1
    from public.stock_movements movement
    where movement.id = stock_movement_lines.stock_movement_id
      and movement.tenant_id = stock_movement_lines.tenant_id
      and movement.status = 'draft'
  )
);

revoke all privileges on table public.stock_movements
  from public, anon, authenticated;
revoke all privileges on table public.stock_movement_lines
  from public, anon, authenticated;

grant select, delete on table public.stock_movements to authenticated;
grant insert (
  tenant_id,
  movement_type,
  source_warehouse_id,
  target_warehouse_id,
  project_id,
  movement_date,
  currency,
  reason,
  created_by
) on table public.stock_movements to authenticated;
grant update (
  movement_type,
  source_warehouse_id,
  target_warehouse_id,
  project_id,
  movement_date,
  currency,
  reason,
  updated_at
) on table public.stock_movements to authenticated;

grant select, delete on table public.stock_movement_lines
  to authenticated;
grant insert (
  tenant_id,
  stock_movement_id,
  material_item_id,
  uom_id,
  cost_code_id,
  line_number,
  description,
  quantity_micros,
  declared_unit_cost_cents
) on table public.stock_movement_lines to authenticated;
grant update (
  material_item_id,
  uom_id,
  cost_code_id,
  line_number,
  description,
  quantity_micros,
  declared_unit_cost_cents,
  updated_at
) on table public.stock_movement_lines to authenticated;

grant all privileges on table public.stock_movements to service_role;
grant all privileges on table public.stock_movement_lines to service_role;

revoke execute on function public.guard_stock_movement()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_movement_line()
  from public, anon, authenticated;
revoke execute on function public.guard_inventory_movement_master()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_ledger_entry()
  from public, anon, authenticated;
revoke execute on function public.guard_stock_journal_reversal()
  from public, anon, authenticated;
revoke execute on function public.post_stock_movement(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.reverse_stock_movement(
  uuid,
  uuid,
  text,
  date
) from public, anon, authenticated;

grant execute on function public.guard_stock_movement()
  to service_role;
grant execute on function public.guard_stock_movement_line()
  to service_role;
grant execute on function public.guard_inventory_movement_master()
  to service_role;
grant execute on function public.guard_stock_ledger_entry()
  to service_role;
grant execute on function public.guard_stock_journal_reversal()
  to service_role;
grant execute on function public.post_stock_movement(uuid, uuid)
  to service_role;
grant execute on function public.reverse_stock_movement(
  uuid,
  uuid,
  text,
  date
) to service_role;
