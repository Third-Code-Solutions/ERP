-- Normalized L1-L4 schedule and Last-Planner commitment register.
-- Existing master_schedules JSON and progress routes remain untouched.

begin;

do $$ begin
  create type public.project_schedule_level as enum ('l1', 'l2', 'l3', 'l4');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_schedule_task_status as enum ('planned', 'in_progress', 'blocked', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_schedule_commitment_status as enum ('not_set', 'committed', 'complete', 'not_done');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_schedule_source as enum ('manual', 'legacy_l1', 'ms_project');
exception when duplicate_object then null;
end $$;

create table if not exists public.project_schedule_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  level public.project_schedule_level not null,
  task_code varchar(80) not null,
  name varchar(200) not null,
  description text not null default '',
  parent_task_id uuid,
  predecessor_task_id uuid,
  planned_start date not null,
  planned_finish date not null,
  actual_start date,
  actual_finish date,
  percent_complete integer not null default 0,
  planned_labor_minutes integer not null default 0,
  actual_labor_minutes integer not null default 0,
  status public.project_schedule_task_status not null default 'planned',
  commitment_week date,
  commitment_status public.project_schedule_commitment_status not null default 'not_set',
  constraint_reason text not null default '',
  owner_id uuid,
  source public.project_schedule_source not null default 'manual',
  client_request_id uuid not null,
  request_hash varchar(64) not null,
  version integer not null default 1,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_schedule_tasks_tenant_id_id_unique unique (tenant_id, id),
  constraint project_schedule_tasks_task_code_nonempty check (task_code = btrim(task_code) and length(task_code) > 0),
  constraint project_schedule_tasks_name_nonempty check (name = btrim(name) and length(name) > 0),
  constraint project_schedule_tasks_planned_date_range check (planned_finish >= planned_start),
  constraint project_schedule_tasks_actual_date_range check (actual_start is null or actual_finish is null or actual_finish >= actual_start),
  constraint project_schedule_tasks_percent_range check (percent_complete between 0 and 100),
  constraint project_schedule_tasks_labor_range check (planned_labor_minutes >= 0 and actual_labor_minutes >= 0),
  constraint project_schedule_tasks_version_positive check (version >= 1),
  constraint project_schedule_tasks_request_hash_length check (length(request_hash) = 64),
  constraint project_schedule_tasks_completed_consistency check (status <> 'completed' or (percent_complete = 100 and actual_finish is not null)),
  constraint project_schedule_tasks_not_done_reason check (commitment_status <> 'not_done' or length(btrim(constraint_reason)) > 0),
  constraint project_schedule_tasks_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint project_schedule_tasks_parent_tenant_fk foreign key (tenant_id, parent_task_id)
    references public.project_schedule_tasks(tenant_id, id) on delete set null,
  constraint project_schedule_tasks_predecessor_tenant_fk foreign key (tenant_id, predecessor_task_id)
    references public.project_schedule_tasks(tenant_id, id) on delete set null,
  constraint project_schedule_tasks_owner_tenant_fk foreign key (tenant_id, owner_id)
    references public.users(tenant_id, id) on delete set null,
  constraint project_schedule_tasks_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict
);

create unique index if not exists ux_project_schedule_tasks_tenant_id_id
  on public.project_schedule_tasks (tenant_id, id);
create unique index if not exists ux_project_schedule_tasks_tenant_project_level_code
  on public.project_schedule_tasks (tenant_id, project_id, level, task_code);
create unique index if not exists ux_project_schedule_tasks_tenant_client_request
  on public.project_schedule_tasks (tenant_id, client_request_id);
create index if not exists idx_project_schedule_tasks_project_level
  on public.project_schedule_tasks (tenant_id, project_id, level, planned_start);
create index if not exists idx_project_schedule_tasks_commitment
  on public.project_schedule_tasks (tenant_id, project_id, commitment_week, commitment_status);
create index if not exists idx_project_schedule_tasks_status
  on public.project_schedule_tasks (tenant_id, project_id, status, planned_finish);

create or replace function public.assert_project_schedule_task_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  parent_project_id uuid;
  parent_level public.project_schedule_level;
  predecessor_project_id uuid;
  predecessor_level public.project_schedule_level;
begin
  if new.parent_task_id is not null then
    select project_id, level into parent_project_id, parent_level
      from public.project_schedule_tasks
     where tenant_id = new.tenant_id and id = new.parent_task_id;
    if parent_project_id is null or parent_project_id <> new.project_id then
      raise exception 'Parent schedule task is outside the project scope';
    end if;
    if parent_level = new.level then
      raise exception 'Parent schedule task must be at a different schedule level';
    end if;
  end if;
  if new.predecessor_task_id is not null then
    select project_id, level into predecessor_project_id, predecessor_level
      from public.project_schedule_tasks
     where tenant_id = new.tenant_id and id = new.predecessor_task_id;
    if predecessor_project_id is null or predecessor_project_id <> new.project_id or predecessor_level <> new.level then
      raise exception 'Predecessor schedule task must be in the same project and level';
    end if;
  end if;
  if new.parent_task_id = new.id or new.predecessor_task_id = new.id then
    raise exception 'Schedule task cannot reference itself';
  end if;
  return new;
end;
$$;

alter table public.project_schedule_tasks enable row level security;
alter table public.project_schedule_tasks force row level security;
revoke all privileges on table public.project_schedule_tasks from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'project_schedule_tasks'
       and policyname = 'project_schedule_tasks_deny_direct_client_access'
  ) then
    create policy project_schedule_tasks_deny_direct_client_access
      on public.project_schedule_tasks
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'assert_project_schedule_task_scope'
       and tgrelid = 'public.project_schedule_tasks'::regclass
       and not tgisinternal
  ) then
    create trigger assert_project_schedule_task_scope
      before insert or update on public.project_schedule_tasks
      for each row execute function public.assert_project_schedule_task_scope();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_project_schedule_tasks'
       and tgrelid = 'public.project_schedule_tasks'::regclass
       and not tgisinternal
  ) then
    create trigger audit_project_schedule_tasks
      after insert or update or delete on public.project_schedule_tasks
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
