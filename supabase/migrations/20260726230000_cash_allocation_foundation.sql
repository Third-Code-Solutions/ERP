-- Third Code ERP cash allocation foundation.
-- Forward-only: cash moves the ledger only with complete subledger evidence.

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

create or replace function public.cortex_mirror_cash()
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
  allocation record;
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

    if tg_table_name = 'cash_accounts' then
      if tg_op = 'DELETE' then
        perform public.cortex_close_node(
          v_tenant_id,
          tg_table_name,
          v_ref_id,
          auth.uid(),
          'cash_accounts:delete'
        );
        return old;
      end if;

      v_node_id := public.cortex_upsert_node(
        v_tenant_id,
        'cash_account'::public.cortex_node_type,
        tg_table_name,
        v_ref_id,
        v_row ->> 'name',
        pg_catalog.format(
          '%s | %s | %s',
          v_row ->> 'account_kind',
          v_row ->> 'currency',
          case
            when (v_row ->> 'is_active')::boolean then 'active'
            else 'inactive'
          end
        ),
        v_row - 'created_by' - 'account_identifier_last4',
        auth.uid(),
        'cash_accounts:' || lower(tg_op)
      );

      v_fk := nullif(v_row ->> 'ledger_account_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'ledger_accounts',
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
    elsif tg_table_name = 'cash_transactions' then
      if tg_op = 'DELETE' then
        perform public.cortex_close_node(
          v_tenant_id,
          tg_table_name,
          v_ref_id,
          auth.uid(),
          'cash_transactions:delete'
        );
        return old;
      end if;

      v_node_id := public.cortex_upsert_node(
        v_tenant_id,
        'cash_transaction'::public.cortex_node_type,
        tg_table_name,
        v_ref_id,
        coalesce(
          nullif(v_row ->> 'internal_number', ''),
          v_row ->> 'reference_number'
        ),
        pg_catalog.format(
          '%s | %s | %s | %s',
          v_row ->> 'direction',
          v_row ->> 'status',
          v_row ->> 'currency',
          v_row ->> 'amount_cents'
        ),
        v_row
          - 'created_by'
          - 'posted_by'
          - 'reversed_by',
        auth.uid(),
        'cash_transactions:' || lower(tg_op)
      );

      v_fk := nullif(v_row ->> 'cash_account_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'cash_accounts',
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

      v_fk := nullif(v_row ->> 'business_account_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'accounts',
        v_fk
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_target_id,
          v_node_id,
          'pays',
          'canonical',
          1,
          auth.uid()
        );
      end if;

      v_fk := nullif(v_row ->> 'vendor_id', '')::uuid;
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'vendors',
        v_fk
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_node_id,
          v_target_id,
          'pays',
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

      for allocation in
        select
          cash_allocation.invoice_id,
          cash_allocation.supplier_bill_id
        from public.cash_allocations cash_allocation
        where cash_allocation.cash_transaction_id = v_ref_id
          and cash_allocation.tenant_id = v_tenant_id
      loop
        if allocation.invoice_id is not null then
          v_target_id := public.cortex_node_current(
            v_tenant_id,
            'invoices',
            allocation.invoice_id
          );
        else
          v_target_id := public.cortex_node_current(
            v_tenant_id,
            'supplier_bills',
            allocation.supplier_bill_id
          );
        end if;

        if v_target_id is not null then
          perform public.cortex_upsert_edge(
            v_tenant_id,
            v_node_id,
            v_target_id,
            'pays',
            'canonical',
            1,
            auth.uid()
          );
        end if;
      end loop;
    end if;
  exception
    when others then
      raise warning 'cortex_mirror_cash(%) failed: %',
        tg_table_name,
        sqlerrm;
  end;

  return coalesce(new, old);
end
$$;

drop trigger if exists cortex_mirror_cash
  on public.cash_accounts;
create trigger cortex_mirror_cash
after insert or update or delete
on public.cash_accounts
for each row execute function public.cortex_mirror_cash();

drop trigger if exists cortex_mirror_cash
  on public.cash_transactions;
create trigger cortex_mirror_cash
after insert or update or delete
on public.cash_transactions
for each row execute function public.cortex_mirror_cash();

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

drop trigger if exists audit_cash_accounts
  on public.cash_accounts;
create trigger audit_cash_accounts
after insert or update or delete
on public.cash_accounts
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_cash_transactions
  on public.cash_transactions;
create trigger audit_cash_transactions
after insert or update or delete
on public.cash_transactions
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_cash_allocations
  on public.cash_allocations;
create trigger audit_cash_allocations
after insert or update or delete
on public.cash_allocations
for each row execute function public.audit_log_trigger();

alter table public.cash_accounts enable row level security;
alter table public.cash_accounts force row level security;
alter table public.cash_transactions enable row level security;
alter table public.cash_transactions force row level security;
alter table public.cash_allocations enable row level security;
alter table public.cash_allocations force row level security;

create policy cash_accounts_finance_read
on public.cash_accounts
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy cash_accounts_finance_insert
on public.cash_accounts
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and public.auth_can_manage_finance()
);

create policy cash_accounts_finance_update
on public.cash_accounts
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy cash_accounts_finance_delete
on public.cash_accounts
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and not exists (
    select 1
    from public.cash_transactions cash_tx
    where cash_tx.tenant_id = cash_accounts.tenant_id
      and cash_tx.cash_account_id = cash_accounts.id
  )
);

