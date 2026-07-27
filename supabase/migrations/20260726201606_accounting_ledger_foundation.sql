-- Third Code ERP accounting ledger foundation.
-- Forward-only: balanced posting, immutable ledger lines, and linked reversals.

-- Composite keys used by tenant-consistent foreign keys below.
create unique index if not exists ux_users_tenant_id_id
  on public.users (tenant_id, id);
create unique index if not exists ux_projects_tenant_id_id
  on public.projects (tenant_id, id);

do $$
begin
  create type public.fiscal_period_status as enum ('open', 'closed');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.ledger_account_type as enum (
    'asset',
    'liability',
    'equity',
    'income',
    'expense'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.normal_balance as enum ('debit', 'credit');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.journal_entry_status as enum ('draft', 'posted');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.journal_source as enum ('manual', 'system', 'reversal');
exception
  when duplicate_object then null;
end
$$;

alter type public.cortex_node_type
  add value if not exists 'fiscal_period';
alter type public.cortex_node_type
  add value if not exists 'ledger_account';
alter type public.cortex_node_type
  add value if not exists 'journal_entry';
alter type public.cortex_node_type
  add value if not exists 'journal_line';

create table if not exists public.fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  name varchar(100) not null,
  starts_on date not null,
  ends_on date not null,
  status public.fiscal_period_status not null default 'open',
  created_by uuid not null,
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_periods_date_order
    check (starts_on <= ends_on),
  constraint fiscal_periods_closed_state
    check (
      (status = 'open' and closed_by is null and closed_at is null)
      or
      (status = 'closed' and closed_by is not null and closed_at is not null)
    ),
  constraint fiscal_periods_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint fiscal_periods_closed_by_tenant_fk
    foreign key (tenant_id, closed_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_fiscal_periods_tenant_name
  on public.fiscal_periods (tenant_id, name);
create unique index if not exists ux_fiscal_periods_tenant_id_id
  on public.fiscal_periods (tenant_id, id);
create index if not exists idx_fiscal_periods_tenant_dates
  on public.fiscal_periods (tenant_id, starts_on, ends_on);
create index if not exists idx_fiscal_periods_tenant_status
  on public.fiscal_periods (tenant_id, status);

create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  code varchar(30) not null,
  name varchar(160) not null,
  account_type public.ledger_account_type not null,
  normal_balance public.normal_balance not null,
  parent_id uuid,
  system_key varchar(60),
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ledger_accounts_code_nonempty
    check (length(btrim(code)) > 0),
  constraint ledger_accounts_name_nonempty
    check (length(btrim(name)) > 0),
  constraint ledger_accounts_normal_balance_matches_type
    check (
      (account_type in ('asset', 'expense') and normal_balance = 'debit')
      or
      (account_type in ('liability', 'equity', 'income') and normal_balance = 'credit')
    ),
  constraint ledger_accounts_not_own_parent
    check (parent_id is null or parent_id <> id),
  constraint ledger_accounts_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_ledger_accounts_tenant_code
  on public.ledger_accounts (tenant_id, code);
create unique index if not exists ux_ledger_accounts_tenant_id_id
  on public.ledger_accounts (tenant_id, id);
create unique index if not exists ux_ledger_accounts_tenant_system_key
  on public.ledger_accounts (tenant_id, system_key)
  where system_key is not null;
create index if not exists idx_ledger_accounts_tenant_type
  on public.ledger_accounts (tenant_id, account_type);
create index if not exists idx_ledger_accounts_parent_id
  on public.ledger_accounts (parent_id);

alter table public.ledger_accounts
  drop constraint if exists ledger_accounts_parent_tenant_fk;
alter table public.ledger_accounts
  add constraint ledger_accounts_parent_tenant_fk
  foreign key (tenant_id, parent_id)
  references public.ledger_accounts(tenant_id, id)
  on delete restrict;

create table if not exists public.financial_sequences (
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  sequence_key varchar(80) not null,
  next_value bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, sequence_key),
  constraint financial_sequences_positive
    check (next_value > 0)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  fiscal_period_id uuid,
  entry_number varchar(40),
  status public.journal_entry_status not null default 'draft',
  source_type public.journal_source not null default 'manual',
  posting_date date not null,
  description text not null,
  reference_type varchar(80),
  reference_id uuid,
  currency char(3) not null default 'PHP',
  reverses_entry_id uuid,
  created_by uuid not null,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_description_nonempty
    check (length(btrim(description)) > 0),
  constraint journal_entries_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint journal_entries_posted_state
    check (
      (
        status = 'draft'
        and entry_number is null
        and fiscal_period_id is null
        and posted_by is null
        and posted_at is null
      )
      or
      (
        status = 'posted'
        and entry_number is not null
        and fiscal_period_id is not null
        and posted_by is not null
        and posted_at is not null
      )
    ),
  constraint journal_entries_reversal_source
    check (
      (source_type = 'reversal' and reverses_entry_id is not null)
      or
      (source_type <> 'reversal' and reverses_entry_id is null)
    ),
  constraint journal_entries_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint journal_entries_posted_by_tenant_fk
    foreign key (tenant_id, posted_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint journal_entries_period_tenant_fk
    foreign key (tenant_id, fiscal_period_id)
    references public.fiscal_periods(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_journal_entries_tenant_id_id
  on public.journal_entries (tenant_id, id);
create unique index if not exists ux_journal_entries_tenant_number
  on public.journal_entries (tenant_id, entry_number)
  where entry_number is not null;
create unique index if not exists ux_journal_entries_reverses_entry
  on public.journal_entries (tenant_id, reverses_entry_id)
  where reverses_entry_id is not null;
create index if not exists idx_journal_entries_tenant_posting_date
  on public.journal_entries (tenant_id, posting_date desc);
create index if not exists idx_journal_entries_tenant_status
  on public.journal_entries (tenant_id, status);
create index if not exists idx_journal_entries_reference
  on public.journal_entries (tenant_id, reference_type, reference_id);

alter table public.journal_entries
  drop constraint if exists journal_entries_reverses_tenant_fk;
alter table public.journal_entries
  add constraint journal_entries_reverses_tenant_fk
  foreign key (tenant_id, reverses_entry_id)
  references public.journal_entries(tenant_id, id)
  on delete restrict;

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  journal_entry_id uuid not null,
  ledger_account_id uuid not null,
  project_id uuid,
  line_number integer not null,
  description text,
  debit_cents bigint not null default 0,
  credit_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint journal_lines_line_number_positive
    check (line_number > 0),
  constraint journal_lines_one_sided_positive_amount
    check (
      (debit_cents > 0 and credit_cents = 0)
      or
      (credit_cents > 0 and debit_cents = 0)
    ),
  constraint journal_lines_entry_tenant_fk
    foreign key (tenant_id, journal_entry_id)
    references public.journal_entries(tenant_id, id)
    on delete cascade,
  constraint journal_lines_account_tenant_fk
    foreign key (tenant_id, ledger_account_id)
    references public.ledger_accounts(tenant_id, id)
    on delete restrict,
  constraint journal_lines_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_journal_lines_entry_line
  on public.journal_lines (journal_entry_id, line_number);
create index if not exists idx_journal_lines_tenant_account
  on public.journal_lines (tenant_id, ledger_account_id);
create index if not exists idx_journal_lines_tenant_project
  on public.journal_lines (tenant_id, project_id)
  where project_id is not null;
create index if not exists idx_journal_lines_entry
  on public.journal_lines (journal_entry_id);

-- Fiscal periods cannot overlap. The advisory lock makes the predicate safe
-- under concurrent inserts and updates without another extension.
create or replace function public.guard_fiscal_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'closed' then
      raise exception 'Closed fiscal periods cannot be deleted'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.journal_entries entry
      where entry.fiscal_period_id = old.id
    ) then
      raise exception 'Fiscal periods with journal entries cannot be deleted'
        using errcode = '23503';
    end if;

    return old;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'fiscal_periods:' || new.tenant_id::text,
      0
    )
  );

  if tg_op = 'UPDATE' then
    if old.status = 'closed' then
      raise exception 'Closed fiscal periods are immutable'
        using errcode = '23514';
    end if;

    if (
      old.starts_on <> new.starts_on
      or old.ends_on <> new.ends_on
    ) and exists (
      select 1
      from public.journal_entries entry
      where entry.fiscal_period_id = old.id
    ) then
      raise exception 'Fiscal period dates cannot move after posting'
        using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1
    from public.fiscal_periods period
    where period.tenant_id = new.tenant_id
      and period.id <> new.id
      and new.starts_on <= period.ends_on
      and new.ends_on >= period.starts_on
  ) then
    raise exception 'Fiscal periods cannot overlap'
      using errcode = '23P01';
  end if;

  if new.status = 'closed' then
    new.closed_at := coalesce(new.closed_at, pg_catalog.clock_timestamp());
    new.closed_by := coalesce(new.closed_by, auth.uid());
  else
    new.closed_at := null;
    new.closed_by := null;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

