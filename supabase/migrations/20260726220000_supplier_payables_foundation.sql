-- Third Code ERP supplier payables foundation.
-- Forward-only: matched supplier bills post immutable payable journals.

create unique index if not exists ux_vendors_tenant_id_id
  on public.vendors (tenant_id, id);
create unique index if not exists ux_purchase_orders_tenant_id_id
  on public.purchase_orders (tenant_id, id);

do $$
begin
  create type public.supplier_bill_status as enum (
    'draft',
    'posted',
    'reversed'
  );
exception
  when duplicate_object then null;
end
$$;

alter type public.cortex_node_type
  add value if not exists 'supplier_bill';

create table if not exists public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null,
  project_id uuid not null,
  vendor_id uuid not null,
  vendor_bill_number varchar(80) not null,
  internal_number varchar(40),
  status public.supplier_bill_status not null default 'draft',
  bill_date date not null,
  due_date date,
  currency char(3) not null default 'PHP',
  subtotal_cents bigint not null,
  input_vat_cents bigint not null default 0,
  withholding_tax_cents bigint not null default 0,
  total_payable_cents bigint not null,
  notes text,
  posting_journal_entry_id uuid,
  posted_by uuid,
  posted_at timestamptz,
  reversal_journal_entry_id uuid,
  reversed_by uuid,
  reversed_at timestamptz,
  reversal_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_bills_number_nonempty
    check (
      vendor_bill_number = btrim(vendor_bill_number)
      and length(vendor_bill_number) > 0
    ),
  constraint supplier_bills_due_date_valid
    check (due_date is null or due_date >= bill_date),
  constraint supplier_bills_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint supplier_bills_amounts_consistent
    check (
      subtotal_cents > 0
      and input_vat_cents >= 0
      and withholding_tax_cents >= 0
      and total_payable_cents =
        subtotal_cents
        + input_vat_cents
        - withholding_tax_cents
      and total_payable_cents > 0
    ),
  constraint supplier_bills_posting_state
    check (
      (
        status = 'draft'
        and internal_number is null
        and posting_journal_entry_id is null
        and posted_by is null
        and posted_at is null
        and reversal_journal_entry_id is null
        and reversed_by is null
        and reversed_at is null
        and reversal_reason is null
      )
      or
      (
        status = 'posted'
        and internal_number is not null
        and posting_journal_entry_id is not null
        and posted_by is not null
        and posted_at is not null
        and reversal_journal_entry_id is null
        and reversed_by is null
        and reversed_at is null
        and reversal_reason is null
      )
      or
      (
        status = 'reversed'
        and internal_number is not null
        and posting_journal_entry_id is not null
        and posted_by is not null
        and posted_at is not null
        and reversal_journal_entry_id is not null
        and reversed_by is not null
        and reversed_at is not null
        and length(btrim(reversal_reason)) > 0
      )
    ),
  constraint supplier_bills_po_tenant_fk
    foreign key (tenant_id, purchase_order_id)
    references public.purchase_orders(tenant_id, id)
    on delete restrict,
  constraint supplier_bills_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete restrict,
  constraint supplier_bills_vendor_tenant_fk
    foreign key (tenant_id, vendor_id)
    references public.vendors(tenant_id, id)
    on delete restrict,
  constraint supplier_bills_posting_journal_tenant_fk
    foreign key (tenant_id, posting_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint supplier_bills_reversal_journal_tenant_fk
    foreign key (tenant_id, reversal_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint supplier_bills_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint supplier_bills_posted_by_tenant_fk
    foreign key (tenant_id, posted_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint supplier_bills_reversed_by_tenant_fk
    foreign key (tenant_id, reversed_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_supplier_bills_tenant_id_id
  on public.supplier_bills (tenant_id, id);
create unique index if not exists ux_supplier_bills_vendor_number
  on public.supplier_bills (
    tenant_id,
    vendor_id,
    lower(btrim(vendor_bill_number))
  );
create unique index if not exists ux_supplier_bills_tenant_internal_number
  on public.supplier_bills (tenant_id, internal_number)
  where internal_number is not null;
create unique index if not exists ux_supplier_bills_posting_journal
  on public.supplier_bills (tenant_id, posting_journal_entry_id)
  where posting_journal_entry_id is not null;
create unique index if not exists ux_supplier_bills_reversal_journal
  on public.supplier_bills (tenant_id, reversal_journal_entry_id)
  where reversal_journal_entry_id is not null;
create index if not exists idx_supplier_bills_tenant_status
  on public.supplier_bills (tenant_id, status);
create index if not exists idx_supplier_bills_tenant_due
  on public.supplier_bills (tenant_id, due_date);
create index if not exists idx_supplier_bills_purchase_order
  on public.supplier_bills (tenant_id, purchase_order_id);

create table if not exists public.supplier_bill_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  supplier_bill_id uuid not null,
  ledger_account_id uuid not null,
  project_id uuid not null,
  line_number integer not null,
  description text not null,
  amount_cents bigint not null,
  created_at timestamptz not null default now(),
  constraint supplier_bill_lines_description_nonempty
    check (length(btrim(description)) > 0),
  constraint supplier_bill_lines_number_positive
    check (line_number > 0),
  constraint supplier_bill_lines_amount_positive
    check (amount_cents > 0),
  constraint supplier_bill_lines_bill_tenant_fk
    foreign key (tenant_id, supplier_bill_id)
    references public.supplier_bills(tenant_id, id)
    on delete cascade,
  constraint supplier_bill_lines_account_tenant_fk
    foreign key (tenant_id, ledger_account_id)
    references public.ledger_accounts(tenant_id, id)
    on delete restrict,
  constraint supplier_bill_lines_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_supplier_bill_lines_bill_line
  on public.supplier_bill_lines (supplier_bill_id, line_number);
create index if not exists idx_supplier_bill_lines_tenant_account
  on public.supplier_bill_lines (tenant_id, ledger_account_id);
create index if not exists idx_supplier_bill_lines_tenant_project
  on public.supplier_bill_lines (tenant_id, project_id);

alter table public.journal_lines
  add column if not exists vendor_id uuid;

alter table public.journal_lines
  drop constraint if exists journal_lines_vendor_tenant_fk;
alter table public.journal_lines
  add constraint journal_lines_vendor_tenant_fk
  foreign key (tenant_id, vendor_id)
  references public.vendors(tenant_id, id)
  on delete restrict;

create index if not exists idx_journal_lines_tenant_vendor
  on public.journal_lines (tenant_id, vendor_id)
  where vendor_id is not null;

create or replace function public.guard_supplier_bill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
    new.tenant_id is distinct from old.tenant_id
    or new.purchase_order_id is distinct from old.purchase_order_id
    or new.project_id is distinct from old.project_id
    or new.vendor_id is distinct from old.vendor_id
    or new.vendor_bill_number is distinct from old.vendor_bill_number
    or new.internal_number is distinct from old.internal_number
    or new.bill_date is distinct from old.bill_date
    or new.due_date is distinct from old.due_date
    or new.currency is distinct from old.currency
    or new.subtotal_cents is distinct from old.subtotal_cents
    or new.input_vat_cents is distinct from old.input_vat_cents
    or new.withholding_tax_cents is distinct from old.withholding_tax_cents
    or new.total_payable_cents is distinct from old.total_payable_cents
    or new.posting_journal_entry_id is distinct from old.posting_journal_entry_id
    or new.posted_by is distinct from old.posted_by
    or new.posted_at is distinct from old.posted_at
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Posted supplier bill terms are immutable'
      using errcode = '55000';
  end if;

  if old.reversal_journal_entry_id is not null and (
    new.reversal_journal_entry_id is distinct from old.reversal_journal_entry_id
    or new.reversed_by is distinct from old.reversed_by
    or new.reversed_at is distinct from old.reversed_at
    or new.reversal_reason is distinct from old.reversal_reason
  ) then
    raise exception 'Supplier bill reversal linkage is immutable'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create or replace function public.guard_supplier_bill_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill_id uuid := coalesce(new.supplier_bill_id, old.supplier_bill_id);
  v_status public.supplier_bill_status;
begin
  select bill.status
    into v_status
    from public.supplier_bills bill
   where bill.id = v_bill_id;

  if v_status is distinct from 'draft' then
    raise exception 'Posted supplier bill lines are immutable'
      using errcode = '55000';
  end if;

  return coalesce(new, old);
end
$$;

drop trigger if exists guard_supplier_bill
  on public.supplier_bills;
create trigger guard_supplier_bill
before update or delete
on public.supplier_bills
for each row execute function public.guard_supplier_bill();

drop trigger if exists guard_supplier_bill_line
  on public.supplier_bill_lines;
create trigger guard_supplier_bill_line
before insert or update or delete
on public.supplier_bill_lines
for each row execute function public.guard_supplier_bill_line();

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

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_bill.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
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
      and line.project_id <> v_bill.project_id
  ) then
    raise exception 'Supplier bill allocations must match the bill project'
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
        or account.account_type not in ('asset', 'expense')
      )
  ) then
    raise exception 'Supplier bill allocations require active asset or expense accounts'
      using errcode = '23514';
  end if;

  select coalesce(sum(other.subtotal_cents), 0)::bigint
    into v_prior_billed_subtotal
    from public.supplier_bills other
   where other.tenant_id = v_bill.tenant_id
     and other.purchase_order_id = v_bill.purchase_order_id
     and other.id <> v_bill.id
     and other.status = 'posted';

  if v_prior_billed_subtotal + v_bill.subtotal_cents > v_po.subtotal_cents then
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
  if v_bill.input_vat_cents > 0 and v_input_vat_account_id is null then
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
  returning next_value - 1
    into v_sequence_value;

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

-- Preserve every subledger dimension and make each subledger own its
-- reversal lifecycle. Generic manual reversals remain available for journals
-- without a controlled business document.
create or replace function public.reverse_journal_entry(
  p_entry_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_posting_date date default current_date
)
returns table (
  reversal_entry_id uuid,
  reversal_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.journal_entries%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_reversal_id uuid;
  v_number text;
begin
  if length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A reversal reason is required'
      using errcode = '23514';
  end if;

  select entry.*
    into v_original
    from public.journal_entries entry
   where entry.id = p_entry_id
   for update;

  if not found then
    raise exception 'Journal entry not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_original.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot reverse this journal entry'
      using errcode = '42501';
  end if;

  if v_original.status <> 'posted' then
    raise exception 'Only posted journal entries can be reversed'
      using errcode = '23514';
  end if;

  if v_original.source_type = 'reversal' then
    raise exception 'Reversal entries cannot be reversed'
      using errcode = '23514';
  end if;

  if v_original.reference_type = 'customer_invoice'
     and coalesce(
       pg_catalog.current_setting(
         'app.customer_invoice_reversal',
         true
       ),
       ''
     ) <> v_original.reference_id::text then
    raise exception 'Use the customer invoice reversal workflow'
      using errcode = '23514';
  end if;

  if v_original.reference_type = 'supplier_bill'
     and coalesce(
       pg_catalog.current_setting(
         'app.supplier_bill_reversal',
         true
       ),
       ''
     ) <> v_original.reference_id::text then
    raise exception 'Use the supplier bill reversal workflow'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.journal_entries reversal
    where reversal.tenant_id = v_original.tenant_id
      and reversal.reverses_entry_id = v_original.id
  ) then
    raise exception 'Journal entry already has a reversal'
      using errcode = '23505';
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
    reverses_entry_id,
    created_by
  )
  values (
    v_original.tenant_id,
    p_posting_date,
    pg_catalog.format(
      'Reversal of %s: %s',
      v_original.entry_number,
      pg_catalog.btrim(p_reason)
    ),
    'journal_entry',
    v_original.id,
    v_original.currency,
    'reversal',
    v_original.id,
    p_actor_id
  )
  returning id into v_reversal_id;

  insert into public.journal_lines (
    tenant_id,
    journal_entry_id,
    ledger_account_id,
    project_id,
    business_account_id,
    vendor_id,
    line_number,
    description,
    debit_cents,
    credit_cents
  )
  select
    original_line.tenant_id,
    v_reversal_id,
    original_line.ledger_account_id,
    original_line.project_id,
    original_line.business_account_id,
    original_line.vendor_id,
    original_line.line_number,
    original_line.description,
    original_line.credit_cents,
    original_line.debit_cents
  from public.journal_lines original_line
  where original_line.tenant_id = v_original.tenant_id
    and original_line.journal_entry_id = v_original.id
  order by original_line.line_number;

  select posted.posted_number
    into v_number
    from public.post_journal_entry(v_reversal_id, p_actor_id) posted;

  return query
  select v_reversal_id, v_number;
