begin;

-- The original AFTER-trigger returned only from its exception handler.
-- Successful Invoice and Journal Line writes therefore reached the end of
-- the trigger without returning NEW and aborted the official transaction.
create or replace function public.cortex_mirror_receivable_dimensions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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

  return new;
exception
  when others then
    raise warning 'cortex_mirror_receivable_dimensions(%) failed: %',
      tg_table_name,
      sqlerrm;
    return new;
end
$function$;

revoke execute
  on function public.cortex_mirror_receivable_dimensions()
  from public, anon, authenticated;
grant execute
  on function public.cortex_mirror_receivable_dimensions()
  to service_role;

commit;