drop trigger if exists guard_fiscal_period_row
  on public.fiscal_periods;
create trigger guard_fiscal_period_row
before insert or update or delete
on public.fiscal_periods
for each row execute function public.guard_fiscal_period();

-- Once posted, both the journal header and its lines are immutable.
create or replace function public.guard_posted_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'posted' then
    raise exception 'Posted journal entries are immutable'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

drop trigger if exists guard_posted_journal_entry_row
  on public.journal_entries;
create trigger guard_posted_journal_entry_row
before update or delete
on public.journal_entries
for each row execute function public.guard_posted_journal_entry();

create or replace function public.guard_posted_journal_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_status public.journal_entry_status;
begin
  v_entry_id := case
    when tg_op = 'DELETE' then old.journal_entry_id
    else new.journal_entry_id
  end;

  select entry.status
    into v_status
    from public.journal_entries entry
   where entry.id = v_entry_id;

  if v_status = 'posted' then
    raise exception 'Posted journal lines are immutable'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$$;

drop trigger if exists guard_posted_journal_line_row
  on public.journal_lines;
create trigger guard_posted_journal_line_row
before insert or update or delete
on public.journal_lines
for each row execute function public.guard_posted_journal_line();

-- Role helper used only by authenticated finance policies.
create or replace function public.auth_can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users app_user
    where app_user.id = auth.uid()
      and app_user.tenant_id = public.auth_tenant_id()
      and app_user.role::text in ('finance', 'admin', 'owner')
  )