end
$$;

create or replace function public.reverse_supplier_bill(
  p_bill_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_posting_date date default current_date
)
returns table (
  reversal_entry_id uuid,
  reversal_entry_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.supplier_bills%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_reversal_id uuid;
  v_reversal_number text;
begin
  if length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Supplier bill reversal reason is required'
      using errcode = '23514';
  end if;

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

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_bill.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot reverse this supplier bill'
      using errcode = '42501';
  end if;

  if v_bill.status <> 'posted'
     or v_bill.posting_journal_entry_id is null then
    raise exception 'Only a posted supplier bill can be reversed'
      using errcode = '23514';
  end if;

  if v_bill.reversal_journal_entry_id is not null then
    raise exception 'Supplier bill already has a reversal'
      using errcode = '23505';
  end if;

  if p_posting_date < v_bill.bill_date then
    raise exception 'Reversal date cannot precede supplier bill date'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.supplier_bill_reversal',
    v_bill.id::text,
    true
  );

  select reversal.reversal_entry_id, reversal.reversal_number
    into v_reversal_id, v_reversal_number
    from public.reverse_journal_entry(
      v_bill.posting_journal_entry_id,
      p_actor_id,
      p_reason,
      p_posting_date
    ) reversal;

  update public.supplier_bills
     set status = 'reversed',
         reversed_by = p_actor_id,
         reversed_at = pg_catalog.clock_timestamp(),
         reversal_reason = pg_catalog.btrim(p_reason),
         reversal_journal_entry_id = v_reversal_id,
         updated_at = pg_catalog.clock_timestamp()
   where id = v_bill.id;

  return query
  select v_reversal_id, v_reversal_number;
