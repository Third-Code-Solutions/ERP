-- TG_OP is uppercase in PostgreSQL. Preserve the existing guards while making
-- their operation branches executable. No data, grants, or triggers change.
-- Recovery is roll-forward: never restore lowercase comparisons and the bypass.
begin;

create or replace function public.guard_project_weekly_progress_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
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
  if tg_op in ('UPDATE', 'DELETE') and exists (
    select 1
      from public.project_weekly_progress closure
     where closure.tenant_id = old.tenant_id
       and closure.progress_update_id = old.id
       and closure.status = 'locked'
  ) then
    raise exception 'Progress evidence linked to a locked WAR is immutable';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and exists (
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

commit;
