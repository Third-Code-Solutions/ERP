begin;

-- WO-12: inspections happen before Won/project conversion. A photo must still
-- be a first-class tenant-scoped document attached to its opportunity.
alter table public.documents
  alter column project_id drop not null;

alter table public.documents
  add column if not exists opportunity_id uuid;

create unique index if not exists ux_documents_tenant_id_id
  on public.documents (tenant_id, id);

create index if not exists idx_documents_opportunity_id
  on public.documents (opportunity_id);

alter table public.documents
  drop constraint if exists documents_project_or_opportunity;

alter table public.documents
  add constraint documents_project_or_opportunity
  check (project_id is not null or opportunity_id is not null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_opportunity_tenant_fk'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_opportunity_tenant_fk
      foreign key (tenant_id, opportunity_id)
      references public.opportunities (tenant_id, id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists ux_site_inspections_tenant_id_id
  on public.site_inspections (tenant_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_inspections_opportunity_tenant_fk'
      and conrelid = 'public.site_inspections'::regclass
  ) then
    alter table public.site_inspections
      add constraint site_inspections_opportunity_tenant_fk
      foreign key (tenant_id, opportunity_id)
      references public.opportunities (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_inspections_pdf_document_tenant_fk'
      and conrelid = 'public.site_inspections'::regclass
  ) then
    alter table public.site_inspections
      add constraint site_inspections_pdf_document_tenant_fk
      foreign key (tenant_id, pdf_document_id)
      references public.documents (tenant_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_inspection_photos_inspection_tenant_fk'
      and conrelid = 'public.site_inspection_photos'::regclass
  ) then
    alter table public.site_inspection_photos
      add constraint site_inspection_photos_inspection_tenant_fk
      foreign key (tenant_id, inspection_id)
      references public.site_inspections (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_inspection_photos_document_tenant_fk'
      and conrelid = 'public.site_inspection_photos'::regclass
  ) then
    alter table public.site_inspection_photos
      add constraint site_inspection_photos_document_tenant_fk
      foreign key (tenant_id, document_id)
      references public.documents (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_inspection_rfis_inspection_tenant_fk'
      and conrelid = 'public.site_inspection_rfis'::regclass
  ) then
    alter table public.site_inspection_rfis
      add constraint site_inspection_rfis_inspection_tenant_fk
      foreign key (tenant_id, inspection_id)
      references public.site_inspections (tenant_id, id)
      on delete cascade;
  end if;
end $$;

commit;
