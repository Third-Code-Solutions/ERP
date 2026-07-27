-- Third Code ERP receipt-level three-way matching.
-- PO commitment + active Stock Receipt + Supplier Bill are rechecked under
-- row locks before a payable can become posted.

create or replace function public.enforce_supplier_bill_line_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.supplier_bills%rowtype;
  v_po_line public.po_line_items%rowtype;
  v_inventory_tracked boolean := false;
  v_account_type text;
  v_account_system_key text;
  v_account_active boolean;
  v_receipt_line public.stock_receipt_lines%rowtype;
  v_receipt public.stock_receipts%rowtype;
  v_expected_amount bigint;
begin
  select bill.*
    into v_bill
    from public.supplier_bills bill
   where bill.id = new.supplier_bill_id
     and bill.tenant_id = new.tenant_id;

  if not found or v_bill.status <> 'draft' then
    raise exception 'Posted supplier bill lines are immutable'
      using errcode = '55000';
  end if;

  if new.po_line_item_id is null then
    raise exception 'Supplier bill line requires Purchase Order line evidence'
      using errcode = '23514';
  end if;

  select po_line.*
    into v_po_line
    from public.po_line_items po_line
   where po_line.id = new.po_line_item_id
     and po_line.tenant_id = new.tenant_id;

  if not found or v_po_line.po_id <> v_bill.purchase_order_id then
    raise exception 'Supplier bill line must match its Purchase Order'
      using errcode = '23514';
  end if;

  if v_po_line.material_item_id is not null then
    select item.inventory_tracked
      into v_inventory_tracked
      from public.material_items item
     where item.id = v_po_line.material_item_id
       and item.tenant_id = new.tenant_id;
  end if;
  v_inventory_tracked := coalesce(v_inventory_tracked, false);

  select
    account.account_type::text,
    account.system_key::text,
    account.is_active
    into v_account_type, v_account_system_key, v_account_active
    from public.ledger_accounts account
   where account.id = new.ledger_account_id
     and account.tenant_id = new.tenant_id;

  if v_inventory_tracked then
    if new.stock_receipt_line_id is null or new.quantity_micros is null then
      raise exception 'Inventory bill line requires posted Stock Receipt evidence'
        using errcode = '23514';
    end if;

    select receipt_line.*
      into v_receipt_line
      from public.stock_receipt_lines receipt_line
     where receipt_line.id = new.stock_receipt_line_id
       and receipt_line.tenant_id = new.tenant_id;

    if not found
       or v_receipt_line.po_line_item_id <> new.po_line_item_id then
      raise exception 'Supplier bill receipt line must match its Purchase Order line'
        using errcode = '23514';
    end if;

    select receipt.*
      into v_receipt
      from public.stock_receipts receipt
     where receipt.id = v_receipt_line.stock_receipt_id
       and receipt.tenant_id = new.tenant_id;

    if not found
       or v_receipt.purchase_order_id <> v_bill.purchase_order_id
       or v_receipt.status <> 'posted' then
      raise exception 'Inventory bill line requires active posted Stock Receipt evidence'
        using errcode = '23514';
    end if;

    if new.quantity_micros > v_receipt_line.quantity_micros then
      raise exception 'Supplier bill quantity exceeds Stock Receipt quantity'
        using errcode = '23514';
    end if;

    v_expected_amount := pg_catalog.round(
      new.quantity_micros::numeric
        * v_receipt_line.unit_cost_cents::numeric
        / 1000000
    )::bigint;
    if pg_catalog.abs(new.amount_cents - v_expected_amount) > 1 then
      raise exception 'Supplier bill amount exceeds Stock Receipt rounding tolerance'
        using errcode = '23514';
    end if;

    if not coalesce(v_account_active, false)
       or v_account_system_key is distinct from 'goods_received_not_invoiced'
       or v_account_type is distinct from 'liability' then
      raise exception 'Inventory receipt matches require active GRNI account'
        using errcode = '23514';
    end if;
  else
    if new.stock_receipt_line_id is not null
       or new.quantity_micros is not null then
      raise exception 'Non-inventory bill line cannot use Stock Receipt evidence'
        using errcode = '23514';
    end if;

    if not coalesce(v_account_active, false)
       or v_account_type not in ('asset', 'expense') then
      raise exception 'Non-inventory bill line requires active asset or expense account'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

create or replace function public.enforce_supplier_bill_three_way_posting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_receipt_line public.stock_receipt_lines%rowtype;
  v_receipt public.stock_receipts%rowtype;
  v_po_line public.po_line_items%rowtype;
  v_matched_quantity bigint;
  v_matched_amount bigint;