end
$$;

-- Canonical payable graph projection. Supplier bills become searchable finance
-- nodes; Vendor, Purchase Order, project, and journal dimensions stay linked.
create or replace function public.cortex_mirror_payables()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_tenant_id uuid;
  v_ref_id uuid;
  v_node_id uuid;
  v_target_id uuid;
  v_fk uuid;
begin
  begin
    if tg_op = 'DELETE' then
      v_row := to_jsonb(old);
    else
      v_row := to_jsonb(new);
    end if;

    v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid;
    v_ref_id := nullif(v_row ->> 'id', '')::uuid;
    if v_tenant_id is null or v_ref_id is null then
      return coalesce(new, old);
    end if;

    if tg_table_name = 'supplier_bills' then
      if tg_op = 'DELETE' then
        perform public.cortex_close_node(
          v_tenant_id,
          tg_table_name,
          v_ref_id,
          auth.uid(),
          'supplier_bills:delete'
        );
        return old;
      end if;

      v_node_id := public.cortex_upsert_node(
        v_tenant_id,
        'supplier_bill'::public.cortex_node_type,
        tg_table_name,
        v_ref_id,
        coalesce(
          nullif(v_row ->> 'internal_number', ''),
          v_row ->> 'vendor_bill_number'
        ),
        pg_catalog.format(
          '%s | %s | %s',
          v_row ->> 'status',
          v_row ->> 'currency',
          v_row ->> 'total_payable_cents'
        ),
        v_row
          - 'created_by'
          - 'posted_by'
          - 'reversed_by',
        auth.uid(),
        'supplier_bills:' || lower(tg_op)
      );

      v_fk := nullif(v_row ->> 'vendor_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'vendors',
        v_fk
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_target_id,
          v_node_id,
          'supplies',
          'canonical',
          1,
          auth.uid()
        );
      end if;

      v_fk := nullif(v_row ->> 'purchase_order_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'purchase_orders',
        v_fk
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_node_id,
          v_target_id,
          'derived_from',
          'canonical',
          1,
          auth.uid()
        );
      end if;

      v_fk := nullif(v_row ->> 'project_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'projects',
        v_fk
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_node_id,
          v_target_id,
          'part_of',
          'canonical',
          1,
          auth.uid()
        );
      end if;

      v_fk := nullif(v_row ->> 'posting_journal_entry_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'journal_entries',
        v_fk
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_node_id,
          v_target_id,
          'bills',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    elsif tg_table_name = 'journal_lines' and tg_op <> 'DELETE' then
      v_fk := nullif(v_row ->> 'vendor_id', '')::uuid;
      if v_fk is null then
        return new;
      end if;

      v_node_id := public.cortex_node_current(
        v_tenant_id,
        'journal_lines',
        v_ref_id
      );
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'vendors',
        v_fk
      );
      if v_node_id is not null and v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_target_id,
          v_node_id,
          'supplies',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    end if;
  exception
    when others then
      raise warning 'cortex_mirror_payables(%) failed: %',
        tg_table_name,
        sqlerrm;
  end;

  return coalesce(new, old);