create policy cash_transactions_finance_read
on public.cash_transactions
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy cash_transactions_finance_insert
on public.cash_transactions
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and posting_journal_entry_id is null
  and public.auth_can_manage_finance()
);

create policy cash_transactions_finance_update
on public.cash_transactions
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

create policy cash_transactions_finance_delete
on public.cash_transactions
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_finance()
);

create policy cash_allocations_finance_read
on public.cash_allocations
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy cash_allocations_finance_insert
on public.cash_allocations
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.cash_transactions cash_tx
    where cash_tx.id = cash_allocations.cash_transaction_id
      and cash_tx.tenant_id = cash_allocations.tenant_id
      and cash_tx.status = 'draft'
  )
);

create policy cash_allocations_finance_update
on public.cash_allocations
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.cash_transactions cash_tx
    where cash_tx.id = cash_allocations.cash_transaction_id
      and cash_tx.tenant_id = cash_allocations.tenant_id
      and cash_tx.status = 'draft'
  )
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.cash_transactions cash_tx
    where cash_tx.id = cash_allocations.cash_transaction_id
      and cash_tx.tenant_id = cash_allocations.tenant_id
      and cash_tx.status = 'draft'
  )
);

create policy cash_allocations_finance_delete
on public.cash_allocations
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.cash_transactions cash_tx
    where cash_tx.id = cash_allocations.cash_transaction_id
      and cash_tx.tenant_id = cash_allocations.tenant_id
      and cash_tx.status = 'draft'
  )
);

revoke all privileges on table public.cash_accounts
  from public, anon, authenticated;
revoke all privileges on table public.cash_transactions
  from public, anon, authenticated;
revoke all privileges on table public.cash_allocations
  from public, anon, authenticated;

grant select on table public.cash_accounts
  to authenticated;
grant insert (
  tenant_id,
  ledger_account_id,
  name,
  account_kind,
  bank_name,
  account_identifier_last4,
  currency,
  is_active,
  created_by
)
on table public.cash_accounts
to authenticated;
grant update (
  ledger_account_id,
  name,
  account_kind,
  bank_name,
  account_identifier_last4,
  currency,
  is_active,
  updated_at
)
on table public.cash_accounts
to authenticated;
grant delete on table public.cash_accounts
  to authenticated;

grant select on table public.cash_transactions
  to authenticated;
grant insert (
  tenant_id,
  cash_account_id,
  direction,
  business_account_id,
  vendor_id,
  reference_number,
  status,
  transaction_date,
  currency,
  amount_cents,
  notes,
  created_by
)
on table public.cash_transactions
to authenticated;
grant update (
  cash_account_id,
  direction,
  business_account_id,
  vendor_id,
  reference_number,
  transaction_date,
  currency,
  amount_cents,
  notes,
  updated_at
)
on table public.cash_transactions
to authenticated;
grant delete on table public.cash_transactions
  to authenticated;

