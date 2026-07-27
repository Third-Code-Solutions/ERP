-- Third Code ERP three-way Supplier Bill posting.
-- Replaces the payable posting RPC so receipt-matched GRNI debit lines are
-- accepted while every other allocation remains restricted to asset/expense.

create or replace function public.post_supplier_bill(
  p_bill_id uuid,
  p_actor_id uuid,
  p_posting_date date default current_date
)
returns table (
  journal_entry_id uuid,
  journal_entry_number text,
  supplier_bill_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.supplier_bills%rowtype;
  v_po public.purchase_orders%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_line_count integer;
  v_allocated_subtotal bigint;
  v_prior_billed_subtotal bigint;
  v_ap_account_id uuid;
  v_input_vat_account_id uuid;
  v_withholding_account_id uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_sequence_value bigint;
  v_internal_number text;
  v_line_number integer := 0;
  allocation record;
begin
  select bill.*
    into v_bill
    from public.supplier_bills bill
   where bill.id = p_bill_id
   for update;

  if not found then
    raise exception 'Supplier bill not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if v_actor_tenant is null
     or v_actor_tenant <> v_bill.tenant_id
     or v_actor_role not in ('finance', 'admin', 'owner') then
    raise exception 'Actor cannot post this supplier bill'
      using errcode = '42501';
  end if;

  if v_bill.status <> 'draft'
     or v_bill.posting_journal_entry_id is not null then
    raise exception 'Only an unposted draft supplier bill can be posted'
      using errcode = '23514';
  end if;

  select purchase_order.*
    into v_po
    from public.purchase_orders purchase_order
   where purchase_order.id = v_bill.purchase_order_id
     and purchase_order.tenant_id = v_bill.tenant_id
   for update;

  if not found then
    raise exception 'Purchase Order not found for supplier bill'
      using errcode = '23514';
  end if;

  if v_po.status::text not in (
    'confirmed',
    'issued',
    'partial_delivery',
    'partial_delivered',
    'delivered',
    'fully_delivered'
  ) then
    raise exception 'Purchase Order must be approved and issued before billing'
      using errcode = '23514';
  end if;

  if v_po.vendor_id is null
     or v_po.vendor_id <> v_bill.vendor_id
     or v_po.project_id <> v_bill.project_id then
    raise exception 'Supplier bill Vendor or project does not match Purchase Order'
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    coalesce(sum(line.amount_cents), 0)::bigint
    into v_line_count, v_allocated_subtotal
    from public.supplier_bill_lines line
   where line.supplier_bill_id = v_bill.id
     and line.tenant_id = v_bill.tenant_id;

  if v_line_count < 1
     or v_allocated_subtotal <> v_bill.subtotal_cents then
    raise exception 'Supplier bill allocations must equal subtotal'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.supplier_bill_lines line
    where line.supplier_bill_id = v_bill.id
      and line.tenant_id = v_bill.tenant_id
      and (
        line.project_id <> v_bill.project_id
        or line.po_line_item_id is null
      )
  ) then
    raise exception 'Supplier bill allocations must match the bill project and Purchase Order lines'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.supplier_bill_lines line
    join public.ledger_accounts account
      on account.id = line.ledger_account_id
     and account.tenant_id = line.tenant_id
    where line.supplier_bill_id = v_bill.id
      and line.tenant_id = v_bill.tenant_id
      and (
        not account.is_active
        or (
          line.stock_receipt_line_id is null
          and account.account_type not in ('asset', 'expense')
        )
        or (
          line.stock_receipt_line_id is not null
          and (
            account.account_type <> 'liability'
            or account.system_key is distinct from
              'goods_received_not_invoiced'
          )
        )
      )
  ) then
    raise exception 'Supplier bill allocations do not satisfy three-way account control'
      using errcode = '23514';
  end if;

  select coalesce(sum(other.subtotal_cents), 0)::bigint
    into v_prior_billed_subtotal
    from public.supplier_bills other
   where other.tenant_id = v_bill.tenant_id
     and other.purchase_order_id = v_bill.purchase_order_id
     and other.id <> v_bill.id
     and other.status = 'posted';

  if v_prior_billed_subtotal + v_bill.subtotal_cents >
       v_po.subtotal_cents then
    raise exception 'Supplier bill exceeds unbilled Purchase Order subtotal'
      using errcode = '23514';
  end if;

  select account.id
    into v_ap_account_id
    from public.ledger_accounts account
   where account.tenant_id = v_bill.tenant_id
     and account.system_key = 'accounts_payable'
     and account.account_type = 'liability'
     and account.is_active;

  if v_bill.input_vat_cents > 0 then
    select account.id
      into v_input_vat_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_bill.tenant_id
       and account.system_key = 'input_vat_receivable'
       and account.account_type = 'asset'
       and account.is_active;
  end if;

  if v_bill.withholding_tax_cents > 0 then
    select account.id
      into v_withholding_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_bill.tenant_id
       and account.system_key = 'withholding_tax_payable'
       and account.account_type = 'liability'
       and account.is_active;
  end if;

  if v_ap_account_id is null then
    raise exception 'Active Accounts Payable control account is required'
      using errcode = '23514';
  end if;
  if p_posting_date < v_bill.bill_date then
    raise exception 'Posting date cannot precede supplier bill date'
      using errcode = '23514';
  end if;
  if v_bill.input_vat_cents > 0
     and v_input_vat_account_id is null then
    raise exception 'Active Input VAT control account is required'
      using errcode = '23514';
  end if;
  if v_bill.withholding_tax_cents > 0
     and v_withholding_account_id is null then
    raise exception 'Active Withholding Tax Payable control account is required'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object(
      'sub', p_actor_id, 'role', 'authenticated'
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
    v_bill.tenant_id,
    p_posting_date,
    'Supplier bill ' || v_bill.vendor_bill_number,
    'supplier_bill',
    v_bill.id,
    v_bill.currency,
    'system',
    p_actor_id
  )
  returning id into v_journal_id;

  for allocation in
    select line.*
    from public.supplier_bill_lines line
    where line.supplier_bill_id = v_bill.id
      and line.tenant_id = v_bill.tenant_id
    order by line.line_number
  loop
    v_line_number := v_line_number + 1;
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
    values (
      v_bill.tenant_id,
      v_journal_id,
      allocation.ledger_account_id,
      v_bill.project_id,
      v_bill.vendor_id,
      v_line_number,
      allocation.description,
      allocation.amount_cents,
      0
    );
  end loop;

  if v_bill.input_vat_cents > 0 then
    v_line_number := v_line_number + 1;
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
    values (
      v_bill.tenant_id,
      v_journal_id,
      v_input_vat_account_id,
      v_bill.project_id,
      v_bill.vendor_id,
      v_line_number,
      'Input VAT',
      v_bill.input_vat_cents,
      0
    );
  end if;

  v_line_number := v_line_number + 1;
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
  values (
    v_bill.tenant_id,
    v_journal_id,
    v_ap_account_id,
    v_bill.project_id,
    v_bill.vendor_id,
    v_line_number,
    'Amount payable to Vendor',
    0,
    v_bill.total_payable_cents
  );

  if v_bill.withholding_tax_cents > 0 then
    v_line_number := v_line_number + 1;
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
    values (
      v_bill.tenant_id,
      v_journal_id,
      v_withholding_account_id,
      v_bill.project_id,
      v_bill.vendor_id,
      v_line_number,
      'Withholding tax payable',
      0,
      v_bill.withholding_tax_cents
    );
  end if;

  select posted.posted_number
    into v_journal_number
    from public.post_journal_entry(v_journal_id, p_actor_id) posted;

  insert into public.financial_sequences (
    tenant_id,
    sequence_key,
    next_value,
    updated_at
  )
  values (
    v_bill.tenant_id,
    'supplier_bill:' || pg_catalog.to_char(p_posting_date, 'YYYY'),
    2,
    pg_catalog.clock_timestamp()
  )
  on conflict (tenant_id, sequence_key)
  do update set
    next_value = public.financial_sequences.next_value + 1,
    updated_at = pg_catalog.clock_timestamp()
  returning next_value - 1 into v_sequence_value;

  v_internal_number := pg_catalog.format(
    'SB-%s-%s',
    pg_catalog.to_char(p_posting_date, 'YYYY'),
    pg_catalog.lpad(v_sequence_value::text, 6, '0')
  );

  update public.supplier_bills
     set status = 'posted',
         internal_number = v_internal_number,
         posting_journal_entry_id = v_journal_id,
         posted_by = p_actor_id,
         posted_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_bill.id;

  return query
  select v_journal_id, v_journal_number, v_internal_number;
end
$$;

revoke execute on function public.post_supplier_bill(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.post_supplier_bill(uuid, uuid, date)
  to service_role;
