-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
-- Release batch B: function bodies and an index swap with an abort-if-unsafe rollback.
--
-- S8b: voiding a reconciled bank statement must release its cash matches.
--
-- A voided statement kept every matched_cash_transaction_id, and
-- ux_bank_statement_lines_cash_transaction is unique over all of them, so the
-- cash transactions it had matched could never be matched again: re-importing
-- the corrected statement found no candidates. Void releases, it never deletes:
--   * bank_statement_lines.released_at (nullable) is set on every matched line
--     of the statement when it is voided. The match columns stay as evidence.
--   * check bank_statement_lines_release_state: only a matched line can be released.
--   * guard_bank_statement_line (SECURITY DEFINER) still refuses every change to
--     a line of a non-draft statement, with ONE exception: setting released_at
--     (and updated_at) from NULL on a line of a VOIDED statement while the
--     transaction-local GUC app.bank_statement_void holds that statement's id,
--     which only void_bank_statement sets. Any other column change is refused.
--   * void_bank_statement releases the lines after it marks the statement voided.
--   * auto_match_bank_statement no longer treats a released line as using a
--     cash transaction. match_bank_statement_line needs no change: it relies on
--     the unique index below.
--   * ux_bank_statement_lines_cash_transaction becomes a partial unique index
--     (matched and not released); it is built under a temporary name, the old
--     one is dropped, and it is renamed back so error mapping keeps working.
--   * Lines of statements that are ALREADY voided are released with the
--     statement's own voided_at, one statement at a time under the same GUC.
-- The three function bodies below are the 20260726232000 definitions with only
-- the changes listed above (marked "S8b" inline). Privileges are unchanged:
-- service_role only, and they are re-asserted at the end.
--
-- Rollback (aborts if a cash transaction is now matched by one active line and
-- one released line, because the old unique index could not be rebuilt):
--   begin;
--   set local lock_timeout = '5s';
--   do $$
--   begin
--     if exists (
--       select 1
--       from public.bank_statement_lines
--       where matched_cash_transaction_id is not null
--       group by tenant_id, matched_cash_transaction_id
--       having count(*) > 1
--     ) then
--       raise exception 'A cash transaction is matched by more than one statement line; the old unique index cannot be restored'
--         using errcode = '55000';
--     end if;
--   end
--   $$;
--   create unique index ux_bank_statement_lines_cash_transaction_old
--     on public.bank_statement_lines (tenant_id, matched_cash_transaction_id)
--     where matched_cash_transaction_id is not null;
--   drop index public.ux_bank_statement_lines_cash_transaction;
--   alter index public.ux_bank_statement_lines_cash_transaction_old
--     rename to ux_bank_statement_lines_cash_transaction;
--   -- Then re-run the original create or replace function statements for
--   -- guard_bank_statement_line, auto_match_bank_statement and
--   -- void_bank_statement from 20260726232000_bank_reconciliation_foundation.sql,
--   -- and finally:
--   alter table public.bank_statement_lines
--     drop constraint if exists bank_statement_lines_release_state;
--   alter table public.bank_statement_lines drop column if exists released_at;
--   delete from supabase_migrations.schema_migrations where version = '20261124130100';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.bank_statement_lines
  add column if not exists released_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.bank_statement_lines'::regclass
      and conname = 'bank_statement_lines_release_state'
  ) then
    alter table public.bank_statement_lines
      add constraint bank_statement_lines_release_state
      check (released_at is null or matched_cash_transaction_id is not null);
  end if;
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

  -- S8b: the only change allowed on a line of a non-draft statement is the
  -- release written by void_bank_statement.
  if tg_op = 'UPDATE' and found and v_statement.status = 'voided' then
    if coalesce(
         pg_catalog.current_setting('app.bank_statement_void', true),
         ''
       ) = v_statement.id::text
       and old.released_at is null
       and new.released_at is not null
       and (pg_catalog.to_jsonb(new) - 'released_at' - 'updated_at')
         = (pg_catalog.to_jsonb(old) - 'released_at' - 'updated_at') then
      return new;
    end if;
  end if;

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
           and used_line.released_at is null
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

  -- S8b: void releases the cash matches; the match columns stay as evidence.
  update public.bank_statement_lines
     set released_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where bank_statement_id = v_statement.id
     and tenant_id = v_statement.tenant_id
     and matched_cash_transaction_id is not null
     and released_at is null;
end
$$;

revoke execute on function public.guard_bank_statement_line()
  from public, anon, authenticated;
revoke execute on function public.auto_match_bank_statement(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.void_bank_statement(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.guard_bank_statement_line()
  to service_role;
grant execute on function public.auto_match_bank_statement(uuid, uuid)
  to service_role;
grant execute on function public.void_bank_statement(uuid, uuid, text)
  to service_role;

-- Statements voided before this release: release their matches with the
-- statement's own void time, one statement at a time under the void GUC.
do $$
declare
  v_statement record;
begin
  for v_statement in
    select statement.id, statement.voided_at
    from public.bank_statements statement
    where statement.status = 'voided'
      and exists (
        select 1
        from public.bank_statement_lines line
        where line.bank_statement_id = statement.id
          and line.tenant_id = statement.tenant_id
          and line.matched_cash_transaction_id is not null
          and line.released_at is null
      )
    order by statement.id
  loop
    perform pg_catalog.set_config(
      'app.bank_statement_void',
      v_statement.id::text,
      true
    );
    update public.bank_statement_lines
       set released_at = v_statement.voided_at,
           updated_at = pg_catalog.clock_timestamp()
     where bank_statement_id = v_statement.id
       and matched_cash_transaction_id is not null
       and released_at is null;
  end loop;
  perform pg_catalog.set_config('app.bank_statement_void', '', true);
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'bank_statement_lines'
      and indexname = 'ux_bank_statement_lines_cash_transaction'
      and indexdef like '%released_at%'
  ) then
    return;
  end if;

  create unique index ux_bank_statement_lines_cash_transaction_active
    on public.bank_statement_lines (tenant_id, matched_cash_transaction_id)
    where matched_cash_transaction_id is not null
      and released_at is null;
  drop index if exists public.ux_bank_statement_lines_cash_transaction;
  alter index public.ux_bank_statement_lines_cash_transaction_active
    rename to ux_bank_statement_lines_cash_transaction;
end
$$;

comment on column public.bank_statement_lines.released_at is
  'S8b: set by void_bank_statement; a released line no longer holds its cash transaction.';

commit;
