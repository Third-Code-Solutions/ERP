-- I-05: moving a child removes cost from its previous DUPA as well as adding
-- cost to its destination. Recompute both persisted rates in the transaction.
create or replace function public.dupa_recompute_from_child()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_dupa_totals(old.dupa_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.dupa_id is distinct from new.dupa_id then
      -- Recompute locks each parent. Opposite moves must acquire those locks
      -- in the same order instead of locking their respective source first.
      if old.dupa_id::text < new.dupa_id::text then
        perform public.recompute_dupa_totals(old.dupa_id);
        perform public.recompute_dupa_totals(new.dupa_id);
      else
        perform public.recompute_dupa_totals(new.dupa_id);
        perform public.recompute_dupa_totals(old.dupa_id);
      end if;
      return new;
    end if;
  end if;

  perform public.recompute_dupa_totals(new.dupa_id);
  return new;
end
$$;

-- Preserve the existing function privileges; callers reach it through triggers.
revoke execute on function public.dupa_recompute_from_child() from public, anon, authenticated;
grant execute on function public.dupa_recompute_from_child() to service_role;