end
$$;

drop trigger if exists cortex_mirror_payables
  on public.supplier_bills;
create trigger cortex_mirror_payables
after insert or update or delete
on public.supplier_bills
for each row execute function public.cortex_mirror_payables();

drop trigger if exists cortex_mirror_payables
  on public.journal_lines;
create trigger cortex_mirror_payables
after insert or update
on public.journal_lines
for each row execute function public.cortex_mirror_payables();

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
      'fiscal_period',
      'ledger_account',
      'journal_entry',
      'journal_line'
    ) then exists (
      select 1
      from public.users app_user
      where app_user.id = auth.uid()
        and app_user.role::text in ('finance', 'admin', 'owner')
    )
    else true
  end
$$;

drop trigger if exists audit_supplier_bills
  on public.supplier_bills;
create trigger audit_supplier_bills
after insert or update or delete
on public.supplier_bills
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_supplier_bill_lines
  on public.supplier_bill_lines;
create trigger audit_supplier_bill_lines
after insert or update or delete
on public.supplier_bill_lines
for each row execute function public.audit_log_trigger();

alter table public.supplier_bills enable row level security;
alter table public.supplier_bills force row level security;
alter table public.supplier_bill_lines enable row level security;
alter table public.supplier_bill_lines force row level security;

create policy supplier_bills_finance_read
on public.supplier_bills
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy supplier_bills_finance_insert
on public.supplier_bills
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and posting_journal_entry_id is null
  and public.auth_can_manage_finance()
);