begin
  if old.status = 'draft' and new.status = 'posted' then
    if not exists (
      select 1
      from public.supplier_bill_lines line
      where line.supplier_bill_id = new.id
        and line.tenant_id = new.tenant_id
    ) then
      raise exception 'Supplier bill requires matched line evidence'
        using errcode = '23514';
    end if;

    for v_line in
      select line.*
      from public.supplier_bill_lines line
      where line.supplier_bill_id = new.id
        and line.tenant_id = new.tenant_id
      order by line.po_line_item_id, line.stock_receipt_line_id nulls last,
        line.id
      for update
    loop
      if v_line.po_line_item_id is null then
        raise exception 'Supplier bill line requires Purchase Order line evidence'
          using errcode = '23514';
      end if;

      select po_line.*
        into v_po_line
        from public.po_line_items po_line
       where po_line.id = v_line.po_line_item_id
         and po_line.tenant_id = new.tenant_id
       for update;

      if not found or v_po_line.po_id <> new.purchase_order_id then
        raise exception 'Supplier bill line must match its Purchase Order'
          using errcode = '23514';
      end if;

      if v_line.stock_receipt_line_id is not null then
        select receipt_line.*
          into v_receipt_line
          from public.stock_receipt_lines receipt_line
         where receipt_line.id = v_line.stock_receipt_line_id
           and receipt_line.tenant_id = new.tenant_id
         for update;

        if not found
           or v_receipt_line.po_line_item_id <> v_line.po_line_item_id then
          raise exception 'Supplier bill receipt line must match its Purchase Order line'
            using errcode = '23514';
        end if;

        select receipt.*
          into v_receipt
          from public.stock_receipts receipt
         where receipt.id = v_receipt_line.stock_receipt_id
           and receipt.tenant_id = new.tenant_id
         for update;

        if not found
           or v_receipt.purchase_order_id <> new.purchase_order_id
           or v_receipt.status <> 'posted' then
          raise exception 'Inventory bill line requires active posted Stock Receipt evidence'
            using errcode = '23514';
        end if;

        select
          coalesce(sum(other_line.quantity_micros), 0)::bigint,
          coalesce(sum(other_line.amount_cents), 0)::bigint
          into v_matched_quantity, v_matched_amount
          from public.supplier_bill_lines other_line
          join public.supplier_bills other_bill
            on other_bill.id = other_line.supplier_bill_id
           and other_bill.tenant_id = other_line.tenant_id
         where other_line.tenant_id = new.tenant_id
           and other_line.stock_receipt_line_id =
             v_line.stock_receipt_line_id
           and other_bill.id <> new.id
           and other_bill.status = 'posted';

        if v_matched_quantity + v_line.quantity_micros >
             v_receipt_line.quantity_micros
           or v_matched_amount + v_line.amount_cents >
             v_receipt_line.line_total_cents then
          raise exception 'Supplier bill exceeds unmatched Stock Receipt evidence'
            using errcode = '23514';
        end if;
      else
        select coalesce(sum(other_line.amount_cents), 0)::bigint
          into v_matched_amount
          from public.supplier_bill_lines other_line
          join public.supplier_bills other_bill
            on other_bill.id = other_line.supplier_bill_id
           and other_bill.tenant_id = other_line.tenant_id
         where other_line.tenant_id = new.tenant_id
           and other_line.po_line_item_id = v_line.po_line_item_id
           and other_line.stock_receipt_line_id is null
           and other_bill.id <> new.id
           and other_bill.status = 'posted';

        if v_matched_amount + v_line.amount_cents >
             v_po_line.line_total_cents then
          raise exception 'Supplier bill exceeds unbilled Purchase Order line'
            using errcode = '23514';
        end if;
      end if;
    end loop;
  end if;

  return new;
end
$$;

drop trigger if exists enforce_supplier_bill_line_match
  on public.supplier_bill_lines;
create trigger enforce_supplier_bill_line_match
before insert or update
on public.supplier_bill_lines
for each row execute function public.enforce_supplier_bill_line_match();

drop trigger if exists enforce_supplier_bill_three_way_posting
  on public.supplier_bills;
create trigger enforce_supplier_bill_three_way_posting
before update of status
on public.supplier_bills
for each row execute function public.enforce_supplier_bill_three_way_posting();

revoke execute on function public.enforce_supplier_bill_line_match()
  from public, anon, authenticated;
revoke execute on function public.enforce_supplier_bill_three_way_posting()
  from public, anon, authenticated;
grant execute on function public.enforce_supplier_bill_line_match()
  to service_role;
grant execute on function public.enforce_supplier_bill_three_way_posting()
  to service_role;
