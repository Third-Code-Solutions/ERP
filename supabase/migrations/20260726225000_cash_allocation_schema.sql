-- Third Code ERP cash allocation schema.
-- Precedes the workflow migration so all typed functions compile cleanly.

do $$
begin
  create type public.cash_account_kind as enum (
    'cash',
    'bank',
    'e_wallet'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.cash_transaction_direction as enum (
    'receipt',
    'disbursement'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.cash_transaction_status as enum (
    'draft',
    'posted',
    'reversed'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.cash_allocation_type as enum (
    'customer_current_due',
    'customer_retention',
    'supplier_bill'
  );
exception
  when duplicate_object then null;
end
$$;

alter type public.cortex_node_type
  add value if not exists 'cash_account';
alter type public.cortex_node_type
  add value if not exists 'cash_transaction';

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  ledger_account_id uuid not null,
  name varchar(160) not null,
  account_kind public.cash_account_kind not null,
  bank_name varchar(160),
  account_identifier_last4 varchar(4),
  currency char(3) not null default 'PHP',
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_accounts_name_nonempty
    check (length(btrim(name)) > 0),
  constraint cash_accounts_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint cash_accounts_identifier_format
    check (
      account_identifier_last4 is null
      or account_identifier_last4 ~ '^[A-Za-z0-9]{4}$'
    ),
  constraint cash_accounts_ledger_tenant_fk
    foreign key (tenant_id, ledger_account_id)
    references public.ledger_accounts(tenant_id, id)
    on delete restrict,
  constraint cash_accounts_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_cash_accounts_tenant_id_id
  on public.cash_accounts (tenant_id, id);
create unique index if not exists ux_cash_accounts_tenant_ledger
  on public.cash_accounts (tenant_id, ledger_account_id);
create unique index if not exists ux_cash_accounts_tenant_name
  on public.cash_accounts (tenant_id, lower(btrim(name)));
create index if not exists idx_cash_accounts_tenant_active
  on public.cash_accounts (tenant_id, is_active);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  cash_account_id uuid not null,
  direction public.cash_transaction_direction not null,
  business_account_id uuid,
  vendor_id uuid,
  reference_number varchar(100) not null,
  internal_number varchar(40),
  status public.cash_transaction_status not null default 'draft',
  transaction_date date not null,
  currency char(3) not null default 'PHP',
  amount_cents bigint not null,
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
  constraint cash_transactions_reference_nonempty
    check (
      reference_number = btrim(reference_number)
      and length(reference_number) > 0
    ),
  constraint cash_transactions_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint cash_transactions_amount_positive
    check (amount_cents > 0),
  constraint cash_transactions_counterparty
    check (
      (
        direction = 'receipt'
        and business_account_id is not null
        and vendor_id is null
      )
      or
      (
        direction = 'disbursement'
        and vendor_id is not null
        and business_account_id is null
      )
    ),
  constraint cash_transactions_posting_state
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
  constraint cash_transactions_cash_account_tenant_fk
    foreign key (tenant_id, cash_account_id)
    references public.cash_accounts(tenant_id, id)
    on delete restrict,
  constraint cash_transactions_business_account_tenant_fk
    foreign key (tenant_id, business_account_id)
    references public.accounts(tenant_id, id)
    on delete restrict,
  constraint cash_transactions_vendor_tenant_fk
    foreign key (tenant_id, vendor_id)
    references public.vendors(tenant_id, id)
    on delete restrict,
  constraint cash_transactions_posting_journal_tenant_fk
    foreign key (tenant_id, posting_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint cash_transactions_reversal_journal_tenant_fk
    foreign key (tenant_id, reversal_journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete restrict,
  constraint cash_transactions_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint cash_transactions_posted_by_tenant_fk
    foreign key (tenant_id, posted_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint cash_transactions_reversed_by_tenant_fk
    foreign key (tenant_id, reversed_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_cash_transactions_tenant_id_id
  on public.cash_transactions (tenant_id, id);
create unique index if not exists ux_cash_transactions_reference
  on public.cash_transactions (
    tenant_id,
    cash_account_id,
    direction,
    lower(btrim(reference_number))
  );
create unique index if not exists ux_cash_transactions_internal_number
  on public.cash_transactions (tenant_id, internal_number)
  where internal_number is not null;
create unique index if not exists ux_cash_transactions_posting_journal
  on public.cash_transactions (tenant_id, posting_journal_entry_id)
  where posting_journal_entry_id is not null;
create unique index if not exists ux_cash_transactions_reversal_journal
  on public.cash_transactions (tenant_id, reversal_journal_entry_id)
  where reversal_journal_entry_id is not null;
create index if not exists idx_cash_transactions_tenant_status
  on public.cash_transactions (tenant_id, status);
create index if not exists idx_cash_transactions_tenant_date
  on public.cash_transactions (tenant_id, transaction_date);
create index if not exists idx_cash_transactions_business_account
  on public.cash_transactions (tenant_id, business_account_id)
  where business_account_id is not null;
create index if not exists idx_cash_transactions_vendor
  on public.cash_transactions (tenant_id, vendor_id)
  where vendor_id is not null;

create table if not exists public.cash_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  cash_transaction_id uuid not null,
  allocation_type public.cash_allocation_type not null,
  invoice_id uuid,
  supplier_bill_id uuid,
  line_number integer not null,
  description text,
  amount_cents bigint not null,
  created_at timestamptz not null default now(),
  constraint cash_allocations_line_positive
    check (line_number > 0),
  constraint cash_allocations_amount_positive
    check (amount_cents > 0),
  constraint cash_allocations_target
    check (
      (
        allocation_type in (
          'customer_current_due',
          'customer_retention'
        )
        and invoice_id is not null
        and supplier_bill_id is null
      )
      or
      (
        allocation_type = 'supplier_bill'
        and supplier_bill_id is not null
        and invoice_id is null
      )
    ),
  constraint cash_allocations_transaction_tenant_fk
    foreign key (tenant_id, cash_transaction_id)
    references public.cash_transactions(tenant_id, id)
    on delete cascade,
  constraint cash_allocations_invoice_tenant_fk
    foreign key (tenant_id, invoice_id)
    references public.invoices(tenant_id, id)
    on delete restrict,
  constraint cash_allocations_supplier_bill_tenant_fk
    foreign key (tenant_id, supplier_bill_id)
    references public.supplier_bills(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_cash_allocations_transaction_line
  on public.cash_allocations (cash_transaction_id, line_number);
create index if not exists idx_cash_allocations_invoice
  on public.cash_allocations (tenant_id, invoice_id, allocation_type)
  where invoice_id is not null;
create index if not exists idx_cash_allocations_supplier_bill
  on public.cash_allocations (tenant_id, supplier_bill_id)
  where supplier_bill_id is not null;
