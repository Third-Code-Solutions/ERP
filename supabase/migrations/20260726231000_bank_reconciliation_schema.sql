-- Third Code ERP bank reconciliation schema.
-- The following workflow migration uses the committed Cortex enum value.

do $$
begin
  create type public.bank_statement_status as enum (
    'draft',
    'reconciled',
    'voided'
  );
exception
  when duplicate_object then null;
end
$$;

alter type public.cortex_node_type
  add value if not exists 'bank_statement';

create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  cash_account_id uuid not null,
  reference_number varchar(120) not null,
  source_file_name varchar(255) not null,
  source_sha256 char(64) not null,
  status public.bank_statement_status not null default 'draft',
  statement_start date not null,
  statement_end date not null,
  currency char(3) not null default 'PHP',
  opening_balance_cents bigint not null,
  closing_balance_cents bigint not null,
  reconciled_by uuid,
  reconciled_at timestamptz,
  voided_by uuid,
  voided_at timestamptz,
  void_reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_statements_reference_nonempty
    check (
      reference_number = btrim(reference_number)
      and length(reference_number) > 0
    ),
  constraint bank_statements_source_file_nonempty
    check (
      source_file_name = btrim(source_file_name)
      and length(source_file_name) > 0
    ),
  constraint bank_statements_source_sha256_format
    check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint bank_statements_date_order
    check (statement_start <= statement_end),
  constraint bank_statements_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint bank_statements_state
    check (
      (
        status = 'draft'
        and reconciled_by is null
        and reconciled_at is null
        and voided_by is null
        and voided_at is null
        and void_reason is null
      )
      or
      (
        status = 'reconciled'
        and reconciled_by is not null
        and reconciled_at is not null
        and voided_by is null
        and voided_at is null
        and void_reason is null
      )
      or
      (
        status = 'voided'
        and reconciled_by is not null
        and reconciled_at is not null
        and voided_by is not null
        and voided_at is not null
        and length(btrim(void_reason)) >= 3
      )
    ),
  constraint bank_statements_cash_account_tenant_fk
    foreign key (tenant_id, cash_account_id)
    references public.cash_accounts(tenant_id, id)
    on delete restrict,
  constraint bank_statements_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint bank_statements_reconciled_by_tenant_fk
    foreign key (tenant_id, reconciled_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint bank_statements_voided_by_tenant_fk
    foreign key (tenant_id, voided_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_bank_statements_tenant_id_id
  on public.bank_statements (tenant_id, id);
create unique index if not exists ux_bank_statements_reference
  on public.bank_statements (
    tenant_id,
    cash_account_id,
    lower(btrim(reference_number))
  );
create index if not exists idx_bank_statements_tenant_status
  on public.bank_statements (tenant_id, status);
create index if not exists idx_bank_statements_tenant_period
  on public.bank_statements (tenant_id, statement_start, statement_end);

create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  bank_statement_id uuid not null,
  line_number integer not null,
  transaction_date date not null,
  reference_number varchar(120),
  description text not null,
  amount_cents bigint not null,
  matched_cash_transaction_id uuid,
  matched_by uuid,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_statement_lines_number_positive
    check (line_number > 0),
  constraint bank_statement_lines_description_nonempty
    check (length(btrim(description)) > 0),
  constraint bank_statement_lines_reference_trimmed
    check (
      reference_number is null
      or (
        reference_number = btrim(reference_number)
        and length(reference_number) > 0
      )
    ),
  constraint bank_statement_lines_amount_nonzero
    check (amount_cents <> 0),
  constraint bank_statement_lines_match_state
    check (
      (
        matched_cash_transaction_id is null
        and matched_by is null
        and matched_at is null
      )
      or
      (
        matched_cash_transaction_id is not null
        and matched_by is not null
        and matched_at is not null
      )
    ),
  constraint bank_statement_lines_statement_tenant_fk
    foreign key (tenant_id, bank_statement_id)
    references public.bank_statements(tenant_id, id)
    on delete cascade,
  constraint bank_statement_lines_cash_transaction_tenant_fk
    foreign key (tenant_id, matched_cash_transaction_id)
    references public.cash_transactions(tenant_id, id)
    on delete restrict,
  constraint bank_statement_lines_matched_by_tenant_fk
    foreign key (tenant_id, matched_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_bank_statement_lines_statement_line
  on public.bank_statement_lines (bank_statement_id, line_number);
create unique index if not exists ux_bank_statement_lines_fingerprint
  on public.bank_statement_lines (
    bank_statement_id,
    transaction_date,
    coalesce(reference_number, ''),
    amount_cents,
    lower(btrim(description))
  );
create unique index if not exists ux_bank_statement_lines_cash_transaction
  on public.bank_statement_lines (
    tenant_id,
    matched_cash_transaction_id
  )
  where matched_cash_transaction_id is not null;
create index if not exists idx_bank_statement_lines_statement_date
  on public.bank_statement_lines (
    tenant_id,
    bank_statement_id,
    transaction_date
  );
create index if not exists idx_bank_statement_lines_unmatched
  on public.bank_statement_lines (tenant_id, bank_statement_id)
  where matched_cash_transaction_id is null;
