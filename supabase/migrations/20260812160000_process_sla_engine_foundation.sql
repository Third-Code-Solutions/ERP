-- M-06 / WO-03: tenant-scoped process, SLA, and approval foundation.
--
-- This migration deliberately contains NO process_steps seed rows. The ABI SD
-- Framework deck is not present in this repository, and inventing its ~70
-- steps would create false operational data. Load the reviewed deck as a
-- separate, source-backed data migration after ownership and source parity
-- gates pass.
--
-- Clock semantics:
--   * business_days: SD/process clocks use the maintained tenant calendar.
--   * calendar_hours: CX 24h/48h clocks use elapsed wall-clock hours.
--   * internal: can escalate only after observe_mode is disabled.
--   * external: tracked only; never escalates against an ABI BU.
--   * thresholds are implemented by the application clock contract as 80%,
--     100%, and 150%. Stored timestamps are immutable schedule snapshots.

-- WO-02 business-calendar migration must land first. Falling back silently to
-- a national calendar would make tenant-configured business-day clocks false.
do $$
begin
  if to_regclass('public.business_calendar_holidays') is null then
    raise exception
      'M-06 requires public.business_calendar_holidays from WO-02 before apply'
      using errcode = '55000';
  end if;
end
$$;

do $$
begin
  create type public.process_clock_type as enum (
    'business_days',
    'calendar_hours'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.process_clock_scope as enum (
    'internal',
    'external'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.process_task_status as enum (
    'pending',
    'in_progress',
    'blocked',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.sla_clock_status as enum (
    'running',
    'paused',
    'breached',
    'escalated',
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.process_approval_status as enum (
    'pending',
    'approved',
    'rejected',
    'expired',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.process_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  code varchar(64) not null,
  stage varchar(80) not null,
  name varchar(255) not null,
  responsible_bu varchar(120) not null,
  input text not null,
  input_from text not null,
  output text not null,
  output_by text not null,
  sla_days integer,
  -- Additive representation for calendar-hour clocks such as CX 24h/48h.
  sla_hours integer,
  is_business_days boolean not null default true,
  clock_scope public.process_clock_scope not null default 'internal',
  template_link varchar(512),
  predecessor_code varchar(64),
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint process_steps_code_nonempty
    check (code = btrim(code) and length(code) > 0),
  constraint process_steps_stage_nonempty
    check (stage = btrim(stage) and length(stage) > 0),
  constraint process_steps_name_nonempty
    check (name = btrim(name) and length(name) > 0),
  constraint process_steps_owner_nonempty
    check (responsible_bu = btrim(responsible_bu) and length(responsible_bu) > 0),
  constraint process_steps_io_nonempty
    check (
      input = btrim(input) and length(input) > 0
      and input_from = btrim(input_from) and length(input_from) > 0
      and output = btrim(output) and length(output) > 0
      and output_by = btrim(output_by) and length(output_by) > 0
    ),
  constraint process_steps_owner_resolved
    check (responsible_bu not like '%?%'),
  constraint process_steps_clock_duration
    check (
      (is_business_days = true and sla_days is not null and sla_days > 0 and sla_hours is null)
      or
      (is_business_days = false and sla_hours is not null and sla_hours > 0 and sla_days is null)
    )
);

create unique index if not exists ux_process_steps_tenant_id_id
  on public.process_steps (tenant_id, id);
create unique index if not exists ux_process_steps_tenant_code
  on public.process_steps (tenant_id, code);
create index if not exists idx_process_steps_tenant_stage
  on public.process_steps (tenant_id, stage, is_active);
create index if not exists idx_process_steps_tenant_predecessor
  on public.process_steps (tenant_id, predecessor_code);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.process_steps'::regclass
      and conname = 'process_steps_predecessor_tenant_fk'
  ) then
    alter table public.process_steps
      add constraint process_steps_predecessor_tenant_fk
      foreign key (tenant_id, predecessor_code)
      references public.process_steps (tenant_id, code)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.process_steps'::regclass
      and conname = 'process_steps_created_by_tenant_fk'
  ) then
    alter table public.process_steps
      add constraint process_steps_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.process_steps'::regclass
      and conname = 'process_steps_updated_by_tenant_fk'
  ) then
    alter table public.process_steps
      add constraint process_steps_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

create table if not exists public.task_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  process_step_id uuid not null,
  subject_type varchar(64) not null,
  subject_id uuid not null,
  instance_key varchar(255) not null,
  assigned_to uuid,
  status public.process_task_status not null default 'pending',
  blocked_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_instances_subject_type_nonempty
    check (subject_type = btrim(subject_type) and length(subject_type) > 0),
  constraint task_instances_instance_key_nonempty
    check (instance_key = btrim(instance_key) and length(instance_key) > 0),
  constraint task_instances_blocked_reason
    check (
      status <> 'blocked'
      or (blocked_reason is not null and length(btrim(blocked_reason)) > 0)
    )
);

create unique index if not exists ux_task_instances_tenant_id_id
  on public.task_instances (tenant_id, id);
