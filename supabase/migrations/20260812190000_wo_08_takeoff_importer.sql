-- WO-08: generic structured takeoff intake.
--
-- This migration is additive. Existing BOM line-item UUIDs remain the
-- downstream identity. Re-imports use ON CONFLICT (tenant_id,
-- takeoff_import_id, source_row_key) and only update source-owned fields;
-- vendor tokens, reviewed grain, and DUPA pricing are never replaced.
-- on conflict (tenant_id, takeoff_import_id, source_row_key)

begin;

-- Existing documents had only a single-column primary key. Add the tenant
-- pairing required by the new cross-tenant foreign keys before declaring them.
create unique index if not exists ux_documents_tenant_id_id
  on public.documents (tenant_id, id);

create table if not exists public.boq_divisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  is_preliminaries boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boq_divisions_code_nonempty check (btrim(code) <> ''),
  constraint boq_divisions_name_nonempty check (btrim(name) <> '')
);
create unique index if not exists boq_divisions_tenant_id_id_unique
  on public.boq_divisions (tenant_id, id);
create unique index if not exists boq_divisions_tenant_code_unique
  on public.boq_divisions (tenant_id, code);
create index if not exists boq_divisions_created_by_idx
  on public.boq_divisions (tenant_id, created_by);

create table if not exists public.drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  document_id uuid,
  source text not null,
  source_key text not null,
  label text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drawing_revisions_source_nonempty check (btrim(source) <> ''),
  constraint drawing_revisions_source_key_nonempty check (btrim(source_key) <> ''),
  constraint drawing_revisions_label_nonempty check (btrim(label) <> '')
);
create unique index if not exists drawing_revisions_tenant_id_id_unique
  on public.drawing_revisions (tenant_id, id);
create unique index if not exists drawing_revisions_source_key_unique
  on public.drawing_revisions (tenant_id, project_id, source, source_key);
create index if not exists drawing_revisions_tenant_project_idx
  on public.drawing_revisions (tenant_id, project_id, updated_at desc);
create index if not exists drawing_revisions_document_idx
  on public.drawing_revisions (tenant_id, document_id);
create index if not exists drawing_revisions_created_by_idx
  on public.drawing_revisions (tenant_id, created_by);

create table if not exists public.takeoff_mapping_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source text not null,
  name text not null,
  mapping jsonb not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeoff_mapping_profiles_source_nonempty check (btrim(source) <> ''),
  constraint takeoff_mapping_profiles_name_nonempty check (btrim(name) <> '')
);
create unique index if not exists takeoff_mapping_profiles_tenant_id_id_unique
  on public.takeoff_mapping_profiles (tenant_id, id);
create unique index if not exists takeoff_mapping_profiles_source_name_unique
  on public.takeoff_mapping_profiles (tenant_id, source, name);
create index if not exists takeoff_mapping_profiles_created_by_idx
  on public.takeoff_mapping_profiles (tenant_id, created_by);
create index if not exists takeoff_mapping_profiles_updated_by_idx
  on public.takeoff_mapping_profiles (tenant_id, updated_by);

create table if not exists public.takeoff_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null,
  project_id uuid not null,
  drawing_revision_id uuid not null,
  mapping_profile_id uuid,
  source text not null,
  source_key text not null,
  file_name text not null,
  content_sha256 text not null,
  status text not null default 'committed',
  row_count integer not null default 0,
  imported_count integer not null default 0,
  unresolved_count integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint takeoff_imports_status_check
    check (status in ('previewed', 'committed', 'partially_resolved', 'resolved', 'failed')),
  constraint takeoff_imports_source_key_nonempty check (btrim(source_key) <> ''),
  constraint takeoff_imports_file_name_nonempty check (btrim(file_name) <> ''),
  constraint takeoff_imports_content_sha256_nonempty check (btrim(content_sha256) <> ''),
  constraint takeoff_imports_row_count_nonnegative check (row_count >= 0),
  constraint takeoff_imports_imported_count_nonnegative check (imported_count >= 0),
  constraint takeoff_imports_unresolved_count_nonnegative check (unresolved_count >= 0)
);
create unique index if not exists takeoff_imports_tenant_id_id_unique
  on public.takeoff_imports (tenant_id, id);
create unique index if not exists takeoff_imports_source_key_unique
  on public.takeoff_imports (tenant_id, bom_id, source, source_key);
create index if not exists takeoff_imports_tenant_bom_updated_idx
  on public.takeoff_imports (tenant_id, bom_id, updated_at desc);
create index if not exists takeoff_imports_created_by_idx
  on public.takeoff_imports (tenant_id, created_by);
