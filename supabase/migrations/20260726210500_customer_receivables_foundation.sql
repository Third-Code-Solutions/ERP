-- Third Code ERP customer receivables foundation.
-- Forward-only: invoice issuance posts one immutable, dimensional journal.

create unique index if not exists ux_accounts_tenant_id_id
  on public.accounts (tenant_id, id);
create unique index if not exists ux_invoices_tenant_id_id
  on public.invoices (tenant_id, id);

alter table public.invoices
  add column if not exists account_id uuid,
  add column if not exists issued_by uuid,
  add column if not exists issued_at timestamptz,
  add column if not exists issuance_journal_entry_id uuid,
  add column if not exists reversed_by uuid,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text,
  add column if not exists reversal_journal_entry_id uuid;

update public.invoices invoice
   set account_id = project.account_id
  from public.projects project
 where project.id = invoice.project_id
   and project.tenant_id = invoice.tenant_id
   and invoice.account_id is null
   and project.account_id is not null;

alter table public.invoices
  drop constraint if exists invoices_project_tenant_fk;
alter table public.invoices
  add constraint invoices_project_tenant_fk
  foreign key (tenant_id, project_id)
  references public.projects(tenant_id, id)
  on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_account_tenant_fk;
alter table public.invoices
  add constraint invoices_account_tenant_fk
  foreign key (tenant_id, account_id)
  references public.accounts(tenant_id, id)
  on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_issued_by_tenant_fk;
alter table public.invoices
  add constraint invoices_issued_by_tenant_fk
  foreign key (tenant_id, issued_by)
  references public.users(tenant_id, id)
  on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_issuance_journal_tenant_fk;
alter table public.invoices
  add constraint invoices_issuance_journal_tenant_fk
  foreign key (tenant_id, issuance_journal_entry_id)
  references public.journal_entries(tenant_id, id)
  on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_reversed_by_tenant_fk;
alter table public.invoices
  add constraint invoices_reversed_by_tenant_fk
  foreign key (tenant_id, reversed_by)
  references public.users(tenant_id, id)
  on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_reversal_journal_tenant_fk;
alter table public.invoices
  add constraint invoices_reversal_journal_tenant_fk
  foreign key (tenant_id, reversal_journal_entry_id)
  references public.journal_entries(tenant_id, id)
  on delete restrict;

alter table public.invoices
  drop constraint if exists invoices_amounts_consistent;
alter table public.invoices
  add constraint invoices_amounts_consistent
  check (
    subtotal_cents >= 0
    and retention_cents >= 0
    and retention_cents <= subtotal_cents
    and vat_cents >= 0
    and withholding_tax_cents >= 0
    and net_amount_cents =
      subtotal_cents
      - retention_cents
      + vat_cents
      - withholding_tax_cents
    and net_amount_cents >= 0
  );

alter table public.invoices
  drop constraint if exists invoices_issuance_state;
alter table public.invoices
  add constraint invoices_issuance_state
  check (
    (
      issuance_journal_entry_id is null
      and issued_by is null
      and issued_at is null
    )
    or
    (
      issuance_journal_entry_id is not null
      and issued_by is not null
      and issued_at is not null
    )
  );

alter table public.invoices
  drop constraint if exists invoices_reversal_state;
alter table public.invoices
  add constraint invoices_reversal_state
  check (
    (
      reversal_journal_entry_id is null
      and reversed_by is null
      and reversed_at is null
      and reversal_reason is null
    )
    or
    (
      reversal_journal_entry_id is not null
      and reversed_by is not null
      and reversed_at is not null
      and length(btrim(reversal_reason)) > 0
    )
  );

create index if not exists idx_invoices_tenant_account
  on public.invoices (tenant_id, account_id)
  where account_id is not null;
create unique index if not exists ux_invoices_tenant_issuance_journal
  on public.invoices (tenant_id, issuance_journal_entry_id)
  where issuance_journal_entry_id is not null;
create unique index if not exists ux_invoices_tenant_reversal_journal
  on public.invoices (tenant_id, reversal_journal_entry_id)
  where reversal_journal_entry_id is not null;

alter table public.journal_lines
  add column if not exists business_account_id uuid;

alter table public.journal_lines
  drop constraint if exists journal_lines_business_account_tenant_fk;
alter table public.journal_lines
  add constraint journal_lines_business_account_tenant_fk
  foreign key (tenant_id, business_account_id)
  references public.accounts(tenant_id, id)
  on delete restrict;

