-- Preserve draft deletion authority: BEFORE DELETE must return OLD.
-- Existing guard returned NEW for DELETE, where NEW is NULL, silently
-- cancelling the delete while the Core command reported a false 404.

create or replace function public.guard_cash_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
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

revoke execute on function public.guard_cash_transaction()
  from public, anon, authenticated;
grant execute on function public.guard_cash_transaction()
  to service_role;
