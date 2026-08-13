-- WO-14: durable Allowable Budget margin snapshot and baseline lock.
-- The approved Project Budget is the immutable cost-control baseline. Draft
-- revisions are the only editable version; VO/transfer workflows must use an
-- explicit workflow write context when those capabilities are introduced.

alter table public.project_budgets
  add column if not exists original_gp_margin_bps integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.project_budgets'::pg_catalog.regclass
      and conname = 'project_budgets_original_margin_range'
  ) then
    alter table public.project_budgets
      add constraint project_budgets_original_margin_range
      check (original_gp_margin_bps between 0 and 10000);
  end if;
end
$$;

-- Existing approved revisions predate the durable snapshot. Use their linked
-- BOM as the best available source once, then preserve the value thereafter.
update public.project_budgets budget
   set original_gp_margin_bps = coalesce(bom.gp_margin_bps, 0)
  from public.boms bom
 where budget.status = 'approved'
   and budget.source_bom_id = bom.id
   and budget.tenant_id = bom.tenant_id;

create or replace function public.guard_project_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow_write boolean;
  v_target_id uuid;
  v_project_id uuid;
begin
  if tg_op = 'DELETE' then
    v_target_id := old.id;
    v_project_id := old.project_id;
  else
    v_target_id := new.id;
    v_project_id := new.project_id;
  end if;
  v_workflow_write := coalesce(
    pg_catalog.current_setting('app.project_budget_write', true),
    ''
  ) in (
    v_target_id::text,
    'project:' || v_project_id::text
  );

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only a draft Project Budget can be deleted'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if new.source_bom_id is not null and not exists (
    select 1
    from public.boms bom
    where bom.id = new.source_bom_id
      and bom.tenant_id = new.tenant_id
      and bom.project_id = new.project_id
  ) then
    raise exception 'Project Budget source BOM must belong to its project'
      using errcode = '23514';
  end if;

  if (
    tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and new.supersedes_budget_id is distinct from old.supersedes_budget_id
    )
  ) and new.supersedes_budget_id is not null and not exists (
    select 1
    from public.project_budgets prior_budget
    where prior_budget.id = new.supersedes_budget_id
      and prior_budget.tenant_id = new.tenant_id
      and prior_budget.project_id = new.project_id
      and prior_budget.status = 'approved'
  ) then
    raise exception 'Project Budget revision must supersede its approved baseline'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and (
    new.status <> 'draft'
    or new.total_budget_cents <> 0
    or new.original_gp_margin_bps <> 0
    or new.submitted_by is not null
    or new.submitted_at is not null
    or new.commercial_approved_by is not null
    or new.commercial_approved_at is not null
    or new.finance_approved_by is not null
    or new.finance_approved_at is not null
    or new.rejected_by is not null
    or new.rejected_at is not null
    or new.rejection_reason is not null
  ) then
    raise exception 'New Project Budget must start as an empty draft'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.project_id is distinct from old.project_id
       or new.revision is distinct from old.revision
       or new.supersedes_budget_id is distinct from old.supersedes_budget_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Project Budget identity is immutable'
        using errcode = '55000';
    end if;

    if new.source_bom_id is distinct from old.source_bom_id
       and exists (
         select 1
         from public.project_budget_lines budget_line
         left join public.bom_line_items bom_line
           on bom_line.id = budget_line.bom_line_item_id
          and bom_line.tenant_id = budget_line.tenant_id
         where budget_line.project_budget_id = old.id
           and budget_line.tenant_id = old.tenant_id
           and budget_line.bom_line_item_id is not null
           and (
             new.source_bom_id is null
             or bom_line.bom_id is distinct from new.source_bom_id
           )
       ) then
      raise exception 'Remove linked budget lines before changing source BOM'
        using errcode = '23514';
    end if;

    if not v_workflow_write and (
      old.status <> 'draft'
      or new.status is distinct from old.status
      or new.source_bom_id is distinct from old.source_bom_id
      or new.control_mode is distinct from old.control_mode
      or new.commitment_tolerance_bps is distinct from
        old.commitment_tolerance_bps
      or new.currency is distinct from old.currency
      or new.effective_from is distinct from old.effective_from
      or new.revision_reason is distinct from old.revision_reason
      or new.total_budget_cents is distinct from old.total_budget_cents
      or new.original_gp_margin_bps is distinct from old.original_gp_margin_bps
      or new.submitted_by is distinct from old.submitted_by
      or new.submitted_at is distinct from old.submitted_at
      or new.commercial_approved_by is distinct from
        old.commercial_approved_by
      or new.commercial_approved_at is distinct from
        old.commercial_approved_at
      or new.finance_approved_by is distinct from old.finance_approved_by
      or new.finance_approved_at is distinct from old.finance_approved_at
      or new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
    ) then
      raise exception 'Use the Project Budget workflow'
        using errcode = '55000';
    end if;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