grant select on table public.cash_allocations
  to authenticated;
grant insert (
  tenant_id,
  cash_transaction_id,
  allocation_type,
  invoice_id,
  supplier_bill_id,
  line_number,
  description,
  amount_cents
)
on table public.cash_allocations
to authenticated;
grant update (
  allocation_type,
  invoice_id,
  supplier_bill_id,
  line_number,
  description,
  amount_cents
)
on table public.cash_allocations
to authenticated;
grant delete on table public.cash_allocations
  to authenticated;

grant all privileges on table public.cash_accounts
  to service_role;
grant all privileges on table public.cash_transactions
  to service_role;
grant all privileges on table public.cash_allocations
  to service_role;

-- Payment state becomes a projection of active receipt allocation evidence.
create or replace function public.guard_customer_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid_journal boolean;
  v_valid_reversal boolean;
  v_cash_status_change boolean;
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

  if old.status in (
       'issued',
       'overdue',
       'partial_payment',
       'paid'
     )
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

  v_cash_status_change :=
    new.status is distinct from old.status
    and (
      new.status in ('partial_payment', 'paid')
      or (
        old.status in ('partial_payment', 'paid')
        and new.status in ('issued', 'overdue')
      )
    );

  if v_cash_status_change and coalesce(
    pg_catalog.current_setting(
      'app.cash_allocation_invoice',
      true
    ),
    ''
  ) <> new.id::text then
    raise exception 'Receipt allocation evidence is required for payment status'
      using errcode = '23514';
  end if;

  return new;
end
$$;

-- Preserve Customer, Vendor, and project dimensions in every reversal. Each
-- controlled subledger owns its own reversal state.
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

  if v_original.reference_type = 'cash_transaction'
     and coalesce(
       pg_catalog.current_setting(
         'app.cash_transaction_reversal',
         true
       ),
       ''
     ) <> v_original.reference_id::text then
    raise exception 'Use the cash transaction reversal workflow'
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

create or replace function public.reverse_cash_transaction(
  p_transaction_id uuid,
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
  v_transaction public.cash_transactions%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_reversal_id uuid;
  v_reversal_number text;
  invoice_record record;
begin
  if length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Cash transaction reversal reason is required'
      using errcode = '23514';
  end if;

  select cash_tx.*
    into v_transaction
    from public.cash_transactions cash_tx
   where cash_tx.id = p_transaction_id
   for update;

  if not found then
    raise exception 'Cash transaction not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_transaction.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot reverse this cash transaction'
      using errcode = '42501';
  end if;

  if v_transaction.status <> 'posted'
     or v_transaction.posting_journal_entry_id is null then
    raise exception 'Only a posted cash transaction can be reversed'
      using errcode = '23514';
  end if;

  if v_transaction.reversal_journal_entry_id is not null then
    raise exception 'Cash transaction already has a reversal'
      using errcode = '23505';
  end if;

  if p_posting_date < v_transaction.transaction_date then
    raise exception 'Reversal date cannot precede cash transaction date'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.cash_transaction_reversal',
    v_transaction.id::text,
    true
  );

  select reversal.reversal_entry_id, reversal.reversal_number
    into v_reversal_id, v_reversal_number
    from public.reverse_journal_entry(
      v_transaction.posting_journal_entry_id,
      p_actor_id,
      p_reason,
      p_posting_date
    ) reversal;

  update public.cash_transactions
     set status = 'reversed',
         reversed_by = p_actor_id,
         reversed_at = pg_catalog.clock_timestamp(),
         reversal_reason = pg_catalog.btrim(p_reason),
         reversal_journal_entry_id = v_reversal_id,
         updated_at = pg_catalog.clock_timestamp()
   where id = v_transaction.id;

  if v_transaction.direction = 'receipt' then
    for invoice_record in
      select distinct allocation.invoice_id
      from public.cash_allocations allocation
      where allocation.cash_transaction_id = v_transaction.id
        and allocation.invoice_id is not null
    loop
      perform public.refresh_customer_invoice_cash_status(
        invoice_record.invoice_id
      );
    end loop;
  end if;

  return query
  select v_reversal_id, v_reversal_number;