create policy supplier_bills_finance_update
on public.supplier_bills
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_finance()
)
with check (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and posting_journal_entry_id is null
  and public.auth_can_manage_finance()
);

create policy supplier_bills_finance_delete
on public.supplier_bills
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_finance()
);

create policy supplier_bill_lines_finance_read
on public.supplier_bill_lines
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy supplier_bill_lines_finance_insert
on public.supplier_bill_lines
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.supplier_bills bill
    where bill.id = supplier_bill_lines.supplier_bill_id
      and bill.tenant_id = supplier_bill_lines.tenant_id
      and bill.status = 'draft'
  )
);

create policy supplier_bill_lines_finance_update
on public.supplier_bill_lines
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.supplier_bills bill
    where bill.id = supplier_bill_lines.supplier_bill_id
      and bill.tenant_id = supplier_bill_lines.tenant_id
      and bill.status = 'draft'
  )
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.supplier_bills bill
    where bill.id = supplier_bill_lines.supplier_bill_id
      and bill.tenant_id = supplier_bill_lines.tenant_id
      and bill.status = 'draft'
  )
);

create policy supplier_bill_lines_finance_delete
on public.supplier_bill_lines
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.supplier_bills bill
    where bill.id = supplier_bill_lines.supplier_bill_id
      and bill.tenant_id = supplier_bill_lines.tenant_id
      and bill.status = 'draft'
  )
);

revoke all privileges on table public.supplier_bills
  from public, anon, authenticated;
revoke all privileges on table public.supplier_bill_lines
  from public, anon, authenticated;

grant select on table public.supplier_bills
  to authenticated;
grant insert (
  tenant_id,
  purchase_order_id,
  project_id,
  vendor_id,
  vendor_bill_number,
  status,
  bill_date,
  due_date,
  currency,
  subtotal_cents,
  input_vat_cents,
  withholding_tax_cents,
  total_payable_cents,
  notes,
  created_by
)
on table public.supplier_bills
to authenticated;
grant update (
  purchase_order_id,
  project_id,
  vendor_id,
  vendor_bill_number,
  bill_date,
  due_date,
  currency,
  subtotal_cents,
  input_vat_cents,
  withholding_tax_cents,
  total_payable_cents,
  notes,
  updated_at
)
on table public.supplier_bills
to authenticated;
grant delete on table public.supplier_bills
  to authenticated;

grant select on table public.supplier_bill_lines
  to authenticated;
grant insert (
  tenant_id,
  supplier_bill_id,
  ledger_account_id,
  project_id,
  line_number,
  description,
  amount_cents
)
on table public.supplier_bill_lines
to authenticated;
grant update (
  ledger_account_id,
  project_id,
  line_number,
  description,
  amount_cents
)
on table public.supplier_bill_lines
to authenticated;
grant delete on table public.supplier_bill_lines
  to authenticated;

grant all privileges on table public.supplier_bills
  to service_role;
grant all privileges on table public.supplier_bill_lines
  to service_role;

grant insert (vendor_id)
on table public.journal_lines
to authenticated;
grant update (vendor_id)
on table public.journal_lines
to authenticated;

revoke execute on function public.guard_supplier_bill()
  from public, anon, authenticated;
revoke execute on function public.guard_supplier_bill_line()
  from public, anon, authenticated;
revoke execute on function public.post_supplier_bill(uuid, uuid, date)
  from public, anon, authenticated;
revoke execute on function public.reverse_supplier_bill(uuid, uuid, text, date)
  from public, anon, authenticated;
revoke execute on function public.cortex_mirror_payables()
  from public, anon, authenticated;

grant execute on function public.guard_supplier_bill()
  to service_role;
grant execute on function public.guard_supplier_bill_line()
  to service_role;
grant execute on function public.post_supplier_bill(uuid, uuid, date)
  to service_role;
grant execute on function public.reverse_supplier_bill(uuid, uuid, text, date)
  to service_role;
grant execute on function public.cortex_mirror_payables()
  to service_role;