$$;

-- Transactional posting authority. Application code may prepare drafts, but
-- only this function can assign a number or mark a journal posted.
create or replace function public.post_journal_entry(
  p_entry_id uuid,
  p_actor_id uuid
)
returns table (
  journal_entry_id uuid,
  posted_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.journal_entries%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_period_id uuid;
  v_line_count integer;
  v_total_debit bigint;
  v_total_credit bigint;
  v_sequence_key text;
  v_sequence_value bigint;
  v_number text;
begin
  select entry.*
    into v_entry
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
    or v_actor_tenant <> v_entry.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot post this journal entry'
      using errcode = '42501';
  end if;

  if v_entry.status <> 'draft' then
    raise exception 'Only draft journal entries can be posted'
      using errcode = '23514';
  end if;

  select period.id
    into v_period_id
    from public.fiscal_periods period
   where period.tenant_id = v_entry.tenant_id
     and period.status = 'open'
     and v_entry.posting_date between period.starts_on and period.ends_on
   order by period.starts_on
   limit 1
   for share;

  if v_period_id is null then
    raise exception 'Posting date is not in an open fiscal period'
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    coalesce(sum(line.debit_cents), 0)::bigint,
    coalesce(sum(line.credit_cents), 0)::bigint
    into v_line_count, v_total_debit, v_total_credit
    from public.journal_lines line
   where line.journal_entry_id = p_entry_id
     and line.tenant_id = v_entry.tenant_id;

  if v_line_count < 2 then
    raise exception 'A posted journal requires at least two lines'
      using errcode = '23514';
  end if;

  if v_total_debit <= 0 or v_total_debit <> v_total_credit then
    raise exception 'Journal debits and credits must balance above zero'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.journal_lines line
    join public.ledger_accounts account
      on account.tenant_id = line.tenant_id
     and account.id = line.ledger_account_id
    where line.journal_entry_id = p_entry_id
      and line.tenant_id = v_entry.tenant_id
      and not account.is_active
  ) then
    raise exception 'Inactive ledger accounts cannot receive postings'
      using errcode = '23514';
  end if;

  v_sequence_key :=
    'journal:' || pg_catalog.to_char(v_entry.posting_date, 'YYYY');

  insert into public.financial_sequences (
    tenant_id,
    sequence_key,
    next_value,
    updated_at
  )
  values (
    v_entry.tenant_id,
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

  v_number := pg_catalog.format(
    'JE-%s-%s',
    pg_catalog.to_char(v_entry.posting_date, 'YYYY'),
    pg_catalog.lpad(v_sequence_value::text, 6, '0')
  );

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

  update public.journal_entries
     set status = 'posted',
         entry_number = v_number,
         fiscal_period_id = v_period_id,
         posted_by = p_actor_id,
         posted_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = p_entry_id;

  return query
  select p_entry_id, v_number;
end
$$;

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

create or replace function public.close_fiscal_period(
  p_period_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.fiscal_periods%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
begin
  select period.*
    into v_period
    from public.fiscal_periods period
   where period.id = p_period_id
   for update;

  if not found then
    raise exception 'Fiscal period not found'
      using errcode = 'P0002';
  end if;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;

  if (
    v_actor_tenant is null
    or v_actor_tenant <> v_period.tenant_id
    or v_actor_role not in ('finance', 'admin', 'owner')
  ) then
    raise exception 'Actor cannot close this fiscal period'
      using errcode = '42501';
  end if;

  if v_period.status <> 'open' then
    raise exception 'Fiscal period is already closed'
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

  update public.fiscal_periods
     set status = 'closed',
         closed_by = p_actor_id,
         closed_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = p_period_id;
end
$$;

-- Finance graph projection. Canonical ERP rows remain the source of truth.
create or replace function public.cortex_mirror_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_clean jsonb;
  v_tenant_id uuid;
  v_ref_id uuid;
  v_node_type text;
  v_title text;
  v_summary text;
  v_node_id uuid;
  v_target_id uuid;
  v_fk uuid;
  v_actor_id uuid;
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

    case tg_table_name
      when 'fiscal_periods' then
        v_node_type := 'fiscal_period';
        v_title := v_row ->> 'name';
        v_summary := pg_catalog.format(
          '%s · %s to %s',
          v_row ->> 'status',
          v_row ->> 'starts_on',
          v_row ->> 'ends_on'
        );
      when 'ledger_accounts' then
        v_node_type := 'ledger_account';
        v_title := pg_catalog.format(
          '%s · %s',
          v_row ->> 'code',
          v_row ->> 'name'
        );
        v_summary := pg_catalog.format(
          '%s · normal %s',
          v_row ->> 'account_type',
          v_row ->> 'normal_balance'
        );
      when 'journal_entries' then
        v_node_type := 'journal_entry';
        v_title := coalesce(
          nullif(v_row ->> 'entry_number', ''),
          'Draft journal ' || left(v_ref_id::text, 8)
        );
        v_summary := v_row ->> 'description';
      when 'journal_lines' then
        v_node_type := 'journal_line';
        v_title := pg_catalog.format(
          'Journal line %s',
          v_row ->> 'line_number'
        );
        v_summary := nullif(v_row ->> 'description', '');
      else
        return coalesce(new, old);
    end case;

    if tg_op = 'DELETE' then
      perform public.cortex_close_node(
        v_tenant_id,
        tg_table_name,
        v_ref_id,
        auth.uid(),
        tg_table_name || ':delete'
      );
      return old;
    end if;

    v_clean := v_row - 'created_by' - 'posted_by' - 'closed_by';
    v_node_id := public.cortex_upsert_node(
      v_tenant_id,
      v_node_type::public.cortex_node_type,
      tg_table_name,
      v_ref_id,
      v_title,
      v_summary,
      v_clean,
      auth.uid(),
      tg_table_name || ':' || lower(tg_op)
    );

    v_fk := nullif(v_row ->> 'journal_entry_id', '')::uuid;
    if v_fk is not null then
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
          'part_of',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    end if;

    v_fk := nullif(v_row ->> 'ledger_account_id', '')::uuid;
    if v_fk is not null then
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
          'part_of',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    end if;

    v_fk := nullif(v_row ->> 'project_id', '')::uuid;
    if v_fk is not null then
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
    end if;

    v_fk := nullif(v_row ->> 'fiscal_period_id', '')::uuid;
    if v_fk is not null then
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'fiscal_periods',
        v_fk
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_node_id,
          v_target_id,
          'scheduled_for',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    end if;

    v_fk := nullif(v_row ->> 'reverses_entry_id', '')::uuid;
    if v_fk is not null then
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
          'derived_from',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    end if;

    v_actor_id := coalesce(
      nullif(v_row ->> 'created_by', ''),
      nullif(v_row ->> 'posted_by', '')
    )::uuid;
    if v_actor_id is not null then
      v_target_id := public.cortex_node_current(
        v_tenant_id,
        'users',
        v_actor_id
      );
      if v_target_id is not null then
        perform public.cortex_upsert_edge(
          v_tenant_id,
          v_target_id,
          v_node_id,
          'owns',
          'canonical',
          1,
          auth.uid()
        );
      end if;
    end if;
  exception
    when others then
      raise warning 'cortex_mirror_finance(%) failed: %',
        tg_table_name,
        sqlerrm;
  end;

  return coalesce(new, old);
end
$$;

-- Direct Data API reads must obey the same finance type boundary as Cortex
-- application retrieval. Non-finance graph types retain their existing scope.
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

create or replace function public.auth_can_read_cortex_subject(
  p_subject_kind public.cortex_subject_kind,
  p_subject_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_visible boolean;
begin
  if p_subject_id is null or p_subject_kind = 'answer' then
    return true;
  end if;

  if p_subject_kind = 'node' then
    select public.auth_can_read_cortex_node_type(node.node_type)
      into v_visible
      from public.cortex_nodes node
     where node.id = p_subject_id;
    return coalesce(v_visible, false);
  end if;

  if p_subject_kind = 'edge' then
    select
      public.auth_can_read_cortex_node_type(src.node_type)
      and public.auth_can_read_cortex_node_type(dst.node_type)
      into v_visible
      from public.cortex_edges edge
      join public.cortex_nodes src on src.id = edge.src_id
      join public.cortex_nodes dst on dst.id = edge.dst_id
     where edge.id = p_subject_id;
    return coalesce(v_visible, false);
  end if;

  return false;
end
$$;

drop policy if exists cortex_nodes_tenant_read
  on public.cortex_nodes;
create policy cortex_nodes_tenant_read
on public.cortex_nodes
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_cortex_node_type(node_type)
);

drop policy if exists cortex_edges_tenant_read
  on public.cortex_edges;
create policy cortex_edges_tenant_read
on public.cortex_edges
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and exists (
    select 1
    from public.cortex_nodes src
    join public.cortex_nodes dst on dst.id = cortex_edges.dst_id
    where src.id = cortex_edges.src_id
      and src.tenant_id = cortex_edges.tenant_id
      and dst.tenant_id = cortex_edges.tenant_id
      and public.auth_can_read_cortex_node_type(src.node_type)
      and public.auth_can_read_cortex_node_type(dst.node_type)
  )
);

drop policy if exists cortex_provenance_tenant_read
  on public.cortex_provenance;
create policy cortex_provenance_tenant_read
on public.cortex_provenance
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_cortex_subject(subject_kind, subject_id)
);

