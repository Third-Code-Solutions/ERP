-- ADR-044: browser/session roles read through RLS; trusted commands own writes.
begin;

do $$
declare relation record; column_names text; owner_name text;
begin
  for relation in
    select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
  loop
    execute format('revoke insert, update, delete, truncate, references, trigger, maintain on table public.%I from public, anon, authenticated', relation.relname);
    select string_agg(quote_ident(attname),',' order by attnum) into column_names
      from pg_attribute where attrelid=relation.oid and attnum>0 and not attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on table public.%I from public, anon, authenticated', column_names,column_names,column_names,relation.relname);
    -- Modern Supabase environments strip Data API roles from schema public defaults
    -- ("new tables require explicit grants"), so the trusted server write contract
    -- must be re-established explicitly instead of relying on ambient defaults.
    execute format('grant select, insert, update, delete on table public.%I to service_role', relation.relname);
  end loop;
  for owner_name in
    select distinct pg_get_userbyid(c.relowner) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
      and not exists (select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
  loop
    execute format('alter default privileges for role %I in schema public revoke insert, update, delete, truncate, references, trigger, maintain on tables from public, anon, authenticated',owner_name);
    execute format('alter default privileges for role %I in schema public revoke usage, update on sequences from public, anon, authenticated',owner_name);
  end loop;
end
$$;

revoke usage, update on all sequences in schema public from public, anon, authenticated;
grant usage, select, update on all sequences in schema public to service_role;
commit;

-- Preserve server grants and all existing reader/function contracts. Recovery
-- rolls forward; restoring generic client writes reopens capability bypasses.
