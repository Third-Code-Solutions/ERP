-- Third Code ERP bank statement matching and reconciliation workflow.

create or replace function public.guard_bank_statement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valid_cash_account boolean;
begin
  if tg_op = 'INSERT' or old.status = 'draft' then
    select exists (
      select 1
      from public.cash_accounts cash_account
      join public.ledger_accounts ledger
        on ledger.id = cash_account.ledger_account_id
       and ledger.tenant_id = cash_account.tenant_id
      where cash_account.id = new.cash_account_id
        and cash_account.tenant_id = new.tenant_id
        and cash_account.is_active
        and cash_account.account_kind in ('bank', 'e_wallet')
        and cash_account.currency = new.currency
        and ledger.is_active
        and ledger.account_type = 'asset'
    )
      into v_valid_cash_account;

    if not v_valid_cash_account then
      raise exception 'Active bank or e-wallet Cash Account is required'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (
      new.tenant_id is distinct from old.tenant_id
      or new.cash_account_id is distinct from old.cash_account_id
      or new.reference_number is distinct from old.reference_number
      or new.source_file_name is distinct from old.source_file_name
      or new.source_sha256 is distinct from old.source_sha256
      or new.statement_start is distinct from old.statement_start
      or new.statement_end is distinct from old.statement_end
      or new.currency is distinct from old.currency
      or new.opening_balance_cents is distinct from old.opening_balance_cents
      or new.closing_balance_cents is distinct from old.closing_balance_cents
      or new.reconciled_by is distinct from old.reconciled_by
      or new.reconciled_at is distinct from old.reconciled_at
      or new.created_by is distinct from old.created_by
    ) then
      raise exception 'Reconciled bank statement evidence is immutable'
        using errcode = '55000';
    end if;

    if old.status = 'draft' and new.status = 'reconciled' then
      if coalesce(
        pg_catalog.current_setting('app.bank_statement_reconcile', true),
        ''
      ) <> new.id::text then
        raise exception 'Use the bank statement reconciliation workflow'
          using errcode = '55000';
      end if;
    elsif old.status = 'reconciled' and new.status = 'voided' then
      if coalesce(
        pg_catalog.current_setting('app.bank_statement_void', true),
        ''
      ) <> new.id::text then
        raise exception 'Use the bank statement void workflow'
          using errcode = '55000';
      end if;
    elsif new.status is distinct from old.status then
      raise exception 'Invalid bank statement state transition'
        using errcode = '23514';
    end if;

    if old.status = 'voided' and (
      new.voided_by is distinct from old.voided_by
      or new.voided_at is distinct from old.voided_at
      or new.void_reason is distinct from old.void_reason
    ) then
      raise exception 'Bank statement void evidence is immutable'
        using errcode = '55000';
    end if;
  end if;

  return new;
end
$$;

create or replace function public.guard_bank_statement_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.bank_statements%rowtype;
  v_transaction public.cash_transactions%rowtype;
  v_actor_role text;
begin
  select statement.*
    into v_statement
    from public.bank_statements statement
   where statement.id = coalesce(
     new.bank_statement_id,
     old.bank_statement_id
   );

  if not found or v_statement.status <> 'draft' then
    raise exception 'Only draft bank statement lines can change'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.tenant_id <> v_statement.tenant_id
     or new.transaction_date < v_statement.statement_start
     or new.transaction_date > v_statement.statement_end then
    raise exception 'Bank statement line must match its tenant and date range'
      using errcode = '23514';
  end if;

  if new.matched_cash_transaction_id is not null then
    select cash_tx.*
      into v_transaction
      from public.cash_transactions cash_tx
     where cash_tx.id = new.matched_cash_transaction_id
       and cash_tx.tenant_id = new.tenant_id;

    select app_user.role::text
      into v_actor_role
      from public.users app_user
     where app_user.id = new.matched_by
       and app_user.tenant_id = new.tenant_id;

    if (
      v_transaction.id is null
      or v_transaction.status <> 'posted'
      or v_transaction.cash_account_id <> v_statement.cash_account_id
      or v_transaction.currency <> v_statement.currency
      or pg_catalog.abs(new.amount_cents) <> v_transaction.amount_cents
      or (
        new.amount_cents > 0
        and v_transaction.direction <> 'receipt'
      )
      or (
        new.amount_cents < 0
        and v_transaction.direction <> 'disbursement'
      )
      or v_actor_role not in ('finance', 'admin', 'owner')
    ) then
      raise exception 'Bank statement match does not agree with posted cash'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists guard_bank_statement
  on public.bank_statements;
create trigger guard_bank_statement
before insert or update
on public.bank_statements
for each row execute function public.guard_bank_statement();

drop trigger if exists guard_bank_statement_line
  on public.bank_statement_lines;