-- Audit all finance mutations through the serialized database audit chain.
drop trigger if exists audit_fiscal_periods
  on public.fiscal_periods;
create trigger audit_fiscal_periods
after insert or update or delete
on public.fiscal_periods
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_ledger_accounts
  on public.ledger_accounts;
create trigger audit_ledger_accounts
after insert or update or delete
on public.ledger_accounts
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_journal_entries
  on public.journal_entries;
create trigger audit_journal_entries
after insert or update or delete
on public.journal_entries
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_journal_lines
  on public.journal_lines;
create trigger audit_journal_lines
after insert or update or delete
on public.journal_lines
for each row execute function public.audit_log_trigger();

drop trigger if exists cortex_mirror_finance
  on public.fiscal_periods;
create trigger cortex_mirror_finance
after insert or update or delete
on public.fiscal_periods
for each row execute function public.cortex_mirror_finance();

drop trigger if exists cortex_mirror_finance
  on public.ledger_accounts;
create trigger cortex_mirror_finance
after insert or update or delete
on public.ledger_accounts
for each row execute function public.cortex_mirror_finance();

drop trigger if exists cortex_mirror_finance
  on public.journal_entries;
create trigger cortex_mirror_finance
after insert or update or delete
on public.journal_entries
for each row execute function public.cortex_mirror_finance();

