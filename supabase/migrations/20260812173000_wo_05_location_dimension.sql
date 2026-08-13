-- WO-05 / M-02: normalize BOM room/location prefixes.
--
-- Additive release. The original description is retained for audit and the
-- parsed location is scoped to the same tenant and project as the BOM.

alter table public.bom_line_items
  add column if not exists description_original text,
  add column if not exists location_id uuid;

update public.bom_line_items
   set description_original = description
 where description_original is null;

create table if not exists public.project_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  parent_id uuid,
  name text not null,
  level text,
  sort_order integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_locations_name_nonempty
    check (length(btrim(name)) > 0),
  constraint project_locations_level_check
    check (level is null or level in ('building', 'floor', 'zone', 'room', 'area'))
);

create unique index if not exists ux_project_locations_tenant_id_id
  on public.project_locations (tenant_id, id);

create unique index if not exists ux_project_locations_tenant_project_id_id
  on public.project_locations (tenant_id, project_id, id);

create unique index if not exists ux_project_locations_tenant_project_name
  on public.project_locations (tenant_id, project_id, name);

create index if not exists idx_project_locations_tenant_project
  on public.project_locations (tenant_id, project_id, sort_order);

create index if not exists idx_project_locations_tenant_parent
  on public.project_locations (tenant_id, project_id, parent_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.project_locations'::regclass
       and conname = 'project_locations_project_tenant_fk'
  ) then
    alter table public.project_locations
      add constraint project_locations_project_tenant_fk
      foreign key (tenant_id, project_id)
      references public.projects (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.project_locations'::regclass
       and conname = 'project_locations_parent_tenant_project_fk'
  ) then
    alter table public.project_locations
      add constraint project_locations_parent_tenant_project_fk
      foreign key (tenant_id, project_id, parent_id)
      references public.project_locations (tenant_id, project_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.project_locations'::regclass
       and conname = 'project_locations_created_by_tenant_fk'
  ) then
    alter table public.project_locations
      add constraint project_locations_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.project_locations'::regclass
       and conname = 'project_locations_updated_by_tenant_fk'
  ) then
    alter table public.project_locations
      add constraint project_locations_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_items'::regclass
       and conname = 'bom_line_items_location_tenant_fk'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_location_tenant_fk
      foreign key (tenant_id, location_id)
      references public.project_locations (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

create index if not exists idx_bom_line_items_tenant_location
  on public.bom_line_items (tenant_id, location_id);

create table if not exists public.bom_line_item_location_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  bom_id uuid not null,
  bom_line_item_id uuid not null,
  description_original text not null,
  reason text not null,
  status text not null default 'pending',
  resolved_location_id uuid,
  created_by uuid,
  resolved_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint bom_line_item_location_reviews_status_check
    check (status in ('pending', 'resolved', 'rejected')),
  constraint bom_line_item_location_reviews_resolved_shape_check
    check (status <> 'resolved' or resolved_location_id is not null)
);

create unique index if not exists ux_bom_line_item_location_reviews_tenant_id_id
  on public.bom_line_item_location_reviews (tenant_id, id);

create unique index if not exists ux_bom_line_item_location_reviews_pending_line
  on public.bom_line_item_location_reviews (tenant_id, bom_line_item_id)
  where status = 'pending';