create index if not exists idx_journal_lines_tenant_business_account
  on public.journal_lines (tenant_id, business_account_id)
  where business_account_id is not null;

-- Preserve the Business Account dimension in every equal-and-opposite
-- reversal now that journal lines carry that dimension.
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

create or replace function public.guard_customer_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid_journal boolean;
  v_valid_reversal boolean;
begin
  if old.status <> 'draft' and (
    new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id
    or new.account_id is distinct from old.account_id
    or new.invoice_number is distinct from old.invoice_number
    or new.billing_percent_bps is distinct from old.billing_percent_bps
    or new.retention_bps is distinct from old.retention_bps
    or new.subtotal_cents is distinct from old.subtotal_cents
    or new.retention_cents is distinct from old.retention_cents
    or new.vat_cents is distinct from old.vat_cents
    or new.withholding_tax_cents is distinct from old.withholding_tax_cents
    or new.net_amount_cents is distinct from old.net_amount_cents
    or new.due_date is distinct from old.due_date
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Issued invoice financial terms are immutable'
      using errcode = '55000';
  end if;

  if old.issuance_journal_entry_id is not null and (
    new.issuance_journal_entry_id is distinct from old.issuance_journal_entry_id
    or new.issued_by is distinct from old.issued_by
    or new.issued_at is distinct from old.issued_at
  ) then
    raise exception 'Invoice issuance linkage is immutable'
      using errcode = '55000';
  end if;

  if old.reversal_journal_entry_id is not null and (
    new.reversal_journal_entry_id is distinct from old.reversal_journal_entry_id
    or new.reversed_by is distinct from old.reversed_by
    or new.reversed_at is distinct from old.reversed_at
    or new.reversal_reason is distinct from old.reversal_reason
  ) then
    raise exception 'Invoice reversal linkage is immutable'
      using errcode = '55000';
  end if;

  if old.status = 'draft' and new.status = 'issued' then
    if new.issuance_journal_entry_id is null then
      raise exception 'Invoice issuance requires a posted journal'
        using errcode = '23514';
    end if;

    select exists (
      select 1
      from public.journal_entries entry
      where entry.id = new.issuance_journal_entry_id
        and entry.tenant_id = new.tenant_id
        and entry.status = 'posted'
        and entry.source_type = 'system'
        and entry.reference_type = 'customer_invoice'
        and entry.reference_id = new.id
    )
      into v_valid_journal;

    if not v_valid_journal then
      raise exception 'Invoice issuance journal is invalid'
        using errcode = '23514';
    end if;
  end if;

  if old.status in ('issued', 'overdue', 'partial_payment')
     and new.status = 'cancelled' then
    if new.reversal_journal_entry_id is null then
      raise exception 'Issued invoice cancellation requires a posted reversal'
        using errcode = '23514';
    end if;

    select exists (
      select 1
      from public.journal_entries reversal
      where reversal.id = new.reversal_journal_entry_id
        and reversal.tenant_id = new.tenant_id
        and reversal.status = 'posted'
        and reversal.source_type = 'reversal'
        and reversal.reverses_entry_id = old.issuance_journal_entry_id
    )
      into v_valid_reversal;

    if not v_valid_reversal then
      raise exception 'Invoice reversal journal is invalid'
        using errcode = '23514';
    end if;
  end if;

  if new.status in ('partial_payment', 'paid')
     and new.status is distinct from old.status then
    raise exception 'Receipt allocation evidence is required for payment status'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists guard_customer_invoice
  on public.invoices;
create trigger guard_customer_invoice
before update
on public.invoices
for each row execute function public.guard_customer_invoice();

create or replace function public.issue_customer_invoice(
  p_invoice_id uuid,
  p_actor_id uuid,
  p_posting_date date default current_date
)
returns table (
  journal_entry_id uuid,
  journal_entry_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_business_account_id uuid;
  v_ar_account_id uuid;
  v_retention_account_id uuid;
  v_withholding_account_id uuid;
  v_revenue_account_id uuid;
  v_output_vat_account_id uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_line_number integer := 0;
begin
  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id
   for update;

  if not found then
    raise exception 'Customer invoice not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_invoice.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot issue this customer invoice'
      using errcode = '42501';
  end if;

  if v_invoice.status <> 'draft'
     or v_invoice.issuance_journal_entry_id is not null then
    raise exception 'Only an unposted draft invoice can be issued'
      using errcode = '23514';
  end if;

  select coalesce(v_invoice.account_id, project.account_id)
    into v_business_account_id
    from public.projects project
   where project.id = v_invoice.project_id
     and project.tenant_id = v_invoice.tenant_id
   for share;

  if v_business_account_id is null then
    raise exception 'Customer invoice requires a Business Account'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.accounts business_account
    where business_account.id = v_business_account_id
      and business_account.tenant_id = v_invoice.tenant_id
  ) then
    raise exception 'Customer invoice Business Account is invalid'
      using errcode = '23514';
  end if;

  if (
    v_invoice.subtotal_cents <= 0
    or v_invoice.retention_cents < 0
    or v_invoice.retention_cents > v_invoice.subtotal_cents
    or v_invoice.vat_cents < 0
    or v_invoice.withholding_tax_cents < 0
    or v_invoice.net_amount_cents <= 0
    or v_invoice.net_amount_cents <>
      v_invoice.subtotal_cents
      - v_invoice.retention_cents
      + v_invoice.vat_cents
      - v_invoice.withholding_tax_cents
  ) then
    raise exception 'Customer invoice amounts do not reconcile'
      using errcode = '23514';
  end if;

  select account.id
    into v_ar_account_id
    from public.ledger_accounts account
   where account.tenant_id = v_invoice.tenant_id
     and account.system_key = 'accounts_receivable'
     and account.account_type = 'asset'
     and account.is_active;

  select account.id
    into v_revenue_account_id
    from public.ledger_accounts account
   where account.tenant_id = v_invoice.tenant_id
     and account.system_key = 'revenue'
     and account.account_type = 'income'
     and account.is_active;

  if v_invoice.retention_cents > 0 then
    select account.id
      into v_retention_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_invoice.tenant_id
       and account.system_key = 'retention_receivable'
       and account.account_type = 'asset'
       and account.is_active;
  end if;

  if v_invoice.withholding_tax_cents > 0 then
    select account.id
      into v_withholding_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_invoice.tenant_id
       and account.system_key = 'withholding_tax_receivable'
       and account.account_type = 'asset'
       and account.is_active;
  end if;

  if v_invoice.vat_cents > 0 then
    select account.id
      into v_output_vat_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_invoice.tenant_id
       and account.system_key = 'output_vat_payable'
       and account.account_type = 'liability'
       and account.is_active;
  end if;

  if v_ar_account_id is null then
    raise exception 'Active Accounts Receivable control account is required'
      using errcode = '23514';
  end if;
  if v_revenue_account_id is null then
    raise exception 'Active Revenue control account is required'
      using errcode = '23514';
  end if;
  if v_invoice.retention_cents > 0
     and v_retention_account_id is null then
    raise exception 'Active Retention Receivable control account is required'
      using errcode = '23514';
  end if;
  if v_invoice.withholding_tax_cents > 0
     and v_withholding_account_id is null then
    raise exception 'Active Withholding Tax Receivable control account is required'
      using errcode = '23514';
  end if;
  if v_invoice.vat_cents > 0
     and v_output_vat_account_id is null then
    raise exception 'Active Output VAT control account is required'
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
    v_invoice.tenant_id,
    p_posting_date,
    'Customer invoice ' || v_invoice.invoice_number,
    'customer_invoice',
    v_invoice.id,
    'PHP',
    'system',
    p_actor_id
  )
  returning id into v_journal_id;

  v_line_number := v_line_number + 1;
  insert into public.journal_lines (
    tenant_id,
    journal_entry_id,
    ledger_account_id,
    project_id,
    business_account_id,
    line_number,
    description,
    debit_cents,
    credit_cents
  )
  values (
    v_invoice.tenant_id,
    v_journal_id,
    v_ar_account_id,
    v_invoice.project_id,
    v_business_account_id,
    v_line_number,
    'Amount currently due',
    v_invoice.net_amount_cents,
    0
  );

  if v_invoice.retention_cents > 0 then
    v_line_number := v_line_number + 1;
    insert into public.journal_lines (
      tenant_id,
      journal_entry_id,
      ledger_account_id,
      project_id,
      business_account_id,
      line_number,
      description,
      debit_cents,
      credit_cents
    )
    values (
      v_invoice.tenant_id,
      v_journal_id,
      v_retention_account_id,
      v_invoice.project_id,
      v_business_account_id,
      v_line_number,
      'Contract retention receivable',
      v_invoice.retention_cents,
      0
    );
  end if;

  if v_invoice.withholding_tax_cents > 0 then
    v_line_number := v_line_number + 1;
    insert into public.journal_lines (
      tenant_id,
      journal_entry_id,
      ledger_account_id,
      project_id,
      business_account_id,
      line_number,
      description,
      debit_cents,
      credit_cents
    )
    values (
      v_invoice.tenant_id,
      v_journal_id,
      v_withholding_account_id,
      v_invoice.project_id,
      v_business_account_id,
      v_line_number,
      'Creditable withholding tax receivable',
      v_invoice.withholding_tax_cents,
      0
    );
  end if;

  v_line_number := v_line_number + 1;
  insert into public.journal_lines (
    tenant_id,
    journal_entry_id,
    ledger_account_id,
    project_id,
    business_account_id,
    line_number,
    description,
    debit_cents,
    credit_cents
  )
  values (
    v_invoice.tenant_id,
    v_journal_id,
    v_revenue_account_id,
    v_invoice.project_id,
    v_business_account_id,
    v_line_number,
    'Project revenue',
    0,
    v_invoice.subtotal_cents
  );

  if v_invoice.vat_cents > 0 then
    v_line_number := v_line_number + 1;
    insert into public.journal_lines (
      tenant_id,
      journal_entry_id,
      ledger_account_id,
      project_id,
      business_account_id,
      line_number,
      description,
      debit_cents,
      credit_cents
    )
    values (
      v_invoice.tenant_id,
      v_journal_id,
      v_output_vat_account_id,
      v_invoice.project_id,
      v_business_account_id,
      v_line_number,
      'Output VAT',
      0,
      v_invoice.vat_cents
    );
  end if;

  select posted.posted_number
    into v_journal_number
    from public.post_journal_entry(v_journal_id, p_actor_id) posted;

  update public.invoices
     set account_id = v_business_account_id,
         status = 'issued',
         issued_by = p_actor_id,
         issued_at = pg_catalog.clock_timestamp(),
         issuance_journal_entry_id = v_journal_id,
         updated_at = pg_catalog.clock_timestamp()
   where id = v_invoice.id;

  return query
  select v_journal_id, v_journal_number;