drop trigger if exists cortex_mirror_finance
  on public.journal_lines;
create trigger cortex_mirror_finance
after insert or update or delete
on public.journal_lines
for each row execute function public.cortex_mirror_finance();

alter table public.fiscal_periods enable row level security;
alter table public.fiscal_periods force row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_accounts force row level security;
alter table public.financial_sequences enable row level security;
alter table public.financial_sequences force row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;
alter table public.journal_lines enable row level security;
alter table public.journal_lines force row level security;

drop policy if exists fiscal_periods_finance_read
  on public.fiscal_periods;
drop policy if exists fiscal_periods_finance_insert
  on public.fiscal_periods;
drop policy if exists fiscal_periods_finance_update
  on public.fiscal_periods;
drop policy if exists fiscal_periods_finance_delete
  on public.fiscal_periods;

create policy fiscal_periods_finance_read
on public.fiscal_periods
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy fiscal_periods_finance_insert
on public.fiscal_periods
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'open'
  and public.auth_can_manage_finance()
);

create policy fiscal_periods_finance_update
on public.fiscal_periods
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'open'
  and public.auth_can_manage_finance()
)
with check (
  tenant_id = public.auth_tenant_id()
  and status = 'open'
  and public.auth_can_manage_finance()
);

create policy fiscal_periods_finance_delete
on public.fiscal_periods
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'open'
  and public.auth_can_manage_finance()
);

