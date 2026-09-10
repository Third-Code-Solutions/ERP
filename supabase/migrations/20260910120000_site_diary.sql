-- Site diary: one immutable-after-submit daily field record per project/day.

begin;

do $$ begin
  create type public.site_diary_status as enum ('draft', 'submitted');
exception when duplicate_object then null;
end $$;

create table if not exists public.site_diary_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  diary_date date not null,
  status public.site_diary_status not null default 'draft',
  weather varchar(160) not null default '',
  manpower_count integer not null default 0,
  work_completed text not null default '',
  constraints text not null default '',
  safety_notes text not null default '',
  created_by uuid not null,
  submitted_at timestamptz,
  submitted_by uuid,
  client_request_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_diary_entries_manpower_nonnegative check (manpower_count >= 0),
  constraint site_diary_entries_version_positive check (version >= 1),
  constraint site_diary_entries_submit_metadata_consistent check (
    (status = 'draft' and submitted_at is null and submitted_by is null)
    or
    (status = 'submitted' and submitted_at is not null and submitted_by is not null)
  ),
  constraint site_diary_entries_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint site_diary_entries_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint site_diary_entries_submitted_by_tenant_fk foreign key (tenant_id, submitted_by)
    references public.users(tenant_id, id) on delete set null
);

create unique index if not exists ux_site_diary_entries_tenant_id_id
  on public.site_diary_entries (tenant_id, id);
create unique index if not exists ux_site_diary_entries_tenant_project_date
  on public.site_diary_entries (tenant_id, project_id, diary_date);
create unique index if not exists ux_site_diary_entries_tenant_client_request
  on public.site_diary_entries (tenant_id, client_request_id);
create index if not exists idx_site_diary_entries_project_date
  on public.site_diary_entries (tenant_id, project_id, diary_date);
create index if not exists idx_site_diary_entries_project_status
  on public.site_diary_entries (tenant_id, project_id, status);

create or replace function public.prevent_submitted_site_diary_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'submitted' then
    raise exception 'Submitted site diary entries are immutable';
  end if;
  return new;
end;
$$;

alter table public.site_diary_entries enable row level security;
alter table public.site_diary_entries force row level security;
revoke all privileges on table public.site_diary_entries from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'site_diary_entries'
       and policyname = 'site_diary_entries_deny_direct_client_access'
  ) then
    create policy site_diary_entries_deny_direct_client_access
      on public.site_diary_entries
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'prevent_submitted_site_diary_update'
       and tgrelid = 'public.site_diary_entries'::regclass
       and not tgisinternal
  ) then
    create trigger prevent_submitted_site_diary_update
      before update or delete on public.site_diary_entries
      for each row execute function public.prevent_submitted_site_diary_update();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_site_diary_entries'
       and tgrelid = 'public.site_diary_entries'::regclass
       and not tgisinternal
  ) then
    create trigger audit_site_diary_entries
      after insert or update or delete on public.site_diary_entries
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
