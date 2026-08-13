-- Close audit coverage for tenant-scoped request/idempotency tables added
-- after the original audit trigger foundation. No business rows are changed.

do $$
declare
  table_record record;
  trigger_name text;
begin
  for table_record in
    select
      namespace.nspname as table_schema,
      relation.relname as table_name,
      relation.oid as table_oid
    from pg_class relation
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname <> 'audit_log'
      and exists (
        select 1
          from pg_attribute attribute
         where attribute.attrelid = relation.oid
           and attribute.attname = 'tenant_id'
           and attribute.attnum > 0
           and not attribute.attisdropped
      )
      and not exists (
        select 1
          from pg_trigger existing_trigger
         where existing_trigger.tgrelid = relation.oid
           and not existing_trigger.tgisinternal
           and existing_trigger.tgname = left('audit_' || relation.relname, 63)
      )
    order by namespace.nspname, relation.relname
  loop
    trigger_name := left('audit_' || table_record.table_name, 63);

    execute format(
      'create trigger %I after insert or update or delete on %I.%I for each row execute function public.audit_log_trigger()',
      trigger_name,
      table_record.table_schema,
      table_record.table_name
    );
  end loop;
end
$$;