drop policy if exists ledger_accounts_finance_read
  on public.ledger_accounts;
drop policy if exists ledger_accounts_finance_insert
  on public.ledger_accounts;
drop policy if exists ledger_accounts_finance_update
  on public.ledger_accounts;
drop policy if exists ledger_accounts_finance_delete
  on public.ledger_accounts;

create policy ledger_accounts_finance_read
on public.ledger_accounts
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy ledger_accounts_finance_insert
on public.ledger_accounts
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and public.auth_can_manage_finance()
);

create policy ledger_accounts_finance_update
on public.ledger_accounts
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

create policy ledger_accounts_finance_delete
on public.ledger_accounts
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

drop policy if exists journal_entries_finance_read
  on public.journal_entries;
drop policy if exists journal_entries_finance_insert
  on public.journal_entries;
drop policy if exists journal_entries_finance_update
  on public.journal_entries;
drop policy if exists journal_entries_finance_delete
  on public.journal_entries;

create policy journal_entries_finance_read
on public.journal_entries
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy journal_entries_finance_insert
on public.journal_entries
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and source_type in ('manual', 'system')
  and public.auth_can_manage_finance()
);

create policy journal_entries_finance_update
on public.journal_entries
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

create policy journal_entries_finance_delete
on public.journal_entries
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_finance()
);

drop policy if exists journal_lines_finance_read
  on public.journal_lines;
drop policy if exists journal_lines_finance_insert
  on public.journal_lines;
drop policy if exists journal_lines_finance_update
  on public.journal_lines;
drop policy if exists journal_lines_finance_delete
  on public.journal_lines;

create policy journal_lines_finance_read
on public.journal_lines
for select
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
);

create policy journal_lines_finance_insert
on public.journal_lines
for insert
to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.journal_entries entry
    where entry.id = journal_lines.journal_entry_id
      and entry.tenant_id = journal_lines.tenant_id
      and entry.status = 'draft'
  )
);

create policy journal_lines_finance_update
on public.journal_lines
for update
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.journal_entries entry
    where entry.id = journal_lines.journal_entry_id
      and entry.tenant_id = journal_lines.tenant_id
      and entry.status = 'draft'
  )
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.journal_entries entry
    where entry.id = journal_lines.journal_entry_id
      and entry.tenant_id = journal_lines.tenant_id
      and entry.status = 'draft'
  )
);

