-- Normalize persisted ABI project rows after
-- 20260819100000_project_type_structural_civil_enum.sql has committed.
-- The old enum literal remains in the type for rollback/mixed-version reads;
-- this migration only changes row values requested by the product taxonomy.

do $$
begin
  if not exists (
    select 1
    from pg_enum enum_value
    join pg_type enum_type on enum_type.oid = enum_value.enumtypid
    join pg_namespace enum_schema on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'project_type'
      and enum_value.enumlabel = 'structural_civil'
  ) then
    raise exception
      'project_type.structural_civil must exist before its data backfill';
  end if;
end
$$;

-- Existing project audit triggers record this administrative taxonomy update.
-- `mixed` stays an enum member so an application rollback can still read old
-- values; no enum value is removed.
update public.projects
   set project_type = 'structural_civil'::public.project_type
 where project_type = 'mixed'::public.project_type;
