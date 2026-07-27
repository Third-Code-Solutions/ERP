begin;

do $migration$
declare
  v_definition text;
  v_marker text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.reverse_cash_transaction(uuid,uuid,text,date)'::regprocedure
  )
    into v_definition;

  v_marker := E'  if p_posting_date < v_transaction.transaction_date then\n'
    || E'    raise exception ''Reversal date cannot precede cash transaction date''\n'
    || E'      using errcode = ''23514'';\n'
    || E'  end if;\n\n'
    || E'  perform pg_catalog.set_config(';
  v_replacement := E'  if p_posting_date < v_transaction.transaction_date then\n'
    || E'    raise exception ''Reversal date cannot precede cash transaction date''\n'
    || E'      using errcode = ''23514'';\n'
    || E'  end if;\n\n'
    || E'  if exists (\n'
    || E'    select 1\n'
    || E'    from public.bank_statement_lines line\n'
    || E'    join public.bank_statements statement\n'
    || E'      on statement.id = line.bank_statement_id\n'
    || E'     and statement.tenant_id = line.tenant_id\n'
    || E'    where line.tenant_id = v_transaction.tenant_id\n'
    || E'      and line.matched_cash_transaction_id = v_transaction.id\n'
    || E'      and statement.status <> ''voided''\n'
    || E'  ) then\n'
    || E'    raise exception ''Unmatch or void bank reconciliation first''\n'
    || E'      using errcode = ''23514'';\n'
    || E'  end if;\n\n'
    || E'  perform pg_catalog.set_config(';

  if (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_marker, ''))
  ) <> pg_catalog.length(v_marker) then
    raise exception
      'reverse_cash_transaction definition marker changed unexpectedly';
  end if;
  execute pg_catalog.replace(v_definition, v_marker, v_replacement);

  select pg_catalog.pg_get_functiondef(
    'public.guard_bank_statement_line()'::regprocedure
  )
    into v_definition;

  v_marker := E'     where cash_tx.id = new.matched_cash_transaction_id\n'
    || E'       and cash_tx.tenant_id = new.tenant_id;';
  v_replacement := E'     where cash_tx.id = new.matched_cash_transaction_id\n'
    || E'       and cash_tx.tenant_id = new.tenant_id\n'
    || E'     for key share;';

  if (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_marker, ''))
  ) <> pg_catalog.length(v_marker) then
    raise exception
      'guard_bank_statement_line definition marker changed unexpectedly';
  end if;
  execute pg_catalog.replace(v_definition, v_marker, v_replacement);

  select pg_catalog.pg_get_functiondef(
    'public.guard_project_budget()'::regprocedure
  )
    into v_definition;

  v_marker := E'      and prior_budget.status = ''approved''';
  v_replacement := E'      and (\n'
    || E'        prior_budget.status = ''approved''\n'
    || E'        or (\n'
    || E'          tg_op = ''UPDATE''\n'
    || E'          and v_workflow_write\n'
    || E'          and old.status = ''pending_approval''\n'
    || E'          and new.status = ''approved''\n'
    || E'          and prior_budget.status = ''superseded''\n'
    || E'        )\n'
    || E'      )';

  if (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_marker, ''))
  ) <> pg_catalog.length(v_marker) then
    raise exception
      'guard_project_budget definition marker changed unexpectedly';
  end if;
  execute pg_catalog.replace(v_definition, v_marker, v_replacement);
end
$migration$;

revoke execute on function public.reverse_cash_transaction(
  uuid,
  uuid,
  text,
  date
) from public, anon, authenticated;
revoke execute on function public.guard_bank_statement_line()
  from public, anon, authenticated;
revoke execute on function public.guard_project_budget()
  from public, anon, authenticated;

grant execute on function public.reverse_cash_transaction(
  uuid,
  uuid,
  text,
  date
) to service_role;
grant execute on function public.guard_bank_statement_line()
  to service_role;
grant execute on function public.guard_project_budget()
  to service_role;

commit;
