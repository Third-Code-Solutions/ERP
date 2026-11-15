-- Stock Receipt posting accepts a Purchase Order marked partially delivered.
--
-- post_stock_receipt() (20260726234000_inventory_stock_foundation) predates the
-- current-flow status partial_delivered (20260728005112). The PO page's "Mark
-- Partial Delivery" moves an issued PO there, after which every further receipt
-- was refused with "Stock Receipt requires an issued Purchase Order". Supplier
-- bill posting already accepts it. The body is otherwise the 20260726234000
-- definition; no persisted row changes.
begin;

set local lock_timeout = '5s';

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
       'partial_delivered',
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

-- Preserve the existing function privileges.
revoke execute on function public.post_stock_receipt(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.post_stock_receipt(uuid, uuid, date)
  to service_role;

commit;