end
$$;

-- Documents with active cash allocations must unwind cash evidence first.
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

  if v_invoice.status not in (
       'issued',
       'overdue',
       'partial_payment',
       'paid'
     )
     or v_invoice.issuance_journal_entry_id is null then
    raise exception 'Only a posted invoice can be reversed'
      using errcode = '23514';
  end if;

  if v_invoice.reversal_journal_entry_id is not null then
    raise exception 'Customer invoice already has a reversal'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.cash_allocations allocation
    join public.cash_transactions cash_tx
      on cash_tx.id = allocation.cash_transaction_id
     and cash_tx.tenant_id = allocation.tenant_id
    where allocation.tenant_id = v_invoice.tenant_id
      and allocation.invoice_id = v_invoice.id
      and cash_tx.status = 'posted'
  ) then
    raise exception 'Reverse allocated customer receipts first'
      using errcode = '23514';
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

  if exists (
    select 1
    from public.cash_allocations allocation
    join public.cash_transactions cash_tx
      on cash_tx.id = allocation.cash_transaction_id
     and cash_tx.tenant_id = allocation.tenant_id
    where allocation.tenant_id = v_bill.tenant_id
      and allocation.supplier_bill_id = v_bill.id
      and cash_tx.status = 'posted'
  ) then
    raise exception 'Reverse allocated Vendor disbursements first'
      using errcode = '23514';
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

create or replace function public.guard_cash_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ledger_account_id is distinct from new.ledger_account_id
     and exists (
       select 1
       from public.cash_transactions cash_tx
       where cash_tx.tenant_id = old.tenant_id
         and cash_tx.cash_account_id = old.id
         and cash_tx.status <> 'draft'
     ) then
    raise exception 'Used Cash Account ledger mapping is immutable'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create or replace function public.guard_cash_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
    new.tenant_id is distinct from old.tenant_id
    or new.cash_account_id is distinct from old.cash_account_id
    or new.direction is distinct from old.direction
    or new.business_account_id is distinct from old.business_account_id
    or new.vendor_id is distinct from old.vendor_id
    or new.reference_number is distinct from old.reference_number
    or new.internal_number is distinct from old.internal_number
    or new.transaction_date is distinct from old.transaction_date
    or new.currency is distinct from old.currency
    or new.amount_cents is distinct from old.amount_cents
    or new.posting_journal_entry_id is distinct from old.posting_journal_entry_id
    or new.posted_by is distinct from old.posted_by
    or new.posted_at is distinct from old.posted_at
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Posted cash transaction terms are immutable'
      using errcode = '55000';
  end if;

  if old.reversal_journal_entry_id is not null and (
    new.reversal_journal_entry_id is distinct from old.reversal_journal_entry_id
    or new.reversed_by is distinct from old.reversed_by
    or new.reversed_at is distinct from old.reversed_at
    or new.reversal_reason is distinct from old.reversal_reason
  ) then
    raise exception 'Cash transaction reversal linkage is immutable'
      using errcode = '55000';
  end if;

  return new;
end
$$;

create or replace function public.guard_cash_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid :=
    coalesce(new.cash_transaction_id, old.cash_transaction_id);
  v_status public.cash_transaction_status;
begin
  select cash_tx.status
    into v_status
    from public.cash_transactions cash_tx
   where cash_tx.id = v_transaction_id;

  if v_status is distinct from 'draft' then
    raise exception 'Posted cash allocations are immutable'
      using errcode = '55000';
  end if;

  return coalesce(new, old);
end
$$;

drop trigger if exists guard_cash_account
  on public.cash_accounts;
create trigger guard_cash_account
before update
on public.cash_accounts
for each row execute function public.guard_cash_account();