create index if not exists idx_bom_line_item_location_reviews_tenant_project_line
  on public.bom_line_item_location_reviews (tenant_id, project_id, bom_line_item_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_project_tenant_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_project_tenant_fk
      foreign key (tenant_id, project_id)
      references public.projects (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_bom_tenant_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_bom_tenant_fk
      foreign key (tenant_id, bom_id)
      references public.boms (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_line_bom_tenant_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_line_bom_tenant_fk
      foreign key (tenant_id, bom_id, bom_line_item_id)
      references public.bom_line_items (tenant_id, bom_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_location_tenant_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_location_tenant_fk
      foreign key (tenant_id, resolved_location_id)
      references public.project_locations (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_location_project_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_location_project_fk
      foreign key (tenant_id, project_id, resolved_location_id)
      references public.project_locations (tenant_id, project_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_created_by_tenant_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_resolved_by_tenant_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_resolved_by_tenant_fk
      foreign key (tenant_id, resolved_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_item_location_reviews'::regclass
       and conname = 'bom_line_item_location_reviews_updated_by_tenant_fk'
  ) then
    alter table public.bom_line_item_location_reviews
      add constraint bom_line_item_location_reviews_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

alter table public.project_locations enable row level security;
alter table public.project_locations force row level security;
alter table public.bom_line_item_location_reviews enable row level security;
alter table public.bom_line_item_location_reviews force row level security;

revoke all privileges on table public.project_locations
from public, anon, authenticated;
revoke all privileges on table public.bom_line_item_location_reviews
from public, anon, authenticated;

grant select, insert, update on table public.project_locations to authenticated;
grant select, insert, update on table public.bom_line_item_location_reviews to authenticated;
grant all privileges on table public.project_locations to service_role;
grant all privileges on table public.bom_line_item_location_reviews to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'project_locations'
       and policyname = 'project_locations_tenant_read'
  ) then
    create policy project_locations_tenant_read
      on public.project_locations
      for select to authenticated
      using (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'project_locations'
       and policyname = 'project_locations_tenant_insert'
  ) then
    create policy project_locations_tenant_insert
      on public.project_locations
      for insert to authenticated
      with check (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'project_locations'
       and policyname = 'project_locations_tenant_update'
  ) then
    create policy project_locations_tenant_update
      on public.project_locations
      for update to authenticated
      using (tenant_id = public.auth_tenant_id())
      with check (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bom_line_item_location_reviews'
       and policyname = 'bom_line_item_location_reviews_tenant_read'
  ) then
    create policy bom_line_item_location_reviews_tenant_read
      on public.bom_line_item_location_reviews
      for select to authenticated
      using (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bom_line_item_location_reviews'
       and policyname = 'bom_line_item_location_reviews_tenant_insert'
  ) then
    create policy bom_line_item_location_reviews_tenant_insert
      on public.bom_line_item_location_reviews
      for insert to authenticated
      with check (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bom_line_item_location_reviews'
       and policyname = 'bom_line_item_location_reviews_tenant_update'
  ) then
    create policy bom_line_item_location_reviews_tenant_update
      on public.bom_line_item_location_reviews
      for update to authenticated
      using (tenant_id = public.auth_tenant_id())
      with check (tenant_id = public.auth_tenant_id());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.project_locations'::regclass
      and tgname = 'audit_project_locations'
  ) then
    create trigger audit_project_locations
      after insert or update or delete
      on public.project_locations
      for each row execute function public.audit_log_trigger();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.bom_line_item_location_reviews'::regclass
      and tgname = 'audit_bom_line_item_location_reviews'
  ) then
    create trigger audit_bom_line_item_location_reviews
      after insert or update or delete
      on public.bom_line_item_location_reviews
      for each row execute function public.audit_log_trigger();
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
      from public.bom_line_items line
      join public.boms bom
        on bom.tenant_id = line.tenant_id
       and bom.id = line.bom_id
     where line.location_id is not null
       and not exists (
         select 1
           from public.project_locations location
          where location.tenant_id = line.tenant_id
            and location.project_id = bom.project_id
            and location.id = line.location_id
       )
  ) then
    raise exception 'Existing BOM location assignments violate tenant/project scope';
  end if;
end
$$;

create or replace function public.enforce_bom_line_item_location_project()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.location_id is not null
     and not exists (
       select 1
         from public.boms bom
         join public.project_locations location
           on location.tenant_id = bom.tenant_id
          and location.project_id = bom.project_id
          and location.id = new.location_id
        where bom.tenant_id = new.tenant_id
          and bom.id = new.bom_id
     )
  then
    raise exception 'BOM line location must belong to the BOM project';
  end if;
  return new;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.bom_line_items'::regclass
       and tgname = 'enforce_bom_line_item_location_project'
  ) then
    create trigger enforce_bom_line_item_location_project
      before insert or update of tenant_id, bom_id, location_id
      on public.bom_line_items
      for each row execute function public.enforce_bom_line_item_location_project();
  end if;
end
$$;

-- Parse only the approved leading room separator forms. The original string
-- stays in description_original; rows without a usable prefix remain queued.
with parsed as (
  select
    line.tenant_id,
    bom.project_id,
    line.id as bom_line_item_id,
    (match.groups)[1] as location_name
  from public.bom_line_items line
  join public.boms bom
    on bom.tenant_id = line.tenant_id
   and bom.id = line.bom_id
  cross join lateral regexp_match(
    btrim(line.description),
    '^\s*(.+?)\s+(' || chr(8212) || '|' || chr(8211) || '|-)\s+(.+?)\s*$'
  ) as match(groups)
  where line.location_id is null
)
insert into public.project_locations (
  tenant_id,
  project_id,
  name,
  level,
  created_at,
  updated_at
)
select distinct
  parsed.tenant_id,
  parsed.project_id,
  btrim(parsed.location_name),
  'room',
  now(),
  now()
from parsed
where length(btrim(parsed.location_name)) > 0
on conflict (tenant_id, project_id, name) do nothing;

with parsed as (
  select
    line.id as bom_line_item_id,
    line.tenant_id,
    bom.project_id,
    (match.groups)[1] as location_name,
    (match.groups)[3] as item_description
  from public.bom_line_items line
  join public.boms bom
    on bom.tenant_id = line.tenant_id
   and bom.id = line.bom_id
  cross join lateral regexp_match(
    btrim(line.description),
    '^\s*(.+?)\s+(' || chr(8212) || '|' || chr(8211) || '|-)\s+(.+?)\s*$'
  ) as match(groups)
  where line.location_id is null
)
update public.bom_line_items line
   set location_id = location.id,
       description = btrim(parsed.item_description),
       updated_at = now()
  from parsed
  join public.project_locations location
    on location.tenant_id = parsed.tenant_id
   and location.project_id = parsed.project_id
   and location.name = btrim(parsed.location_name)
 where line.id = parsed.bom_line_item_id
   and line.tenant_id = parsed.tenant_id
   and line.location_id is null;

insert into public.bom_line_item_location_reviews (
  tenant_id,
  project_id,
  bom_id,
  bom_line_item_id,
  description_original,
  reason,
  created_at,
  updated_at
)
select
  line.tenant_id,
  bom.project_id,
  line.bom_id,
  line.id,
  coalesce(line.description_original, line.description),
  'Leading location prefix was not parseable. Choose a project location before approval.',
  now(),
  now()
from public.bom_line_items line
join public.boms bom
  on bom.tenant_id = line.tenant_id
 and bom.id = line.bom_id
where line.location_id is null
  and not exists (
    select 1
    from public.bom_line_item_location_reviews review
    where review.tenant_id = line.tenant_id
      and review.bom_line_item_id = line.id
      and review.status = 'pending'
  );