end
$$;

create or replace function public.cancel_customer_invoice(
  p_invoice_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
begin
  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id
   for update;

  if not found then
    raise exception 'Customer invoice not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_invoice.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot cancel this customer invoice'
      using errcode = '42501';
  end if;

  if v_invoice.status <> 'draft'
     or v_invoice.issuance_journal_entry_id is not null then
    raise exception 'Only an unposted draft invoice can be cancelled'
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

  update public.invoices
     set status = 'cancelled',
         updated_at = pg_catalog.clock_timestamp()
   where id = p_invoice_id;
end
$$;

create or replace function public.reverse_customer_invoice(
  p_invoice_id uuid,
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
  v_invoice public.invoices%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_reversal_id uuid;
  v_reversal_number text;
begin
  if length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Invoice reversal reason is required'
      using errcode = '23514';
  end if;

  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id
   for update;

  if not found then
    raise exception 'Customer invoice not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_invoice.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot reverse this customer invoice'
      using errcode = '42501';
  end if;

  if v_invoice.status not in ('issued', 'overdue', 'partial_payment')
     or v_invoice.issuance_journal_entry_id is null then
    raise exception 'Only a posted open invoice can be reversed'
      using errcode = '23514';
  end if;

  if v_invoice.reversal_journal_entry_id is not null then
    raise exception 'Customer invoice already has a reversal'
      using errcode = '23505';
  end if;

  perform pg_catalog.set_config(
    'app.customer_invoice_reversal',
    v_invoice.id::text,
    true
  );

  select reversal.reversal_entry_id, reversal.reversal_number
    into v_reversal_id, v_reversal_number
    from public.reverse_journal_entry(
      v_invoice.issuance_journal_entry_id,
      p_actor_id,
      p_reason,
      p_posting_date
    ) reversal;

  update public.invoices
     set status = 'cancelled',
         reversed_by = p_actor_id,
         reversed_at = pg_catalog.clock_timestamp(),
         reversal_reason = pg_catalog.btrim(p_reason),
         reversal_journal_entry_id = v_reversal_id,
         updated_at = pg_catalog.clock_timestamp()
   where id = v_invoice.id;

  return query
  select v_reversal_id, v_reversal_number;
end
$$;

-- Add Business Account context to the finance graph without replacing the
-- canonical finance mirror function from the preceding migration.
create or replace function public.cortex_mirror_receivable_dimensions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record_node uuid;
  v_account_node uuid;
  v_account_id uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_table_name = 'invoices' then
    v_account_id := new.account_id;
  elsif tg_table_name = 'journal_lines' then
    v_account_id := new.business_account_id;
  else
    return new;
  end if;

  if v_account_id is null then
    return new;
  end if;

  v_record_node := public.cortex_node_current(
    new.tenant_id,
    tg_table_name,
    new.id
  );
  v_account_node := public.cortex_node_current(
    new.tenant_id,
    'accounts',
    v_account_id
  );

  if v_record_node is not null and v_account_node is not null then
    perform public.cortex_upsert_edge(
      new.tenant_id,
      v_account_node,
      v_record_node,
      'bills',
      'canonical',
      1,
      auth.uid()
    );
  end if;
exception
  when others then
    raise warning 'cortex_mirror_receivable_dimensions(%) failed: %',
      tg_table_name,
      sqlerrm;

  return new;
end
$$;

drop trigger if exists cortex_mirror_receivable_dimensions
  on public.invoices;
create trigger cortex_mirror_receivable_dimensions
after insert or update
on public.invoices
for each row execute function public.cortex_mirror_receivable_dimensions();

drop trigger if exists cortex_mirror_receivable_dimensions
  on public.journal_lines;
create trigger cortex_mirror_receivable_dimensions
after insert or update
on public.journal_lines
for each row execute function public.cortex_mirror_receivable_dimensions();

-- Treat invoice graph records as finance-sensitive. Existing non-finance graph
-- types retain their current visibility behavior.
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

-- Finance-only Data API access. Trusted server actions call the functions above.
drop policy if exists invoices_tenant_read
  on public.invoices;
drop policy if exists invoices_tenant_insert
  on public.invoices;
drop policy if exists invoices_tenant_update
  on public.invoices;
drop policy if exists invoices_finance_read
  on public.invoices;
drop policy if exists invoices_finance_insert
  on public.invoices;
drop policy if exists invoices_finance_update
  on public.invoices;

create policy invoices_finance_read
on public.invoices
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy invoices_finance_insert
on public.invoices
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and issuance_journal_entry_id is null
  and public.auth_can_manage_finance()
);

create policy invoices_finance_update
on public.invoices
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
  and issuance_journal_entry_id is null
  and public.auth_can_manage_finance()
);