create unique index if not exists ux_task_instances_tenant_instance_key
  on public.task_instances (tenant_id, instance_key);
create index if not exists idx_task_instances_tenant_subject
  on public.task_instances (tenant_id, subject_type, subject_id);
create index if not exists idx_task_instances_tenant_status
  on public.task_instances (tenant_id, status, updated_at);
create index if not exists idx_task_instances_tenant_process_step
  on public.task_instances (tenant_id, process_step_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_instances'::regclass
      and conname = 'task_instances_process_step_tenant_fk'
  ) then
    alter table public.task_instances
      add constraint task_instances_process_step_tenant_fk
      foreign key (tenant_id, process_step_id)
      references public.process_steps (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_instances'::regclass
      and conname = 'task_instances_assigned_to_tenant_fk'
  ) then
    alter table public.task_instances
      add constraint task_instances_assigned_to_tenant_fk
      foreign key (tenant_id, assigned_to)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_instances'::regclass
      and conname = 'task_instances_created_by_tenant_fk'
  ) then
    alter table public.task_instances
      add constraint task_instances_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.task_instances'::regclass
      and conname = 'task_instances_updated_by_tenant_fk'
  ) then
    alter table public.task_instances
      add constraint task_instances_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

create table if not exists public.sla_clocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  task_instance_id uuid not null,
  clock_type public.process_clock_type not null,
  clock_scope public.process_clock_scope not null,
  -- Snapshot: business-day count or calendar-hour count, according to type.
  target_value integer not null,
  started_at timestamptz not null,
  due_at timestamptz not null,
  at_risk_at timestamptz not null,
  escalation_at timestamptz,
  breached_at timestamptz,
  escalated_at timestamptz,
  paused_reason text,
  status public.sla_clock_status not null default 'running',
  observe_mode boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sla_clocks_target_value_positive
    check (target_value > 0),
  constraint sla_clocks_schedule_order
    check (
      started_at <= at_risk_at
      and at_risk_at <= due_at
      and (escalation_at is null or due_at <= escalation_at)
    ),
  constraint sla_clocks_external_never_escalates
    check (
      (clock_scope = 'internal' and escalation_at is not null)
      or
      (
        clock_scope = 'external'
        and escalation_at is null
        and escalated_at is null
        and status <> 'escalated'
      )
    ),
  constraint sla_clocks_paused_reason
    check (
      status <> 'paused'
      or (paused_reason is not null and length(btrim(paused_reason)) > 0)
    )
);

create unique index if not exists ux_sla_clocks_tenant_id_id
  on public.sla_clocks (tenant_id, id);
create unique index if not exists ux_sla_clocks_active_task
  on public.sla_clocks (tenant_id, task_instance_id)
  where status not in ('completed', 'cancelled');
create index if not exists idx_sla_clocks_tenant_due_status
  on public.sla_clocks (tenant_id, status, due_at);
create index if not exists idx_sla_clocks_tenant_scope_status
  on public.sla_clocks (tenant_id, clock_scope, status);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sla_clocks'::regclass
      and conname = 'sla_clocks_task_instance_tenant_fk'
  ) then
    alter table public.sla_clocks
      add constraint sla_clocks_task_instance_tenant_fk
      foreign key (tenant_id, task_instance_id)
      references public.task_instances (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sla_clocks'::regclass
      and conname = 'sla_clocks_created_by_tenant_fk'
  ) then
    alter table public.sla_clocks
      add constraint sla_clocks_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sla_clocks'::regclass
      and conname = 'sla_clocks_updated_by_tenant_fk'
  ) then
    alter table public.sla_clocks
      add constraint sla_clocks_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

create table if not exists public.approval_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  object_type varchar(64) not null,
  -- Amount bands are integer PHP centavos; no floating-point values.
  amount_band_low bigint not null,
  amount_band_high bigint,
  approver_role varchar(80) not null,
  sequence integer not null,
  -- Approval-rule escalation is measured in business days.
  escalation_after_days integer,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_rules_object_type_nonempty
    check (object_type = btrim(object_type) and length(object_type) > 0),
  constraint approval_rules_approver_role_nonempty
    check (approver_role = btrim(approver_role) and length(approver_role) > 0),
  constraint approval_rules_amount_band_valid
    check (
      amount_band_low >= 0
      and (amount_band_high is null or amount_band_high >= amount_band_low)
    ),
  constraint approval_rules_sequence_positive
    check (sequence > 0),
  constraint approval_rules_escalation_days_positive
    check (escalation_after_days is null or escalation_after_days > 0)
);

create unique index if not exists ux_approval_rules_tenant_id_id
  on public.approval_rules (tenant_id, id);
create index if not exists idx_approval_rules_tenant_lookup
  on public.approval_rules (
    tenant_id,
    object_type,
    amount_band_low,
    amount_band_high,
    sequence
  );