create trigger guard_bank_statement_line
before insert or update or delete
on public.bank_statement_lines
for each row execute function public.guard_bank_statement_line();

create or replace function public.match_bank_statement_line(
  p_line_id uuid,
  p_cash_transaction_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.bank_statement_lines%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
begin
  select line.*
    into v_line
    from public.bank_statement_lines line
   where line.id = p_line_id
   for update;

  if not found then
    raise exception 'Bank statement line not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_line.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot match this bank statement line'
      using errcode = '42501';
  end if;

  update public.bank_statement_lines
     set matched_cash_transaction_id = p_cash_transaction_id,
         matched_by = p_actor_id,
         matched_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_line.id;
end
$$;

create or replace function public.unmatch_bank_statement_line(
  p_line_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.bank_statement_lines%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
begin
  select line.*
    into v_line
    from public.bank_statement_lines line
   where line.id = p_line_id
   for update;

  if not found then
    raise exception 'Bank statement line not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_line.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot unmatch this bank statement line'
      using errcode = '42501';
  end if;

  update public.bank_statement_lines
     set matched_cash_transaction_id = null,
         matched_by = null,
         matched_at = null,
         updated_at = pg_catalog.clock_timestamp()
   where id = v_line.id;
end
$$;

create or replace function public.auto_match_bank_statement(
  p_statement_id uuid,
  p_actor_id uuid
)
returns table (
  matched_count integer,
  remaining_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.bank_statements%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_candidate_id uuid;
  v_candidate_count integer;
  v_matched integer := 0;
  v_remaining integer;
  line_record record;
begin
  select statement.*
    into v_statement
    from public.bank_statements statement
   where statement.id = p_statement_id
   for update;

  if not found then
    raise exception 'Bank statement not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_statement.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot auto-match this bank statement'
      using errcode = '42501';
  end if;

  if v_statement.status <> 'draft' then
    raise exception 'Only a draft bank statement can be matched'
      using errcode = '23514';
  end if;

  for line_record in
    select line.*
    from public.bank_statement_lines line
    where line.bank_statement_id = v_statement.id
      and line.tenant_id = v_statement.tenant_id
      and line.matched_cash_transaction_id is null
    order by line.transaction_date, line.line_number
    for update
  loop
    select
      min(cash_tx.id::text)::uuid,
      count(*)::integer
      into v_candidate_id, v_candidate_count
      from public.cash_transactions cash_tx
     where cash_tx.tenant_id = v_statement.tenant_id
       and cash_tx.cash_account_id = v_statement.cash_account_id
       and cash_tx.status = 'posted'
       and cash_tx.currency = v_statement.currency
       and cash_tx.amount_cents = pg_catalog.abs(line_record.amount_cents)
       and cash_tx.direction = case
         when line_record.amount_cents > 0
           then 'receipt'::public.cash_transaction_direction
         else 'disbursement'::public.cash_transaction_direction
       end
       and cash_tx.transaction_date between
         line_record.transaction_date - 7
         and line_record.transaction_date + 7
       and not exists (
         select 1
         from public.bank_statement_lines used_line
         where used_line.tenant_id = cash_tx.tenant_id
           and used_line.matched_cash_transaction_id = cash_tx.id
       );

    if v_candidate_count = 1 then
      update public.bank_statement_lines
         set matched_cash_transaction_id = v_candidate_id,
             matched_by = p_actor_id,
             matched_at = pg_catalog.clock_timestamp(),
             updated_at = pg_catalog.clock_timestamp()
       where id = line_record.id;
      v_matched := v_matched + 1;
    end if;
  end loop;

  select count(*)::integer
    into v_remaining
    from public.bank_statement_lines line
   where line.bank_statement_id = v_statement.id
     and line.tenant_id = v_statement.tenant_id
     and line.matched_cash_transaction_id is null;

  return query select v_matched, v_remaining;
end
$$;

create or replace function public.reconcile_bank_statement(
  p_statement_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.bank_statements%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_line_count integer;
  v_unmatched_count integer;
  v_line_total bigint;
begin
  select statement.*
    into v_statement
    from public.bank_statements statement
   where statement.id = p_statement_id
   for update;

  if not found then
    raise exception 'Bank statement not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_statement.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot reconcile this bank statement'
      using errcode = '42501';
  end if;

  if v_statement.status <> 'draft' then
    raise exception 'Only a draft bank statement can be reconciled'
      using errcode = '23514';
  end if;

  perform 1
  from public.bank_statement_lines line
  where line.bank_statement_id = v_statement.id
    and line.tenant_id = v_statement.tenant_id
  order by line.line_number
  for update;

  select
    count(*)::integer,
    count(*) filter (
      where line.matched_cash_transaction_id is null
    )::integer,
    coalesce(sum(line.amount_cents), 0)::bigint
    into v_line_count, v_unmatched_count, v_line_total
    from public.bank_statement_lines line
   where line.bank_statement_id = v_statement.id
     and line.tenant_id = v_statement.tenant_id;

  if v_line_count < 1 then
    raise exception 'Bank statement requires at least one line'
      using errcode = '23514';
  end if;

  if v_statement.opening_balance_cents + v_line_total
     <> v_statement.closing_balance_cents then
    raise exception 'Bank statement balances do not roll forward'
      using errcode = '23514';
  end if;

  if v_unmatched_count > 0 then
    raise exception 'Every bank statement line must be matched'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.bank_statement_lines line
    left join public.cash_transactions cash_tx
      on cash_tx.id = line.matched_cash_transaction_id
     and cash_tx.tenant_id = line.tenant_id
    where line.bank_statement_id = v_statement.id
      and line.tenant_id = v_statement.tenant_id
      and (
        cash_tx.id is null
        or cash_tx.status <> 'posted'
        or cash_tx.cash_account_id <> v_statement.cash_account_id
        or cash_tx.currency <> v_statement.currency
        or cash_tx.amount_cents <> pg_catalog.abs(line.amount_cents)
        or (
          line.amount_cents > 0
          and cash_tx.direction <> 'receipt'
        )
        or (
          line.amount_cents < 0
          and cash_tx.direction <> 'disbursement'
        )
      )
  ) then
    raise exception 'Matched cash evidence changed before reconciliation'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.bank_statement_reconcile',
    v_statement.id::text,
    true
  );

  update public.bank_statements
     set status = 'reconciled',
         reconciled_by = p_actor_id,
         reconciled_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_statement.id;
end
$$;

create or replace function public.void_bank_statement(
  p_statement_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_statement public.bank_statements%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
begin
  if length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Bank statement void reason is required'
      using errcode = '23514';
  end if;

  select statement.*
    into v_statement
    from public.bank_statements statement
   where statement.id = p_statement_id
   for update;

  if not found then
    raise exception 'Bank statement not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_statement.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot void this bank statement'
      using errcode = '42501';
  end if;

  if v_statement.status <> 'reconciled' then
    raise exception 'Only a reconciled bank statement can be voided'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.bank_statement_void',
    v_statement.id::text,
    true
  );

  update public.bank_statements
     set status = 'voided',
         voided_by = p_actor_id,
         voided_at = pg_catalog.clock_timestamp(),
         void_reason = pg_catalog.btrim(p_reason),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_statement.id;
end
$$;

create or replace function public.guard_cash_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'posted'
     and new.status = 'reversed'
     and exists (
       select 1
       from public.bank_statement_lines line
       join public.bank_statements statement
         on statement.id = line.bank_statement_id
        and statement.tenant_id = line.tenant_id
       where line.tenant_id = old.tenant_id
         and line.matched_cash_transaction_id = old.id
         and statement.status <> 'voided'
     ) then
    raise exception 'Unmatch or void bank reconciliation first'
      using errcode = '23514';
  end if;

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

create or replace function public.cortex_mirror_bank_statement()
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
  line_record record;
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

    if tg_op = 'DELETE' then
      perform public.cortex_close_node(
        v_tenant_id,
        tg_table_name,
        v_ref_id,
        auth.uid(),
        'bank_statements:delete'
      );
      return old;
    end if;

    v_node_id := public.cortex_upsert_node(
      v_tenant_id,
      'bank_statement'::public.cortex_node_type,
      tg_table_name,
      v_ref_id,
      v_row ->> 'reference_number',
      pg_catalog.format(
        '%s | %s to %s | %s',
        v_row ->> 'status',
        v_row ->> 'statement_start',
        v_row ->> 'statement_end',
        v_row ->> 'currency'
      ),
      v_row - 'created_by' - 'reconciled_by' - 'voided_by',
      auth.uid(),
      'bank_statements:' || lower(tg_op)
    );

    v_target_id := public.cortex_node_current(
      v_tenant_id,
      'cash_accounts',
      nullif(v_row ->> 'cash_account_id', '')::uuid
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

    for line_record in
      select line.matched_cash_transaction_id
      from public.bank_statement_lines line
      where line.bank_statement_id = v_ref_id
        and line.tenant_id = v_tenant_id
        and line.matched_cash_transaction_id is not null
    loop
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'cash_transactions',
        line_record.matched_cash_transaction_id
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_node_id,
          v_target_id,
          'references_doc',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    end loop;
  exception
    when others then
      raise warning 'cortex_mirror_bank_statement failed: %', sqlerrm;
  end;

  return coalesce(new, old);
end
$$;

drop trigger if exists cortex_mirror_bank_statement
  on public.bank_statements;
create trigger cortex_mirror_bank_statement
after insert or update or delete
on public.bank_statements
for each row execute function public.cortex_mirror_bank_statement();

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
        and app_user.role::text in ('finance', 'admin', 'owner')
    )
    else true
  end
$$;

drop trigger if exists audit_bank_statements
  on public.bank_statements;
create trigger audit_bank_statements
after insert or update or delete
on public.bank_statements
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_bank_statement_lines
  on public.bank_statement_lines;
create trigger audit_bank_statement_lines
after insert or update or delete
on public.bank_statement_lines
for each row execute function public.audit_log_trigger();

alter table public.bank_statements enable row level security;
alter table public.bank_statements force row level security;
alter table public.bank_statement_lines enable row level security;
alter table public.bank_statement_lines force row level security;

create policy bank_statements_finance_read
on public.bank_statements
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy bank_statements_finance_insert
on public.bank_statements
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and public.auth_can_manage_finance()
);

create policy bank_statements_finance_update
on public.bank_statements
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
  and public.auth_can_manage_finance()
);

