-- Canonical weekly progress capture and WAR cut-off ledger.
-- The legacy progress_updates table remains readable and writable only through
-- existing compatibility paths; this ledger adds one tenant-scoped, immutable
-- post-cut-off record per project/week.

begin;

do $$ begin
  create type public.project_weekly_progress_status as enum ('open', 'locked');
exception when duplicate_object then null;
end $$;

-- Composite tenant FKs require a matching unique key on the legacy UUID table.
create unique index if not exists ux_progress_updates_tenant_id_id
  on public.progress_updates (tenant_id, id);

create table if not exists public.project_weekly_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  progress_update_id uuid not null,
  client_request_id uuid not null,
  request_hash varchar(64) not null,
  week_ending date not null,
  cutoff_at timestamptz not null,
  status public.project_weekly_progress_status not null default 'open',
  war_snapshot jsonb,
  locked_at timestamptz,
  locked_by uuid,
  lock_reason text not null default '',
  version integer not null default 1,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_weekly_progress_tenant_id_id_unique unique (tenant_id, id),
  constraint project_weekly_progress_project_week_unique unique (tenant_id, project_id, week_ending),
  constraint project_weekly_progress_request_unique unique (tenant_id, client_request_id),
  constraint project_weekly_progress_request_hash_length check (length(request_hash) = 64),
  constraint project_weekly_progress_version_positive check (version >= 1),
  constraint project_weekly_progress_cutoff_after_week check (cutoff_at >= (week_ending::timestamptz)),
  constraint project_weekly_progress_lock_state check (
    (status = 'open' and locked_at is null and locked_by is null and war_snapshot is null)
    or
    (status = 'locked' and locked_at is not null and locked_by is not null and war_snapshot is not null)
  ),
  constraint project_weekly_progress_lock_reason_length check (length(lock_reason) <= 5000),
  constraint project_weekly_progress_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint project_weekly_progress_update_tenant_fk foreign key (tenant_id, progress_update_id)
    references public.progress_updates(tenant_id, id) on delete restrict,
  constraint project_weekly_progress_locked_by_tenant_fk foreign key (tenant_id, locked_by)
    references public.users(tenant_id, id) on delete restrict,
  constraint project_weekly_progress_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict
);

create unique index if not exists ux_project_weekly_progress_tenant_id_id
  on public.project_weekly_progress (tenant_id, id);
create unique index if not exists ux_project_weekly_progress_project_week
  on public.project_weekly_progress (tenant_id, project_id, week_ending);
create unique index if not exists ux_project_weekly_progress_request
  on public.project_weekly_progress (tenant_id, client_request_id);
create index if not exists idx_project_weekly_progress_project_status
  on public.project_weekly_progress (tenant_id, project_id, status, week_ending);

create or replace function public.assert_project_weekly_progress_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  update_project_id uuid;
begin
  select project_id into update_project_id
    from public.progress_updates
   where tenant_id = new.tenant_id
     and id = new.progress_update_id;
  if update_project_id is null or update_project_id <> new.project_id then
    raise exception 'Weekly progress evidence is outside the project scope';
  end if;
  if new.status = 'locked' and new.cutoff_at > now() then
    raise exception 'Weekly progress cannot be locked before its Thursday cut-off';
  end if;
  return new;
end;
$$;

create or replace function public.guard_project_weekly_progress_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'delete' then
    if old.status = 'locked' then
      raise exception 'Locked weekly progress is immutable';
    end if;
    return old;
  end if;
  if old.status = 'locked' then
    raise exception 'Locked weekly progress is immutable';
  end if;
  if new.status <> old.status and new.status <> 'locked' then
    raise exception 'Unsupported weekly progress status transition';
  end if;
  return new;
end;
$$;

create or replace function public.guard_progress_update_against_war_cutoff()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op in ('update', 'delete') and exists (
    select 1
      from public.project_weekly_progress closure
     where closure.tenant_id = old.tenant_id
       and closure.progress_update_id = old.id
       and closure.status = 'locked'
  ) then
    raise exception 'Progress evidence linked to a locked WAR is immutable';
  end if;
  if tg_op in ('insert', 'update') and exists (
    select 1
      from public.project_weekly_progress closure
     where closure.tenant_id = new.tenant_id
       and closure.project_id = new.project_id
       and closure.week_ending = new.week_ending::date
       and closure.status = 'locked'
  ) then
    raise exception 'Weekly progress is past the locked WAR cut-off';
  end if;
  return coalesce(new, old);
end;
$$;

alter table public.project_weekly_progress enable row level security;
alter table public.project_weekly_progress force row level security;
revoke all privileges on table public.project_weekly_progress from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'project_weekly_progress'
       and policyname = 'project_weekly_progress_deny_direct_client_access'
  ) then
    create policy project_weekly_progress_deny_direct_client_access
      on public.project_weekly_progress
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'assert_project_weekly_progress_scope'
       and tgrelid = 'public.project_weekly_progress'::regclass
       and not tgisinternal
  ) then
    create trigger assert_project_weekly_progress_scope
      before insert or update on public.project_weekly_progress
      for each row execute function public.assert_project_weekly_progress_scope();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'guard_project_weekly_progress_mutation'
       and tgrelid = 'public.project_weekly_progress'::regclass
       and not tgisinternal
  ) then
    create trigger guard_project_weekly_progress_mutation
      before update or delete on public.project_weekly_progress
      for each row execute function public.guard_project_weekly_progress_mutation();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_project_weekly_progress'
       and tgrelid = 'public.project_weekly_progress'::regclass
       and not tgisinternal
  ) then
    create trigger audit_project_weekly_progress
      after insert or update or delete on public.project_weekly_progress
      for each row execute function public.audit_log_trigger();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'guard_progress_update_against_war_cutoff'
       and tgrelid = 'public.progress_updates'::regclass
       and not tgisinternal
  ) then
    create trigger guard_progress_update_against_war_cutoff
      before insert or update or delete on public.progress_updates
      for each row execute function public.guard_progress_update_against_war_cutoff();
  end if;
end $$;

commit;
