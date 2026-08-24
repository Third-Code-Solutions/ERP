begin;

-- A project-linked document may only retain an opportunity association when
-- that opportunity is linked to the same project. Pre-project documents keep
-- project_id null and continue to use documents_opportunity_tenant_fk.
do $preflight$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.documents'::regclass
      and constraint_record.conname = 'documents_opportunity_tenant_fk'
      and constraint_record.contype = 'f'
      and constraint_record.convalidated
      and constraint_record.confrelid = 'public.opportunities'::regclass
      and constraint_record.confmatchtype = 's'
      and constraint_record.confdeltype = 'c'
      and constraint_record.confupdtype = 'a'
      and array(
        select attribute.attname
        from unnest(constraint_record.conkey) with ordinality as key(attnum, position)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = constraint_record.conrelid
         and attribute.attnum = key.attnum
        order by key.position
      ) = array['tenant_id', 'opportunity_id']::name[]
      and array(
        select attribute.attname
        from unnest(constraint_record.confkey) with ordinality as key(attnum, position)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = constraint_record.confrelid
         and attribute.attnum = key.attnum
        order by key.position
      ) = array['tenant_id', 'id']::name[]
  ) then
    raise exception using
      errcode = '23514',
      message = 'documents_opportunity_tenant_fk is missing, invalid, or malformed';
  end if;

  if exists (
    select 1
    from public.documents as document
    where document.opportunity_id is not null
      and document.project_id is not null
      and not exists (
        select 1
        from public.opportunities as opportunity
        where opportunity.tenant_id = document.tenant_id
          and opportunity.id = document.opportunity_id
          and opportunity.project_id is not distinct from document.project_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'documents contain opportunity/project associations that require repair';
  end if;
end
$preflight$;

create unique index ux_opportunities_tenant_id_id_project_id
  on public.opportunities (tenant_id, id, project_id);

create index idx_documents_tenant_opportunity_project
  on public.documents (tenant_id, opportunity_id, project_id);

alter table public.documents
  add constraint documents_opportunity_project_tenant_fk
  foreign key (tenant_id, opportunity_id, project_id)
  references public.opportunities (tenant_id, id, project_id)
  match simple
  on delete cascade
  on update no action
  not valid;

alter table public.documents
  validate constraint documents_opportunity_project_tenant_fk;

commit;

-- Rollback guidance (only after dependent writers no longer rely on this invariant):
-- alter table public.documents drop constraint documents_opportunity_project_tenant_fk;
-- drop index concurrently if exists public.idx_documents_tenant_opportunity_project;
-- drop index concurrently if exists public.ux_opportunities_tenant_id_id_project_id;