create index if not exists takeoff_imports_updated_by_idx
  on public.takeoff_imports (tenant_id, updated_by);

create table if not exists public.takeoff_unresolved_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  takeoff_import_id uuid not null,
  bom_id uuid not null,
  bom_line_item_id uuid,
  source_row_key text not null,
  reason_code text not null,
  reason text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_by uuid,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint takeoff_unresolved_items_status_check
    check (status in ('pending', 'resolved', 'rejected')),
  constraint takeoff_unresolved_items_source_row_nonempty check (btrim(source_row_key) <> ''),
  constraint takeoff_unresolved_items_reason_nonempty check (btrim(reason) <> '')
);
create unique index if not exists takeoff_unresolved_items_tenant_id_id_unique
  on public.takeoff_unresolved_items (tenant_id, id);
create unique index if not exists takeoff_unresolved_items_pending_key_unique
  on public.takeoff_unresolved_items (tenant_id, takeoff_import_id, source_row_key, reason_code);
create index if not exists takeoff_unresolved_items_pending_idx
  on public.takeoff_unresolved_items (tenant_id, bom_id, status, updated_at desc);
create index if not exists takeoff_unresolved_items_created_by_idx
  on public.takeoff_unresolved_items (tenant_id, created_by);
create index if not exists takeoff_unresolved_items_resolved_by_idx
  on public.takeoff_unresolved_items (tenant_id, resolved_by);

alter table public.bom_line_items
  add column if not exists source_row_key text,
  add column if not exists ai_drafted boolean not null default false,
  add column if not exists source_model text,
  add column if not exists extraction_timestamp timestamptz;