drop trigger if exists guard_cash_transaction
  on public.cash_transactions;
create trigger guard_cash_transaction
before update or delete
on public.cash_transactions
for each row execute function public.guard_cash_transaction();

drop trigger if exists guard_cash_allocation
  on public.cash_allocations;
create trigger guard_cash_allocation
before insert or update or delete
on public.cash_allocations
for each row execute function public.guard_cash_allocation();

create or replace function public.refresh_customer_invoice_cash_status(
  p_invoice_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_current_allocated bigint;
  v_retention_allocated bigint;
  v_status public.invoice_status;
begin
  select invoice.*
    into v_invoice
    from public.invoices invoice
   where invoice.id = p_invoice_id
   for update;

  if not found or v_invoice.status = 'cancelled' then
    return;
  end if;

  select
    coalesce(sum(allocation.amount_cents) filter (
      where allocation.allocation_type = 'customer_current_due'
    ), 0)::bigint,
    coalesce(sum(allocation.amount_cents) filter (
      where allocation.allocation_type = 'customer_retention'
    ), 0)::bigint
    into v_current_allocated, v_retention_allocated
    from public.cash_allocations allocation
    join public.cash_transactions cash_tx
      on cash_tx.id = allocation.cash_transaction_id
     and cash_tx.tenant_id = allocation.tenant_id
   where allocation.tenant_id = v_invoice.tenant_id
     and allocation.invoice_id = v_invoice.id
     and cash_tx.status = 'posted';

  v_status := case
    when v_current_allocated >= v_invoice.net_amount_cents
         and v_retention_allocated >= v_invoice.retention_cents
      then 'paid'::public.invoice_status
    when v_current_allocated + v_retention_allocated > 0
      then 'partial_payment'::public.invoice_status
    when v_invoice.due_date is not null
         and v_invoice.due_date < current_date
      then 'overdue'::public.invoice_status
    else 'issued'::public.invoice_status
  end;

  perform pg_catalog.set_config(
    'app.cash_allocation_invoice',
    v_invoice.id::text,
    true
  );

  update public.invoices
     set status = v_status,
         paid_at = case
           when v_status = 'paid' then
             coalesce(paid_at, pg_catalog.clock_timestamp())
           else null
         end,
         updated_at = pg_catalog.clock_timestamp()
   where id = v_invoice.id
     and (
       status is distinct from v_status
       or (v_status = 'paid' and paid_at is null)
       or (v_status <> 'paid' and paid_at is not null)
     );
end
$$;

create or replace function public.post_cash_transaction(
  p_transaction_id uuid,
  p_actor_id uuid,
  p_posting_date date default current_date
)
returns table (
  journal_entry_id uuid,
  journal_entry_number text,
  cash_transaction_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.cash_transactions%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_cash_ledger_account_id uuid;
  v_cash_account_currency text;
  v_line_count integer;
  v_allocated_amount bigint;
  v_ar_account_id uuid;
  v_retention_account_id uuid;
  v_ap_account_id uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_sequence_value bigint;
  v_internal_number text;
  v_line_number integer := 0;
  allocation record;
  invoice_record record;
begin
  select cash_tx.*
    into v_transaction
    from public.cash_transactions cash_tx
   where cash_tx.id = p_transaction_id
   for update;

  if not found then
    raise exception 'Cash transaction not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_transaction.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot post this cash transaction'
      using errcode = '42501';
  end if;

  if v_transaction.status <> 'draft'
     or v_transaction.posting_journal_entry_id is not null then
    raise exception 'Only an unposted draft cash transaction can be posted'
      using errcode = '23514';
  end if;

  if p_posting_date < v_transaction.transaction_date then
    raise exception 'Posting date cannot precede cash transaction date'
      using errcode = '23514';
  end if;

  select ledger.id, cash_account.currency
    into v_cash_ledger_account_id, v_cash_account_currency
    from public.cash_accounts cash_account
    join public.ledger_accounts ledger
      on ledger.id = cash_account.ledger_account_id
     and ledger.tenant_id = cash_account.tenant_id
   where cash_account.id = v_transaction.cash_account_id
     and cash_account.tenant_id = v_transaction.tenant_id
     and cash_account.is_active
     and ledger.is_active
     and ledger.account_type = 'asset'
   for key share of cash_account, ledger;

  if v_cash_ledger_account_id is null
     or v_cash_account_currency <> v_transaction.currency then
    raise exception 'Active matching Cash Account is required'
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    coalesce(sum(allocation.amount_cents), 0)::bigint
    into v_line_count, v_allocated_amount
    from public.cash_allocations allocation
   where allocation.cash_transaction_id = v_transaction.id
     and allocation.tenant_id = v_transaction.tenant_id;

  if v_line_count < 1
     or v_allocated_amount <> v_transaction.amount_cents then
    raise exception 'Cash allocations must equal transaction amount'
      using errcode = '23514';
  end if;

  if v_transaction.direction = 'receipt' then
    perform 1
    from public.invoices invoice
    where invoice.tenant_id = v_transaction.tenant_id
      and invoice.id in (
        select allocation.invoice_id
        from public.cash_allocations allocation
        where allocation.cash_transaction_id = v_transaction.id
          and allocation.tenant_id = v_transaction.tenant_id
      )
    order by invoice.id
    for update;

    if exists (
      select 1
      from public.cash_allocations allocation
      join public.invoices invoice
        on invoice.id = allocation.invoice_id
       and invoice.tenant_id = allocation.tenant_id
      where allocation.cash_transaction_id = v_transaction.id
        and allocation.tenant_id = v_transaction.tenant_id
        and (
          allocation.allocation_type not in (
            'customer_current_due',
            'customer_retention'
          )
          or invoice.account_id <> v_transaction.business_account_id
          or invoice.status not in (
            'issued',
            'overdue',
            'partial_payment'
          )
          or invoice.reversal_journal_entry_id is not null
        )
    ) then
      raise exception 'Receipt allocations must match open customer invoices'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from (
        select
          current_allocation.invoice_id,
          current_allocation.allocation_type,
          sum(current_allocation.amount_cents)::bigint as current_amount
        from public.cash_allocations current_allocation
        where current_allocation.cash_transaction_id = v_transaction.id
          and current_allocation.tenant_id = v_transaction.tenant_id
        group by
          current_allocation.invoice_id,
          current_allocation.allocation_type
      ) current_group
      join public.invoices invoice
        on invoice.id = current_group.invoice_id
       and invoice.tenant_id = v_transaction.tenant_id
      where current_group.current_amount + (
        select coalesce(sum(previous.amount_cents), 0)::bigint
        from public.cash_allocations previous
        join public.cash_transactions previous_transaction
          on previous_transaction.id = previous.cash_transaction_id
         and previous_transaction.tenant_id = previous.tenant_id
        where previous.tenant_id = v_transaction.tenant_id
          and previous.invoice_id = current_group.invoice_id
          and previous.allocation_type =
            current_group.allocation_type
          and previous_transaction.status = 'posted'
          and previous_transaction.id <> v_transaction.id
      ) > case
        when current_group.allocation_type = 'customer_current_due'
          then invoice.net_amount_cents
        else invoice.retention_cents
      end
    ) then
      raise exception 'Receipt allocation exceeds open invoice component'
        using errcode = '23514';
    end if;

    select account.id
      into v_ar_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_transaction.tenant_id
       and account.system_key = 'accounts_receivable'
       and account.account_type = 'asset'
       and account.is_active;

    if exists (
      select 1
      from public.cash_allocations allocation
      where allocation.cash_transaction_id = v_transaction.id
        and allocation.allocation_type = 'customer_retention'
    ) then
      select account.id
        into v_retention_account_id
        from public.ledger_accounts account
       where account.tenant_id = v_transaction.tenant_id
         and account.system_key = 'retention_receivable'
         and account.account_type = 'asset'
         and account.is_active;
    end if;

    if v_ar_account_id is null then
      raise exception 'Active Accounts Receivable control account is required'
        using errcode = '23514';
    end if;
    if v_retention_account_id is null and exists (
      select 1
      from public.cash_allocations allocation
      where allocation.cash_transaction_id = v_transaction.id
        and allocation.allocation_type = 'customer_retention'
    ) then
      raise exception 'Active Retention Receivable control account is required'
        using errcode = '23514';
    end if;
  else
    perform 1
    from public.supplier_bills bill
    where bill.tenant_id = v_transaction.tenant_id
      and bill.id in (
        select allocation.supplier_bill_id
        from public.cash_allocations allocation
        where allocation.cash_transaction_id = v_transaction.id
          and allocation.tenant_id = v_transaction.tenant_id
      )
    order by bill.id
    for update;

    if exists (
      select 1
      from public.cash_allocations allocation
      join public.supplier_bills bill
        on bill.id = allocation.supplier_bill_id
       and bill.tenant_id = allocation.tenant_id
      where allocation.cash_transaction_id = v_transaction.id
        and allocation.tenant_id = v_transaction.tenant_id
        and (
          allocation.allocation_type <> 'supplier_bill'
          or bill.vendor_id <> v_transaction.vendor_id
          or bill.status <> 'posted'
        )
    ) then
      raise exception 'Disbursement allocations must match open Supplier Bills'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from (
        select
          current_allocation.supplier_bill_id,
          sum(current_allocation.amount_cents)::bigint as current_amount
        from public.cash_allocations current_allocation
        where current_allocation.cash_transaction_id = v_transaction.id
          and current_allocation.tenant_id = v_transaction.tenant_id
        group by current_allocation.supplier_bill_id
      ) current_group
      join public.supplier_bills bill
        on bill.id = current_group.supplier_bill_id
       and bill.tenant_id = v_transaction.tenant_id
      where current_group.current_amount + (
        select coalesce(sum(previous.amount_cents), 0)::bigint
        from public.cash_allocations previous
        join public.cash_transactions previous_transaction
          on previous_transaction.id = previous.cash_transaction_id
         and previous_transaction.tenant_id = previous.tenant_id
        where previous.tenant_id = v_transaction.tenant_id
          and previous.supplier_bill_id =
            current_group.supplier_bill_id
          and previous_transaction.status = 'posted'
          and previous_transaction.id <> v_transaction.id
      ) > bill.total_payable_cents
    ) then
      raise exception 'Disbursement allocation exceeds open Supplier Bill'
        using errcode = '23514';
    end if;

    select account.id
      into v_ap_account_id
      from public.ledger_accounts account
     where account.tenant_id = v_transaction.tenant_id
       and account.system_key = 'accounts_payable'
       and account.account_type = 'liability'
       and account.is_active;

    if v_ap_account_id is null then
      raise exception 'Active Accounts Payable control account is required'
        using errcode = '23514';
    end if;
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
    v_transaction.tenant_id,
    p_posting_date,
    case
      when v_transaction.direction = 'receipt'
        then 'Customer receipt ' || v_transaction.reference_number
      else 'Vendor disbursement ' || v_transaction.reference_number
    end,
    'cash_transaction',
    v_transaction.id,
    v_transaction.currency,
    'system',
    p_actor_id
  )
  returning id into v_journal_id;

  if v_transaction.direction = 'receipt' then
    v_line_number := v_line_number + 1;
    insert into public.journal_lines (
      tenant_id,
      journal_entry_id,
      ledger_account_id,
      business_account_id,
      line_number,
      description,
      debit_cents,
      credit_cents
    )
    values (
      v_transaction.tenant_id,
      v_journal_id,
      v_cash_ledger_account_id,
      v_transaction.business_account_id,
      v_line_number,
      'Cash received',
      v_transaction.amount_cents,
      0
    );

    for allocation in
      select
        cash_allocation.*,
        invoice.project_id
      from public.cash_allocations cash_allocation
      join public.invoices invoice
        on invoice.id = cash_allocation.invoice_id
       and invoice.tenant_id = cash_allocation.tenant_id
      where cash_allocation.cash_transaction_id = v_transaction.id
        and cash_allocation.tenant_id = v_transaction.tenant_id
      order by cash_allocation.line_number
    loop
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
        v_transaction.tenant_id,
        v_journal_id,
        case
          when allocation.allocation_type = 'customer_retention'
            then v_retention_account_id
          else v_ar_account_id
        end,
        allocation.project_id,
        v_transaction.business_account_id,
        v_line_number,
        coalesce(
          nullif(pg_catalog.btrim(allocation.description), ''),
          'Customer receipt allocation'
        ),
        0,
        allocation.amount_cents
      );
    end loop;
  else
    for allocation in
      select
        cash_allocation.*,
        bill.project_id
      from public.cash_allocations cash_allocation
      join public.supplier_bills bill
        on bill.id = cash_allocation.supplier_bill_id
       and bill.tenant_id = cash_allocation.tenant_id
      where cash_allocation.cash_transaction_id = v_transaction.id
        and cash_allocation.tenant_id = v_transaction.tenant_id
      order by cash_allocation.line_number
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
        v_transaction.tenant_id,
        v_journal_id,
        v_ap_account_id,
        allocation.project_id,
        v_transaction.vendor_id,
        v_line_number,
        coalesce(
          nullif(pg_catalog.btrim(allocation.description), ''),
          'Supplier Bill disbursement allocation'
        ),
        allocation.amount_cents,
        0
      );
    end loop;

    v_line_number := v_line_number + 1;
    insert into public.journal_lines (
      tenant_id,
      journal_entry_id,
      ledger_account_id,
      vendor_id,
      line_number,
      description,
      debit_cents,
      credit_cents
    )
    values (
      v_transaction.tenant_id,
      v_journal_id,
      v_cash_ledger_account_id,
      v_transaction.vendor_id,
      v_line_number,
      'Cash disbursed',
      0,
      v_transaction.amount_cents
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
    v_transaction.tenant_id,
    'cash_transaction:' || pg_catalog.to_char(p_posting_date, 'YYYY'),
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
    'CT-%s-%s',
    pg_catalog.to_char(p_posting_date, 'YYYY'),
    pg_catalog.lpad(v_sequence_value::text, 6, '0')
  );

  update public.cash_transactions
     set status = 'posted',
         internal_number = v_internal_number,
         posting_journal_entry_id = v_journal_id,
         posted_by = p_actor_id,
         posted_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_transaction.id;

  if v_transaction.direction = 'receipt' then
    for invoice_record in
      select distinct allocation.invoice_id
      from public.cash_allocations allocation
      where allocation.cash_transaction_id = v_transaction.id
        and allocation.invoice_id is not null
    loop
      perform public.refresh_customer_invoice_cash_status(
        invoice_record.invoice_id
      );
    end loop;
  end if;

  return query
  select v_journal_id, v_journal_number, v_internal_number;
end
$$;

revoke execute on function public.guard_cash_account()
  from public, anon, authenticated;
revoke execute on function public.guard_cash_transaction()
  from public, anon, authenticated;
revoke execute on function public.guard_cash_allocation()
  from public, anon, authenticated;
revoke execute on function public.refresh_customer_invoice_cash_status(uuid)
  from public, anon, authenticated;
revoke execute on function public.post_cash_transaction(uuid, uuid, date)
  from public, anon, authenticated;
revoke execute on function public.reverse_cash_transaction(uuid, uuid, text, date)
  from public, anon, authenticated;
revoke execute on function public.cortex_mirror_cash()
  from public, anon, authenticated;

grant execute on function public.guard_cash_account()
  to service_role;
grant execute on function public.guard_cash_transaction()
  to service_role;
grant execute on function public.guard_cash_allocation()
  to service_role;
grant execute on function public.refresh_customer_invoice_cash_status(uuid)
  to service_role;
grant execute on function public.post_cash_transaction(uuid, uuid, date)
  to service_role;
grant execute on function public.reverse_cash_transaction(uuid, uuid, text, date)
  to service_role;
grant execute on function public.cortex_mirror_cash()
  to service_role;
