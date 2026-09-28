-- PRD A-11 starts CX onboarding at NTP with a seven-business-day clock.
-- Existing signed-award process steps were seeded at two days. Abort if a
-- two-day CX clock exists: its schedule needs an audited, case-specific repair.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.process_steps') is null
     or to_regclass('public.task_instances') is null
     or to_regclass('public.sla_clocks') is null then
    raise exception 'Expected process SLA tables before CX award correction'
      using errcode = '55000';
  end if;
end
$$;

-- Prevent a new clock from appearing between the guard and the correction.
lock table public.sla_clocks in share mode;

do $$
begin
  perform id from public.process_steps
   where code = 'AWARD.CX_ONBOARDING' and is_active
   for update;

  if exists (
    select 1 from public.process_steps ps
    where ps.code = 'AWARD.CX_ONBOARDING'
      and ps.is_active
      and (
        ps.stage <> 'award'
        or ps.responsible_bu <> 'CX'
        or not ps.is_business_days
        or ps.clock_scope <> 'internal'
        or ps.sla_hours is not null
        or ps.sla_days not in (2, 7)
      )
  ) then
    raise exception 'Active CX award process step differs from expected configuration'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from public.process_steps ps
      join public.task_instances ti
        on ti.tenant_id = ps.tenant_id and ti.process_step_id = ps.id
      join public.sla_clocks sc
        on sc.tenant_id = ti.tenant_id and sc.task_instance_id = ti.id
     where ps.code = 'AWARD.CX_ONBOARDING'
       and ps.is_active
       and ps.sla_days = 2
  ) then
    raise exception 'Two-day CX award clocks require an audited schedule repair before migration'
      using errcode = '55000';
  end if;

  update public.process_steps
     set sla_days = 7,
         updated_at = now()
   where code = 'AWARD.CX_ONBOARDING'
     and is_active
     and sla_days = 2;
end
$$;

commit;

-- Recovery: retain the seven-day rule. If an unexpected schedule appears,
-- stop release and reconcile that tenant's clocks with an audited correction.
-- Do not automatically restore the incorrect two-day process step.