create index if not exists idx_approval_rules_tenant_active
  on public.approval_rules (tenant_id, is_active);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_rules'::regclass
      and conname = 'approval_rules_created_by_tenant_fk'
  ) then
    alter table public.approval_rules
      add constraint approval_rules_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approval_rules'::regclass
      and conname = 'approval_rules_updated_by_tenant_fk'
  ) then
    alter table public.approval_rules
      add constraint approval_rules_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  object_type varchar(64) not null,
  object_id uuid not null,
  approval_rule_id uuid not null,
  sequence integer not null,
  approver_user_id uuid,
  status public.process_approval_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approvals_object_type_nonempty
    check (object_type = btrim(object_type) and length(object_type) > 0),
  constraint approvals_sequence_positive
    check (sequence > 0),
  constraint approvals_decision_state
    check (
      (status = 'pending' and decided_at is null)
      or
      (status <> 'pending' and decided_at is not null)
    ),
  constraint approvals_rejection_note
    check (
      status <> 'rejected'
      or (decision_note is not null and length(btrim(decision_note)) > 0)
    )
);

create unique index if not exists ux_approvals_tenant_id_id
  on public.approvals (tenant_id, id);
create unique index if not exists ux_approvals_tenant_object_sequence
  on public.approvals (tenant_id, object_type, object_id, sequence);
create index if not exists idx_approvals_tenant_status
  on public.approvals (tenant_id, status, requested_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approvals'::regclass
      and conname = 'approvals_rule_tenant_fk'
  ) then
    alter table public.approvals
      add constraint approvals_rule_tenant_fk
      foreign key (tenant_id, approval_rule_id)
      references public.approval_rules (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approvals'::regclass
      and conname = 'approvals_approver_user_tenant_fk'
  ) then
    alter table public.approvals
      add constraint approvals_approver_user_tenant_fk
      foreign key (tenant_id, approver_user_id)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approvals'::regclass
      and conname = 'approvals_created_by_tenant_fk'
  ) then
    alter table public.approvals
      add constraint approvals_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.approvals'::regclass
      and conname = 'approvals_updated_by_tenant_fk'
  ) then
    alter table public.approvals
      add constraint approvals_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users (tenant_id, id)
      on delete restrict;
  end if;
end
$$;

-- Keep mutation timestamps and tenant identity stable at the database boundary.
create or replace function public.process_sla_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Process SLA row identity and creation metadata are immutable'
      using errcode = '55000';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'process_steps',
    'task_instances',
    'sla_clocks',
    'approval_rules',
    'approvals'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      table_name || '_set_updated_at',
      table_name
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.process_sla_set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end
$$;

-- Every mutation is captured by the existing append-only audit chain.
do $$
declare
  table_name text;
begin
  if to_regprocedure('public.audit_log_trigger()') is null then
    raise exception 'M-06 requires public.audit_log_trigger() before applying'
      using errcode = '55000';
  end if;

  foreach table_name in array array[
    'process_steps',
    'task_instances',
    'sla_clocks',
    'approval_rules',
    'approvals'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'audit_' || table_name,
      table_name
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()',
      'audit_' || table_name,
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'process_steps',
    'task_instances',
    'sla_clocks',
    'approval_rules',
    'approvals'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      table_name
    );
    execute format(
      'grant select on table public.%I to authenticated',
      table_name
    );
    execute format(
      'grant all privileges on table public.%I to service_role',
      table_name
    );
  end loop;
end
$$;

-- RLS remains tenant-only. Capability/role decisions belong in typed API
-- routes; service_role is reserved for server workflows and audited jobs.
do $$
declare
  table_name text;
  write_roles text;
  write_check text;
begin
  foreach table_name in array array[
    'process_steps',
    'task_instances',
    'sla_clocks',
    'approval_rules',
    'approvals'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (tenant_id = public.auth_tenant_id())',
      table_name || '_tenant_read',
      table_name
    );

    if table_name = 'process_steps' then
      write_roles := '{admin,owner}';
    elsif table_name = 'approval_rules' then
      write_roles := '{admin,owner,commercial,finance}';
    elsif table_name = 'approvals' then
      write_roles := '{admin,owner,commercial,finance,procurement,sd_pm_pe,pm}';
    elsif table_name = 'task_instances' then
      write_roles := '{admin,owner,commercial,design,sd_pm_pe,pm,procurement,safety,cx}';
    else
      write_roles := '{}';
    end if;

    -- SLA schedule rows are server/worker-owned. Other writes are role-bound
    -- even if a future Data API grant is added; tenant RLS is not a capability
    -- substitute.
    if table_name = 'sla_clocks' then
      continue;
    end if;

    write_check := format(
      'tenant_id = public.auth_tenant_id() and exists (select 1 from public.users app_user where app_user.id = (select auth.uid()) and app_user.tenant_id = public.%I.tenant_id and app_user.role::text = any (%L::text[]))',
      table_name,
      write_roles
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_insert', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      table_name || '_tenant_insert',
      table_name,
      write_check
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_update', table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      table_name || '_tenant_update',
      table_name,
      write_check,
      write_check
    );
  end loop;
end
$$;
