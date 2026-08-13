-- WO-13: signed BOM -> atomic execution handoff.
--
-- The current BOM contract is project-bound (boms.project_id is NOT NULL).
-- This migration therefore promotes that existing project shell and records
-- the compatibility boundary in award_handoffs.project_was_created=false.

begin;

alter table public.projects
  add column if not exists project_code varchar(40);

create unique index if not exists ux_projects_tenant_project_code
  on public.projects (tenant_id, project_code)
  where project_code is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_project_code_nonempty'
  ) then
    alter table public.projects
      add constraint projects_project_code_nonempty
      check (project_code is null or (project_code = btrim(project_code) and length(project_code) > 0));
  end if;
end
$$;

create unique index if not exists ux_master_schedules_tenant_id_id
  on public.master_schedules (tenant_id, id);

do $$
begin
  create type public.award_handoff_status as enum ('active', 'reversed');
exception when duplicate_object then null;
end
$$;

create table if not exists public.award_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_bom_id uuid not null,
  opportunity_id uuid,
  project_id uuid not null,
  project_code varchar(40) not null,
  project_was_created boolean not null default false,
  budget_id uuid not null,
  dp_invoice_id uuid not null,
  project_tracker_id uuid not null,
  task_ids jsonb not null default '{}'::jsonb,
  status public.award_handoff_status not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason varchar(500),
  constraint award_handoffs_source_bom_tenant_fk
    foreign key (tenant_id, source_bom_id)
    references public.boms(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_opportunity_tenant_fk
    foreign key (tenant_id, opportunity_id)
    references public.opportunities(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_budget_tenant_fk
    foreign key (tenant_id, budget_id)
    references public.project_budgets(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_invoice_tenant_fk
    foreign key (tenant_id, dp_invoice_id)
    references public.invoices(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_tracker_tenant_fk
    foreign key (tenant_id, project_tracker_id)
    references public.master_schedules(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_reversed_by_tenant_fk
    foreign key (tenant_id, reversed_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint award_handoffs_task_ids_object
    check (jsonb_typeof(task_ids) = 'object'),
  constraint award_handoffs_project_code_nonempty
    check (project_code = btrim(project_code) and length(project_code) > 0),
  constraint award_handoffs_reversal_state
    check (
      (status = 'active' and reversed_at is null and reversed_by is null and reversal_reason is null)
      or
      (status = 'reversed' and reversed_at is not null and reversed_by is not null
       and reversal_reason is not null and length(btrim(reversal_reason)) > 0)
    )
);

create unique index if not exists ux_award_handoffs_tenant_id_id
  on public.award_handoffs (tenant_id, id);
create unique index if not exists ux_award_handoffs_tenant_source_bom
  on public.award_handoffs (tenant_id, source_bom_id);
create index if not exists idx_award_handoffs_tenant_project
  on public.award_handoffs (tenant_id, project_id, status);
create index if not exists idx_award_handoffs_tenant_status
  on public.award_handoffs (tenant_id, status);

alter table public.award_handoffs enable row level security;
revoke all privileges on table public.award_handoffs from public, anon, authenticated;
grant select, insert, update on table public.award_handoffs to authenticated;
grant all privileges on table public.award_handoffs to service_role;

drop policy if exists award_handoffs_tenant_read on public.award_handoffs;
create policy award_handoffs_tenant_read
  on public.award_handoffs for select to authenticated
  using (tenant_id = public.auth_tenant_id());

drop policy if exists award_handoffs_tenant_insert on public.award_handoffs;
create policy award_handoffs_tenant_insert
  on public.award_handoffs for insert to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'finance', 'sd_pm_pe', 'pm')
    )
  );

drop policy if exists award_handoffs_tenant_update on public.award_handoffs;
create policy award_handoffs_tenant_update
  on public.award_handoffs for update to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'finance', 'sd_pm_pe', 'pm')
    )
  )
  with check (tenant_id = public.auth_tenant_id());

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.award_handoffs'::regclass
      and tgname = 'audit_award_handoffs'
  ) then
    create trigger audit_award_handoffs
      after insert or update or delete on public.award_handoffs
      for each row execute function public.audit_log_trigger();
  end if;
end
$$;

commit;