revoke all privileges on table public.invoices
  from public, anon, authenticated;
grant select on table public.invoices
  to authenticated;
grant insert (
  tenant_id,
  project_id,
  account_id,
  created_by,
  invoice_number,
  status,
  billing_percent_bps,
  retention_bps,
  subtotal_cents,
  retention_cents,
  vat_cents,
  withholding_tax_cents,
  net_amount_cents,
  due_date,
  notes
)
on table public.invoices
to authenticated;
grant update (
  project_id,
  account_id,
  billing_percent_bps,
  retention_bps,
  subtotal_cents,
  retention_cents,
  vat_cents,
  withholding_tax_cents,
  net_amount_cents,
  due_date,
  notes,
  updated_at
)
on table public.invoices
to authenticated;
grant all privileges on table public.invoices
  to service_role;

grant insert (business_account_id)
on table public.journal_lines
to authenticated;
grant update (business_account_id)
on table public.journal_lines
to authenticated;

revoke execute on function public.guard_customer_invoice()
  from public, anon, authenticated;
revoke execute on function public.issue_customer_invoice(uuid, uuid, date)
  from public, anon, authenticated;
revoke execute on function public.cancel_customer_invoice(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.reverse_customer_invoice(uuid, uuid, text, date)
  from public, anon, authenticated;
revoke execute on function public.cortex_mirror_receivable_dimensions()
  from public, anon, authenticated;

grant execute on function public.guard_customer_invoice()
  to service_role;
grant execute on function public.issue_customer_invoice(uuid, uuid, date)
  to service_role;
grant execute on function public.cancel_customer_invoice(uuid, uuid)
  to service_role;
grant execute on function public.reverse_customer_invoice(uuid, uuid, text, date)
  to service_role;
grant execute on function public.cortex_mirror_receivable_dimensions()
  to service_role;
