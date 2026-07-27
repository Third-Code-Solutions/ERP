begin;

do $migration$
declare
  v_definition text;
  v_marker constant text := E'AS $function$\ndeclare';
begin
  select pg_catalog.pg_get_functiondef(
    'public.post_cash_transaction(uuid,uuid,date)'::regprocedure
  )
    into v_definition;

  if pg_catalog.strpos(v_definition, '#variable_conflict') > 0 then
    raise exception
      'post_cash_transaction already has a variable conflict directive';
  end if;

  if (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_marker, ''))
  ) <> pg_catalog.length(v_marker) then
    raise exception
      'post_cash_transaction definition marker changed unexpectedly';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    v_marker,
    E'AS $function$\n#variable_conflict use_column\ndeclare'
  );

  execute v_definition;
end
$migration$;

revoke execute on function public.post_cash_transaction(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function public.post_cash_transaction(uuid, uuid, date)
  to service_role;

commit;