create policy bank_statements_finance_delete
on public.bank_statements
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_finance()
);

create policy bank_statement_lines_finance_read
on public.bank_statement_lines
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy bank_statement_lines_finance_insert
on public.bank_statement_lines
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.bank_statements statement
    where statement.id = bank_statement_lines.bank_statement_id
      and statement.tenant_id = bank_statement_lines.tenant_id
      and statement.status = 'draft'
  )
);

create policy bank_statement_lines_finance_update
on public.bank_statement_lines
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.bank_statements statement
    where statement.id = bank_statement_lines.bank_statement_id
      and statement.tenant_id = bank_statement_lines.tenant_id
      and statement.status = 'draft'
  )
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.bank_statements statement
    where statement.id = bank_statement_lines.bank_statement_id
      and statement.tenant_id = bank_statement_lines.tenant_id
      and statement.status = 'draft'
  )
);

create policy bank_statement_lines_finance_delete
on public.bank_statement_lines
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.bank_statements statement
    where statement.id = bank_statement_lines.bank_statement_id
      and statement.tenant_id = bank_statement_lines.tenant_id
      and statement.status = 'draft'
  )
);

revoke all privileges on table public.bank_statements
  from public, anon, authenticated;
revoke all privileges on table public.bank_statement_lines
  from public, anon, authenticated;

