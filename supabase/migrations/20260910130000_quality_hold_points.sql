-- QA/QC hold points and inspection-work-request evidence spine.

begin;

do $$ begin
  create type public.quality_hold_point_status as enum (
    'planned',
    'ready',
    'submitted',
    'accepted',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.quality_hold_points (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  iwr_number varchar(40) not null,
  title varchar(200) not null,
  description text not null,
  discipline varchar(120) not null default '',
  location varchar(200) not null default '',
  plan_reference varchar(200) not null default '',
  hold_point boolean not null default true,
  inspection_date date,
  status public.quality_hold_point_status not null default 'planned',
  request_notes text not null default '',
  findings text not null default '',
  rejection_reason text not null default '',
  acceptance_notes text not null default '',
  requested_by uuid not null,
  assigned_to uuid,
  submitted_at timestamptz,
  submitted_by uuid,
  accepted_at timestamptz,
  accepted_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  client_request_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quality_hold_points_title_nonempty check (title = btrim(title) and length(title) > 0),
  constraint quality_hold_points_description_nonempty check (description = btrim(description) and length(description) > 0),
  constraint quality_hold_points_version_positive check (version >= 1),
  constraint quality_hold_points_lifecycle_metadata_consistent check (
    (status in ('planned', 'ready') and submitted_at is null and submitted_by is null and accepted_at is null and accepted_by is null and rejected_at is null and rejected_by is null)
    or
    (status = 'submitted' and submitted_at is not null and submitted_by is not null and accepted_at is null and accepted_by is null and rejected_at is null and rejected_by is null)
    or
    (status = 'accepted' and submitted_at is not null and submitted_by is not null and accepted_at is not null and accepted_by is not null and rejected_at is null and rejected_by is null)
    or
    (status = 'rejected' and submitted_at is not null and submitted_by is not null and accepted_at is null and accepted_by is null and rejected_at is not null and rejected_by is not null)
  ),
  constraint quality_hold_points_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint quality_hold_points_requested_by_tenant_fk foreign key (tenant_id, requested_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint quality_hold_points_assigned_to_tenant_fk foreign key (tenant_id, assigned_to)
    references public.users(tenant_id, id) on delete set null,
  constraint quality_hold_points_submitted_by_tenant_fk foreign key (tenant_id, submitted_by)
    references public.users(tenant_id, id) on delete set null,
  constraint quality_hold_points_accepted_by_tenant_fk foreign key (tenant_id, accepted_by)
    references public.users(tenant_id, id) on delete set null,
  constraint quality_hold_points_rejected_by_tenant_fk foreign key (tenant_id, rejected_by)
    references public.users(tenant_id, id) on delete set null
);

create unique index if not exists ux_quality_hold_points_tenant_id_id
  on public.quality_hold_points (tenant_id, id);
create unique index if not exists ux_quality_hold_points_tenant_project_number
  on public.quality_hold_points (tenant_id, project_id, iwr_number);
create unique index if not exists ux_quality_hold_points_tenant_client_request
  on public.quality_hold_points (tenant_id, client_request_id);
create index if not exists idx_quality_hold_points_project_status
  on public.quality_hold_points (tenant_id, project_id, status);
create index if not exists idx_quality_hold_points_assigned_status
  on public.quality_hold_points (tenant_id, assigned_to, status);

create or replace function public.prevent_accepted_quality_hold_point_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'accepted' then
    raise exception 'Accepted quality hold points are immutable';
  end if;
  return new;
end;
$$;

alter table public.quality_hold_points enable row level security;
alter table public.quality_hold_points force row level security;
revoke all privileges on table public.quality_hold_points from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'quality_hold_points'
       and policyname = 'quality_hold_points_deny_direct_client_access'
  ) then
    create policy quality_hold_points_deny_direct_client_access
      on public.quality_hold_points
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'prevent_accepted_quality_hold_point_update'
       and tgrelid = 'public.quality_hold_points'::regclass
       and not tgisinternal
  ) then
    create trigger prevent_accepted_quality_hold_point_update
      before update or delete on public.quality_hold_points
      for each row execute function public.prevent_accepted_quality_hold_point_update();
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_quality_hold_points'
       and tgrelid = 'public.quality_hold_points'::regclass
       and not tgisinternal
  ) then
    create trigger audit_quality_hold_points
      after insert or update or delete on public.quality_hold_points
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