create policy journal_lines_finance_delete
on public.journal_lines
for delete
to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_finance()
  and exists (
    select 1
    from public.journal_entries entry
    where entry.id = journal_lines.journal_entry_id
      and entry.tenant_id = journal_lines.tenant_id
      and entry.status = 'draft'
  )
);

-- Fail closed: client roles receive only the columns and operations required
-- for finance drafts. Posting, numbering, closing, and reversal stay trusted.
revoke all privileges on table
  public.fiscal_periods,
  public.ledger_accounts,
  public.financial_sequences,
  public.journal_entries,
  public.journal_lines
from public, anon, authenticated;

grant select on table
  public.fiscal_periods,
  public.ledger_accounts,
  public.journal_entries,
  public.journal_lines
to authenticated;

grant insert (
  tenant_id,
  name,
  starts_on,
  ends_on,
  status,
  created_by
)
on table public.fiscal_periods
to authenticated;

grant update (
  name,
  updated_at
)
on table public.fiscal_periods
to authenticated;

grant delete
on table public.fiscal_periods
to authenticated;

grant insert (
  tenant_id,
  code,
  name,
  account_type,
  normal_balance,
  parent_id,
  system_key,
  is_active,
  created_by
)
on table public.ledger_accounts
to authenticated;

grant update (
  name,
  parent_id,
  is_active,
  updated_at
)
on table public.ledger_accounts
to authenticated;

grant delete
on table public.ledger_accounts
to authenticated;

grant insert (
  tenant_id,
  posting_date,
  description,
  reference_type,
  reference_id,
  currency,
  source_type,
  created_by
)
on table public.journal_entries
to authenticated;

grant update (
  posting_date,
  description,
  reference_type,
  reference_id,
  currency,
  updated_at
)
on table public.journal_entries
to authenticated;

grant delete
on table public.journal_entries
to authenticated;

grant insert (
  tenant_id,
  journal_entry_id,
  ledger_account_id,
  project_id,
  line_number,
  description,
  debit_cents,
  credit_cents
)
on table public.journal_lines
to authenticated;

grant update (
  ledger_account_id,
  project_id,
  line_number,
  description,
  debit_cents,
  credit_cents
)
on table public.journal_lines
to authenticated;

grant delete
on table public.journal_lines
to authenticated;

grant all privileges on table
  public.fiscal_periods,
  public.ledger_accounts,
  public.financial_sequences,
  public.journal_entries,
  public.journal_lines
to service_role;

revoke execute on function public.guard_fiscal_period()
  from public, anon, authenticated;
revoke execute on function public.guard_posted_journal_entry()
  from public, anon, authenticated;
revoke execute on function public.guard_posted_journal_line()
  from public, anon, authenticated;
revoke execute on function public.auth_can_manage_finance()
  from public, anon;
revoke execute on function public.post_journal_entry(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.reverse_journal_entry(uuid, uuid, text, date)
  from public, anon, authenticated;
revoke execute on function public.close_fiscal_period(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.cortex_mirror_finance()
  from public, anon, authenticated;
revoke execute on function public.auth_can_read_cortex_node_type(public.cortex_node_type)
  from public, anon;
revoke execute on function public.auth_can_read_cortex_subject(public.cortex_subject_kind, uuid)
  from public, anon;

grant execute on function public.auth_can_manage_finance()
  to authenticated, service_role;
grant execute on function public.guard_fiscal_period()
  to service_role;
grant execute on function public.guard_posted_journal_entry()
  to service_role;
grant execute on function public.guard_posted_journal_line()
  to service_role;
grant execute on function public.post_journal_entry(uuid, uuid)
  to service_role;
grant execute on function public.reverse_journal_entry(uuid, uuid, text, date)
  to service_role;
grant execute on function public.close_fiscal_period(uuid, uuid)
  to service_role;
grant execute on function public.cortex_mirror_finance()
  to service_role;
grant execute on function public.auth_can_read_cortex_node_type(public.cortex_node_type)
  to authenticated, service_role;
grant execute on function public.auth_can_read_cortex_subject(public.cortex_subject_kind, uuid)
  to authenticated, service_role;