grant select on table public.bank_statements
  to authenticated;
grant insert (
  tenant_id,
  cash_account_id,
  reference_number,
  source_file_name,
  source_sha256,
  status,
  statement_start,
  statement_end,
  currency,
  opening_balance_cents,
  closing_balance_cents,
  created_by
)
on table public.bank_statements
to authenticated;
grant update (
  cash_account_id,
  reference_number,
  source_file_name,
  source_sha256,
  statement_start,
  statement_end,
  currency,
  opening_balance_cents,
  closing_balance_cents,
  updated_at
)
on table public.bank_statements
to authenticated;
grant delete on table public.bank_statements
  to authenticated;

grant select on table public.bank_statement_lines
  to authenticated;
grant insert (
  tenant_id,
  bank_statement_id,
  line_number,
  transaction_date,
  reference_number,
  description,
  amount_cents
)
on table public.bank_statement_lines
to authenticated;
grant update (
  line_number,
  transaction_date,
  reference_number,
  description,
  amount_cents,
  updated_at
)
on table public.bank_statement_lines
to authenticated;
grant delete on table public.bank_statement_lines
  to authenticated;

grant all privileges on table public.bank_statements
  to service_role;
grant all privileges on table public.bank_statement_lines
  to service_role;

revoke execute on function public.guard_bank_statement()
  from public, anon, authenticated;
revoke execute on function public.guard_bank_statement_line()
  from public, anon, authenticated;
revoke execute on function public.match_bank_statement_line(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.unmatch_bank_statement_line(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.auto_match_bank_statement(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.reconcile_bank_statement(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.void_bank_statement(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.cortex_mirror_bank_statement()
  from public, anon, authenticated;

grant execute on function public.guard_bank_statement()
  to service_role;
grant execute on function public.guard_bank_statement_line()
  to service_role;
grant execute on function public.match_bank_statement_line(uuid, uuid, uuid)
  to service_role;
grant execute on function public.unmatch_bank_statement_line(uuid, uuid)
  to service_role;
grant execute on function public.auto_match_bank_statement(uuid, uuid)
  to service_role;
grant execute on function public.reconcile_bank_statement(uuid, uuid)
  to service_role;
grant execute on function public.void_bank_statement(uuid, uuid, text)
  to service_role;
grant execute on function public.cortex_mirror_bank_statement()
  to service_role;