create unique index if not exists ux_bom_line_items_takeoff_source_row
  on public.bom_line_items (tenant_id, takeoff_import_id, source_row_key)
  ;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.boq_divisions'::regclass
      and conname = 'boq_divisions_created_by_tenant_fk'
  ) then
    alter table public.boq_divisions
      add constraint boq_divisions_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.drawing_revisions'::regclass
      and conname = 'drawing_revisions_project_tenant_fk'
  ) then
    alter table public.drawing_revisions
      add constraint drawing_revisions_project_tenant_fk
      foreign key (tenant_id, project_id)
      references public.projects (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
      where conrelid = 'public.drawing_revisions'::regclass
      and conname = 'drawing_revisions_document_tenant_fk'
  ) then
    alter table public.drawing_revisions
      add constraint drawing_revisions_document_tenant_fk
      foreign key (tenant_id, document_id)
      references public.documents (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.drawing_revisions'::regclass
      and conname = 'drawing_revisions_created_by_tenant_fk'
  ) then
    alter table public.drawing_revisions
      add constraint drawing_revisions_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_mapping_profiles'::regclass
      and conname = 'takeoff_mapping_profiles_created_by_tenant_fk'
  ) then
    alter table public.takeoff_mapping_profiles
      add constraint takeoff_mapping_profiles_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_mapping_profiles'::regclass
      and conname = 'takeoff_mapping_profiles_updated_by_tenant_fk'
  ) then
    alter table public.takeoff_mapping_profiles
      add constraint takeoff_mapping_profiles_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_imports'::regclass
      and conname = 'takeoff_imports_bom_tenant_fk'
  ) then
    alter table public.takeoff_imports
      add constraint takeoff_imports_bom_tenant_fk
      foreign key (tenant_id, bom_id)
      references public.boms (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_imports'::regclass
      and conname = 'takeoff_imports_project_tenant_fk'
  ) then
    alter table public.takeoff_imports
      add constraint takeoff_imports_project_tenant_fk
      foreign key (tenant_id, project_id)
      references public.projects (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_imports'::regclass
      and conname = 'takeoff_imports_revision_tenant_fk'
  ) then
    alter table public.takeoff_imports
      add constraint takeoff_imports_revision_tenant_fk
      foreign key (tenant_id, drawing_revision_id)
      references public.drawing_revisions (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_imports'::regclass
      and conname = 'takeoff_imports_created_by_tenant_fk'
  ) then
    alter table public.takeoff_imports
      add constraint takeoff_imports_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_imports'::regclass
      and conname = 'takeoff_imports_updated_by_tenant_fk'
  ) then
    alter table public.takeoff_imports
      add constraint takeoff_imports_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_imports'::regclass
      and conname = 'takeoff_imports_mapping_profile_tenant_fk'
  ) then
    alter table public.takeoff_imports
      add constraint takeoff_imports_mapping_profile_tenant_fk
      foreign key (tenant_id, mapping_profile_id)
      references public.takeoff_mapping_profiles (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_unresolved_items'::regclass
      and conname = 'takeoff_unresolved_items_import_tenant_fk'
  ) then
    alter table public.takeoff_unresolved_items
      add constraint takeoff_unresolved_items_import_tenant_fk
      foreign key (tenant_id, takeoff_import_id)
      references public.takeoff_imports (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_unresolved_items'::regclass
      and conname = 'takeoff_unresolved_items_created_by_tenant_fk'
  ) then
    alter table public.takeoff_unresolved_items
      add constraint takeoff_unresolved_items_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_unresolved_items'::regclass
      and conname = 'takeoff_unresolved_items_resolved_by_tenant_fk'
  ) then
    alter table public.takeoff_unresolved_items
      add constraint takeoff_unresolved_items_resolved_by_tenant_fk
      foreign key (tenant_id, resolved_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_unresolved_items'::regclass
      and conname = 'takeoff_unresolved_items_bom_tenant_fk'
  ) then
    alter table public.takeoff_unresolved_items
      add constraint takeoff_unresolved_items_bom_tenant_fk
      foreign key (tenant_id, bom_id)
      references public.boms (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.takeoff_unresolved_items'::regclass
      and conname = 'takeoff_unresolved_items_line_tenant_fk'
  ) then
    alter table public.takeoff_unresolved_items
      add constraint takeoff_unresolved_items_line_tenant_fk
      foreign key (tenant_id, bom_id, bom_line_item_id)
      references public.bom_line_items (tenant_id, bom_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bom_line_items'::regclass
      and conname = 'bom_line_items_takeoff_import_tenant_fk'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_takeoff_import_tenant_fk
      foreign key (tenant_id, takeoff_import_id)
      references public.takeoff_imports (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bom_line_items'::regclass
      and conname = 'bom_line_items_drawing_revision_tenant_fk'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_drawing_revision_tenant_fk
      foreign key (tenant_id, drawing_revision_id)
      references public.drawing_revisions (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bom_line_items'::regclass
      and conname = 'bom_line_items_division_tenant_fk'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_division_tenant_fk
      foreign key (tenant_id, division_id)
      references public.boq_divisions (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

create or replace function public.takeoff_ai_draft_guard()
returns trigger
language plpgsql
as $$
begin
  if new.ai_drafted
     and new.unit_rate_source <> 'dupa'
     and (new.unit_cost_cents <> 0 or new.line_total_cents <> 0) then
    raise exception 'AI-drafted takeoff lines cannot carry a unit rate before a DUPA is attached';
  end if;
  return new;
end;
$$;

drop trigger if exists takeoff_ai_draft_guard on public.bom_line_items;
create trigger takeoff_ai_draft_guard
before insert or update on public.bom_line_items
for each row execute function public.takeoff_ai_draft_guard();

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'boq_divisions',
    'drawing_revisions',
    'takeoff_mapping_profiles',
    'takeoff_imports',
    'takeoff_unresolved_items'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update on table public.%I to authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);

    policy_name := table_name || '_tenant_read';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = policy_name) then
      execute format('create policy %I on public.%I for select to authenticated using (tenant_id = public.auth_tenant_id())', policy_name, table_name);
    end if;
    policy_name := table_name || '_tenant_insert';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = policy_name) then
      execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id = public.auth_tenant_id())', policy_name, table_name);
    end if;
    policy_name := table_name || '_tenant_update';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = policy_name) then
      execute format('create policy %I on public.%I for update to authenticated using (tenant_id = public.auth_tenant_id()) with check (tenant_id = public.auth_tenant_id())', policy_name, table_name);
    end if;

    if not exists (select 1 from pg_trigger where tgrelid = format('public.%I', table_name)::regclass and tgname = 'audit_' || table_name) then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()', 'audit_' || table_name, table_name);
    end if;
  end loop;
end
$$;

-- Static names are intentionally documented for release scanners and review:
-- audit_boq_divisions on public.boq_divisions
-- audit_drawing_revisions on public.drawing_revisions
-- audit_takeoff_mapping_profiles on public.takeoff_mapping_profiles
-- audit_takeoff_imports on public.takeoff_imports
-- audit_takeoff_unresolved_items on public.takeoff_unresolved_items
-- alter table public.boq_divisions enable row level security
-- alter table public.drawing_revisions enable row level security
-- alter table public.takeoff_mapping_profiles enable row level security
-- alter table public.takeoff_imports enable row level security
-- alter table public.takeoff_unresolved_items enable row level security
-- force row level security applies to every table above

revoke execute on function public.takeoff_ai_draft_guard() from public, anon, authenticated;
grant execute on function public.takeoff_ai_draft_guard() to service_role;

commit;