create or replace function public.snapshot_project_budget_margin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'approved' and new.status = 'approved' then
    new.original_gp_margin_bps := coalesce(
      (
        select bom.gp_margin_bps
        from public.boms bom
        where bom.id = new.source_bom_id
          and bom.tenant_id = new.tenant_id
        limit 1
      ),
      0
    );
  end if;
  return new;
end
$$;

drop trigger if exists snapshot_project_budget_margin
  on public.project_budgets;
create trigger snapshot_project_budget_margin
before update of status on public.project_budgets
for each row execute function public.snapshot_project_budget_margin();

revoke execute on function public.snapshot_project_budget_margin()
  from public, anon, authenticated;
grant execute on function public.snapshot_project_budget_margin()
  to service_role;

-- The original workflow functions use a transaction-local trigger context.
-- Keep their business logic unchanged, but clear that context at the public
-- function boundary so a later statement in the same transaction cannot
-- inherit workflow authority.
alter function public.submit_project_budget(uuid, uuid)
  rename to submit_project_budget_impl;
alter function public.review_project_budget(uuid, uuid, text)
  rename to review_project_budget_impl;
alter function public.reject_project_budget(uuid, uuid, text)
  rename to reject_project_budget_impl;

create or replace function public.submit_project_budget(
  p_budget_id uuid,
  p_actor_id uuid
)
returns table (
  budget_id uuid,
  budget_status public.project_budget_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select *
  from public.submit_project_budget_impl(p_budget_id, p_actor_id);
  perform pg_catalog.set_config('app.project_budget_write', '', true);
exception when others then
  perform pg_catalog.set_config('app.project_budget_write', '', true);
  raise;
end
$$;

create or replace function public.review_project_budget(
  p_budget_id uuid,
  p_actor_id uuid,
  p_lane text
)
returns table (
  budget_id uuid,
  budget_status public.project_budget_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select *
  from public.review_project_budget_impl(p_budget_id, p_actor_id, p_lane);
  perform pg_catalog.set_config('app.project_budget_write', '', true);
exception when others then
  perform pg_catalog.set_config('app.project_budget_write', '', true);
  raise;
end
$$;

create or replace function public.reject_project_budget(
  p_budget_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns table (
  budget_id uuid,
  budget_status public.project_budget_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select *
  from public.reject_project_budget_impl(p_budget_id, p_actor_id, p_reason);
  perform pg_catalog.set_config('app.project_budget_write', '', true);
exception when others then
  perform pg_catalog.set_config('app.project_budget_write', '', true);
  raise;
end
$$;

revoke execute on function public.submit_project_budget_impl(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.review_project_budget_impl(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.reject_project_budget_impl(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.submit_project_budget_impl(uuid, uuid)
  to service_role;
grant execute on function public.review_project_budget_impl(uuid, uuid, text)
  to service_role;
grant execute on function public.reject_project_budget_impl(uuid, uuid, text)
  to service_role;

revoke execute on function public.submit_project_budget(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.review_project_budget(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.reject_project_budget(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.submit_project_budget(uuid, uuid)
  to service_role;
grant execute on function public.review_project_budget(uuid, uuid, text)
  to service_role;
grant execute on function public.reject_project_budget(uuid, uuid, text)
  to service_role;
