-- Third Code ERP Project Budget workflow, dimensions, and PO control.

create or replace function public.auth_can_read_budgets()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users app_user
    where app_user.id = (select auth.uid())
      and app_user.tenant_id = public.auth_tenant_id()
      and app_user.role::text in (
        'admin',
        'owner',
        'finance',
        'commercial',
        'procurement',
        'sd_pm_pe',
        'pm',
        'estimator'
      )
  )
$$;

create or replace function public.auth_can_manage_budgets()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users app_user
    where app_user.id = (select auth.uid())
      and app_user.tenant_id = public.auth_tenant_id()
      and app_user.role::text in (
        'admin',
        'owner',
        'finance',
        'commercial',
        'sd_pm_pe',
        'pm',
        'estimator'
      )
  )
$$;

create or replace function public.guard_cost_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.project_budget_lines budget_line
      where budget_line.cost_code_id = old.id
        and budget_line.tenant_id = old.tenant_id
    ) or exists (
      select 1
      from public.po_line_items po_line
      where po_line.cost_code_id = old.id
        and po_line.tenant_id = old.tenant_id
    ) or exists (
      select 1
      from public.cost_entries cost
      where cost.cost_code_id = old.id
        and cost.tenant_id = old.tenant_id
    ) then
      raise exception 'Used Cost Code cannot be deleted'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       or new.created_by is distinct from old.created_by then
      raise exception 'Cost Code ownership is immutable'
        using errcode = '55000';
    end if;

    if (
      new.code is distinct from old.code
      or new.category is distinct from old.category
    ) and (
      exists (
        select 1
        from public.project_budget_lines budget_line
        join public.project_budgets budget
          on budget.id = budget_line.project_budget_id
         and budget.tenant_id = budget_line.tenant_id
        where budget_line.cost_code_id = old.id
          and budget_line.tenant_id = old.tenant_id
          and budget.status <> 'draft'
      ) or exists (
        select 1
        from public.po_line_items po_line
        join public.purchase_orders purchase_order
          on purchase_order.id = po_line.po_id
         and purchase_order.tenant_id = po_line.tenant_id
        where po_line.cost_code_id = old.id
          and po_line.tenant_id = old.tenant_id
          and purchase_order.status <> 'draft'
      )
    ) then
      raise exception 'Used Cost Code classification is immutable'
        using errcode = '55000';
    end if;
  end if;

  new.code := upper(btrim(new.code));
  new.name := btrim(new.name);
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

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

  if new.supersedes_budget_id is not null and not exists (
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
    if new.tenant_id is distinct from old.tenant_id
       or new.project_id is distinct from old.project_id
       or new.revision is distinct from old.revision
       or new.supersedes_budget_id is distinct from old.supersedes_budget_id
       or new.created_by is distinct from old.created_by then
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
      or new.total_budget_cents is distinct from old.total_budget_cents
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

create or replace function public.guard_project_budget_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget public.project_budgets%rowtype;
  v_code public.cost_codes%rowtype;
  v_bom_id uuid;
  v_budget_id uuid;
  v_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    v_budget_id := old.project_budget_id;
    v_tenant_id := old.tenant_id;
  else
    v_budget_id := new.project_budget_id;
    v_tenant_id := new.tenant_id;
  end if;

  select budget.*
    into v_budget
    from public.project_budgets budget
   where budget.id = v_budget_id
     and budget.tenant_id = v_tenant_id;

  if not found or v_budget.status <> 'draft' then
    raise exception 'Only draft Project Budget lines can change'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select cost_code.*
    into v_code
    from public.cost_codes cost_code
   where cost_code.id = new.cost_code_id
     and cost_code.tenant_id = new.tenant_id;

  if not found or not v_code.is_active then
    raise exception 'Project Budget line requires an active Cost Code'
      using errcode = '23514';
  end if;

  if new.bom_line_item_id is not null then
    select bom_line.bom_id
      into v_bom_id
      from public.bom_line_items bom_line
     where bom_line.id = new.bom_line_item_id
       and bom_line.tenant_id = new.tenant_id;
    if v_bom_id is null
       or v_budget.source_bom_id is null
       or v_bom_id <> v_budget.source_bom_id then
      raise exception 'Budget BOM line must belong to its source BOM'
        using errcode = '23514';
    end if;
  end if;

  new.description := btrim(new.description);
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;

create or replace function public.refresh_project_budget_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget_id uuid;
begin
  if tg_op = 'DELETE' then
    v_budget_id := old.project_budget_id;
  else
    v_budget_id := new.project_budget_id;
  end if;

  perform pg_catalog.set_config(
    'app.project_budget_write',
    v_budget_id::text,
    true
  );
  update public.project_budgets budget
     set total_budget_cents = (
       select coalesce(sum(line.amount_cents), 0)::bigint
       from public.project_budget_lines line
       where line.project_budget_id = v_budget_id
         and line.tenant_id = budget.tenant_id
     ),
     updated_at = pg_catalog.clock_timestamp()
   where budget.id = v_budget_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.guard_po_line_budget_dimension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_code_active boolean;
  v_po_id uuid;
  v_tenant_id uuid;
begin
  if tg_op = 'DELETE' then
    v_po_id := old.po_id;
    v_tenant_id := old.tenant_id;
  else
    v_po_id := new.po_id;
    v_tenant_id := new.tenant_id;
  end if;

  select purchase_order.*
    into v_po
    from public.purchase_orders purchase_order
   where purchase_order.id = v_po_id
     and purchase_order.tenant_id = v_tenant_id;

  if not found then
    raise exception 'Purchase Order not found for line'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and v_po.status <> 'draft'
     and (
       new.cost_code_id is distinct from old.cost_code_id
       or new.bom_line_item_id is distinct from old.bom_line_item_id
     ) then
    raise exception 'Issued Purchase Order Cost Code is immutable'
      using errcode = '55000';
  end if;

  if tg_op <> 'DELETE' and new.cost_code_id is not null then
    select cost_code.is_active
      into v_code_active
      from public.cost_codes cost_code
     where cost_code.id = new.cost_code_id
       and cost_code.tenant_id = new.tenant_id;
    if not coalesce(v_code_active, false) then
      raise exception 'Purchase Order line requires an active Cost Code'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.guard_supplier_bill_cost_dimension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po_cost_code_id uuid;
begin
  if new.po_line_item_id is null then
    raise exception 'Supplier Bill line requires Purchase Order Cost Code evidence'
      using errcode = '23514';
  end if;

  select po_line.cost_code_id
    into v_po_cost_code_id
    from public.po_line_items po_line
   where po_line.id = new.po_line_item_id
     and po_line.tenant_id = new.tenant_id;

  if not found or v_po_cost_code_id is null then
    raise exception 'Supplier Bill line requires Purchase Order Cost Code evidence'
      using errcode = '23514';
  end if;

  if new.cost_code_id is null then
    new.cost_code_id := v_po_cost_code_id;
  elsif new.cost_code_id <> v_po_cost_code_id then
    raise exception 'Supplier Bill Cost Code must match Purchase Order line'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function public.guard_cost_entry_dimension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.cost_category;
  v_active boolean;
begin
  if new.cost_code_id is null then
    raise exception 'Cost Entry requires a Cost Code'
      using errcode = '23514';
  end if;

  select cost_code.category, cost_code.is_active
    into v_category, v_active
    from public.cost_codes cost_code
   where cost_code.id = new.cost_code_id
     and cost_code.tenant_id = new.tenant_id;

  if not found or not v_active then
    raise exception 'Cost Entry requires an active Cost Code'
      using errcode = '23514';
  end if;
  if v_category <> new.cost_category then
    raise exception 'Cost Entry category must match its Cost Code'
      using errcode = '23514';
  end if;

  return new;
end
$$;

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
declare
  v_budget public.project_budgets%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
begin
  select budget.*
    into v_budget
    from public.project_budgets budget
   where budget.id = p_budget_id;
  if not found then
    raise exception 'Project Budget not found'
      using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_budget.tenant_id::text || ':' || v_budget.project_id::text,
      0
    )
  );
  select budget.*
    into v_budget
    from public.project_budgets budget
   where budget.id = p_budget_id
   for update;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;
  if v_actor_tenant is null
     or v_actor_tenant <> v_budget.tenant_id
     or v_actor_role not in (
       'admin',
       'owner',
       'finance',
       'commercial',
       'sd_pm_pe',
       'pm',
       'estimator'
     ) then
    raise exception 'Actor cannot submit this Project Budget'
      using errcode = '42501';
  end if;
  if v_budget.status <> 'draft' then
    raise exception 'Only a draft Project Budget can be submitted'
      using errcode = '23514';
  end if;
  if v_budget.total_budget_cents <= 0
     or not exists (
       select 1
       from public.project_budget_lines line
       where line.project_budget_id = v_budget.id
         and line.tenant_id = v_budget.tenant_id
     ) then
    raise exception 'Project Budget requires positive line evidence'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.project_budget_lines line
    join public.cost_codes cost_code
      on cost_code.id = line.cost_code_id
     and cost_code.tenant_id = line.tenant_id
    where line.project_budget_id = v_budget.id
      and line.tenant_id = v_budget.tenant_id
      and not cost_code.is_active
  ) then
    raise exception 'Project Budget contains an inactive Cost Code'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.project_budget_write',
    'project:' || v_budget.project_id::text,
    true
  );
  update public.project_budgets
     set status = 'pending_approval',
         submitted_by = p_actor_id,
         submitted_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_budget.id;

  return query
  select v_budget.id, 'pending_approval'::public.project_budget_status;
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
declare
  v_budget public.project_budgets%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_commercial_actor uuid;
  v_finance_actor uuid;
begin
  if p_lane not in ('commercial', 'finance') then
    raise exception 'Project Budget approval lane is invalid'
      using errcode = '22023';
  end if;

  select budget.*
    into v_budget
    from public.project_budgets budget
   where budget.id = p_budget_id;
  if not found then
    raise exception 'Project Budget not found'
      using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_budget.tenant_id::text || ':' || v_budget.project_id::text,
      0
    )
  );
  select budget.*
    into v_budget
    from public.project_budgets budget
   where budget.id = p_budget_id
   for update;

  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;
  if v_actor_tenant is null
     or v_actor_tenant <> v_budget.tenant_id then
    raise exception 'Actor cannot review this Project Budget'
      using errcode = '42501';
  end if;
  if v_budget.status <> 'pending_approval' then
    raise exception 'Only a submitted Project Budget can be reviewed'
      using errcode = '23514';
  end if;
  if p_actor_id = v_budget.created_by and v_actor_role <> 'owner' then
    raise exception 'Project Budget creator cannot approve their own revision'
      using errcode = '42501';
  end if;
  if p_lane = 'commercial'
     and v_actor_role not in ('commercial', 'admin', 'owner') then
    raise exception 'Actor cannot approve the Commercial budget lane'
      using errcode = '42501';
  end if;
  if p_lane = 'finance'
     and v_actor_role not in ('finance', 'admin', 'owner') then
    raise exception 'Actor cannot approve the Finance budget lane'
      using errcode = '42501';
  end if;
  if p_lane = 'commercial'
     and v_budget.commercial_approved_by is not null then
    raise exception 'Commercial budget lane is already approved'
      using errcode = '23514';
  end if;
  if p_lane = 'finance'
     and v_budget.finance_approved_by is not null then
    raise exception 'Finance budget lane is already approved'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.project_budget_write',
    'project:' || v_budget.project_id::text,
    true
  );
  if v_actor_role = 'owner' then
    update public.project_budgets
       set commercial_approved_by = coalesce(
             commercial_approved_by,
             p_actor_id
           ),
           commercial_approved_at = coalesce(
             commercial_approved_at,
             pg_catalog.clock_timestamp()
           ),
           finance_approved_by = coalesce(
             finance_approved_by,
             p_actor_id
           ),
           finance_approved_at = coalesce(
             finance_approved_at,
             pg_catalog.clock_timestamp()
           ),
           updated_at = pg_catalog.clock_timestamp()
     where id = v_budget.id;
  elsif p_lane = 'commercial' then
    update public.project_budgets
       set commercial_approved_by = p_actor_id,
           commercial_approved_at = pg_catalog.clock_timestamp(),
           updated_at = pg_catalog.clock_timestamp()
     where id = v_budget.id;
  else
    update public.project_budgets
       set finance_approved_by = p_actor_id,
           finance_approved_at = pg_catalog.clock_timestamp(),
           updated_at = pg_catalog.clock_timestamp()
     where id = v_budget.id;
  end if;

  select budget.commercial_approved_by, budget.finance_approved_by
    into v_commercial_actor, v_finance_actor
    from public.project_budgets budget
   where budget.id = v_budget.id;

  if v_commercial_actor is not null and v_finance_actor is not null then
    if v_commercial_actor = v_finance_actor and v_actor_role <> 'owner' then
      raise exception 'Commercial and Finance approvals require separate actors'
        using errcode = '42501';
    end if;

    perform 1
    from public.project_budgets current_budget
    where current_budget.tenant_id = v_budget.tenant_id
      and current_budget.project_id = v_budget.project_id
      and current_budget.status = 'approved'
    for update;

    update public.project_budgets
       set status = 'superseded',
           updated_at = pg_catalog.clock_timestamp()
     where tenant_id = v_budget.tenant_id
       and project_id = v_budget.project_id
       and status = 'approved';

    update public.project_budgets
       set status = 'approved',
           updated_at = pg_catalog.clock_timestamp()
     where id = v_budget.id;
  end if;

  return query
  select budget.id, budget.status
  from public.project_budgets budget
  where budget.id = v_budget.id;
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
declare
  v_budget public.project_budgets%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Project Budget rejection reason is required'
      using errcode = '22023';
  end if;
  select budget.*
    into v_budget
    from public.project_budgets budget
   where budget.id = p_budget_id
   for update;
  if not found then
    raise exception 'Project Budget not found'
      using errcode = 'P0002';
  end if;
  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;
  if v_actor_tenant is null
     or v_actor_tenant <> v_budget.tenant_id
     or v_actor_role not in ('admin', 'owner', 'finance', 'commercial') then
    raise exception 'Actor cannot reject this Project Budget'
      using errcode = '42501';
  end if;
  if v_budget.status <> 'pending_approval' then
    raise exception 'Only a submitted Project Budget can be rejected'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config(
    'app.project_budget_write',
    v_budget.id::text,
    true
  );
  update public.project_budgets
     set status = 'rejected',
         rejected_by = p_actor_id,
         rejected_at = pg_catalog.clock_timestamp(),
         rejection_reason = btrim(p_reason),
         updated_at = pg_catalog.clock_timestamp()
   where id = v_budget.id;

  return query
  select v_budget.id, 'rejected'::public.project_budget_status;
end
$$;

create or replace function public.create_project_budget_revision(
  p_budget_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns table (
  budget_id uuid,
  revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prior public.project_budgets%rowtype;
  v_actor_tenant uuid;
  v_actor_role text;
  v_revision integer;
  v_new_id uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Project Budget revision reason is required'
      using errcode = '22023';
  end if;
  select budget.*
    into v_prior
    from public.project_budgets budget
   where budget.id = p_budget_id;
  if not found or v_prior.status <> 'approved' then
    raise exception 'Only the approved Project Budget can be revised'
      using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_prior.tenant_id::text || ':' || v_prior.project_id::text,
      0
    )
  );
  select budget.*
    into v_prior
    from public.project_budgets budget
   where budget.id = p_budget_id
   for update;
  if not found or v_prior.status <> 'approved' then
    raise exception 'Only the approved Project Budget can be revised'
      using errcode = '23514';
  end if;
  select app_user.tenant_id, app_user.role::text
    into v_actor_tenant, v_actor_role
    from public.users app_user
   where app_user.id = p_actor_id;
  if v_actor_tenant is null
     or v_actor_tenant <> v_prior.tenant_id
     or v_actor_role not in (
       'admin',
       'owner',
       'finance',
       'commercial',
       'sd_pm_pe',
       'pm',
       'estimator'
     ) then
    raise exception 'Actor cannot revise this Project Budget'
      using errcode = '42501';
  end if;

  perform 1
  from public.project_budgets budget
  where budget.tenant_id = v_prior.tenant_id
    and budget.project_id = v_prior.project_id
  order by budget.revision
  for update;
  select coalesce(max(budget.revision), 0) + 1
    into v_revision
    from public.project_budgets budget
   where budget.tenant_id = v_prior.tenant_id
     and budget.project_id = v_prior.project_id;

  insert into public.project_budgets (
    tenant_id,
    project_id,
    source_bom_id,
    supersedes_budget_id,
    revision,
    status,
    control_mode,
    commitment_tolerance_bps,
    currency,
    effective_from,
    revision_reason,
    total_budget_cents,
    created_by
  )
  values (
    v_prior.tenant_id,
    v_prior.project_id,
    v_prior.source_bom_id,
    v_prior.id,
    v_revision,
    'draft',
    v_prior.control_mode,
    v_prior.commitment_tolerance_bps,
    v_prior.currency,
    current_date,
    btrim(p_reason),
    0,
    p_actor_id
  )
  returning id into v_new_id;

  insert into public.project_budget_lines (
    tenant_id,
    project_budget_id,
    cost_code_id,
    bom_line_item_id,
    line_number,
    description,
    amount_cents
  )
  select
    line.tenant_id,
    v_new_id,
    line.cost_code_id,
    line.bom_line_item_id,
    line.line_number,
    line.description,
    line.amount_cents
  from public.project_budget_lines line
  where line.project_budget_id = v_prior.id
    and line.tenant_id = v_prior.tenant_id
  order by line.line_number;

  return query
  select v_new_id, v_revision;
end
$$;

create or replace function public.enforce_project_budget_commitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget public.project_budgets%rowtype;
  v_current record;
  v_budget_amount bigint;
  v_other_committed bigint;
  v_limit bigint;
begin
  if new.status::text not in (
       'issued',
       'confirmed',
       'partial_delivery',
       'partial_delivered',
       'delivered',
       'fully_delivered'
     )
     or old.status::text in (
       'issued',
       'confirmed',
       'partial_delivery',
       'partial_delivered',
       'delivered',
       'fully_delivered'
     ) then
    return new;
  end if;

  select budget.*
    into v_budget
    from public.project_budgets budget
   where budget.tenant_id = new.tenant_id
     and budget.project_id = new.project_id
     and budget.status = 'approved'
   for update;
  if not found or v_budget.control_mode <> 'block' then
    return new;
  end if;

  if exists (
    select 1
    from public.po_line_items line
    where line.po_id = new.id
      and line.tenant_id = new.tenant_id
      and line.cost_code_id is null
  ) then
    raise exception 'Blocked budget requires a Cost Code on every PO line'
      using errcode = '23514';
  end if;

  for v_current in
    select line.cost_code_id, sum(line.line_total_cents)::bigint as amount
    from public.po_line_items line
    where line.po_id = new.id
      and line.tenant_id = new.tenant_id
    group by line.cost_code_id
    order by line.cost_code_id
  loop
    select budget_line.amount_cents
      into v_budget_amount
      from public.project_budget_lines budget_line
     where budget_line.project_budget_id = v_budget.id
       and budget_line.tenant_id = v_budget.tenant_id
       and budget_line.cost_code_id = v_current.cost_code_id;
    if v_budget_amount is null then
      raise exception 'Blocked budget does not contain PO Cost Code'
        using errcode = '23514';
    end if;

    select coalesce(sum(line.line_total_cents), 0)::bigint
      into v_other_committed
      from public.po_line_items line
      join public.purchase_orders purchase_order
        on purchase_order.id = line.po_id
       and purchase_order.tenant_id = line.tenant_id
     where line.tenant_id = new.tenant_id
       and line.cost_code_id = v_current.cost_code_id
       and purchase_order.project_id = new.project_id
       and purchase_order.id <> new.id
       and purchase_order.status::text in (
         'confirmed',
         'issued',
         'partial_delivery',
         'partial_delivered',
         'delivered',
         'fully_delivered'
       );

    v_limit := v_budget_amount + pg_catalog.round(
      v_budget_amount::numeric
        * v_budget.commitment_tolerance_bps::numeric
        / 10000
    )::bigint;
    if v_other_committed + v_current.amount > v_limit then
      raise exception 'Purchase Order commitment exceeds blocked Cost Code budget'
        using errcode = '23514';
    end if;
  end loop;

  return new;
end
$$;

drop trigger if exists guard_cost_code on public.cost_codes;
create trigger guard_cost_code
before insert or update or delete on public.cost_codes
for each row execute function public.guard_cost_code();

drop trigger if exists guard_project_budget on public.project_budgets;
create trigger guard_project_budget
before insert or update or delete on public.project_budgets
for each row execute function public.guard_project_budget();

drop trigger if exists guard_project_budget_line
  on public.project_budget_lines;
create trigger guard_project_budget_line
before insert or update or delete on public.project_budget_lines
for each row execute function public.guard_project_budget_line();

drop trigger if exists refresh_project_budget_total
  on public.project_budget_lines;
create trigger refresh_project_budget_total
after insert or update or delete on public.project_budget_lines
for each row execute function public.refresh_project_budget_total();

drop trigger if exists guard_po_line_budget_dimension
  on public.po_line_items;
create trigger guard_po_line_budget_dimension
before insert or update or delete on public.po_line_items
for each row execute function public.guard_po_line_budget_dimension();

drop trigger if exists guard_supplier_bill_cost_dimension
  on public.supplier_bill_lines;
create trigger guard_supplier_bill_cost_dimension
before insert or update on public.supplier_bill_lines
for each row execute function public.guard_supplier_bill_cost_dimension();

drop trigger if exists guard_cost_entry_dimension
  on public.cost_entries;
create trigger guard_cost_entry_dimension
before insert or update on public.cost_entries
for each row execute function public.guard_cost_entry_dimension();

drop trigger if exists enforce_project_budget_commitment
  on public.purchase_orders;
create trigger enforce_project_budget_commitment
before update of status on public.purchase_orders
for each row execute function public.enforce_project_budget_commitment();

drop trigger if exists audit_cost_codes on public.cost_codes;
create trigger audit_cost_codes
after insert or update or delete on public.cost_codes
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_project_budgets on public.project_budgets;
create trigger audit_project_budgets
after insert or update or delete on public.project_budgets
for each row execute function public.audit_log_trigger();

drop trigger if exists audit_project_budget_lines
  on public.project_budget_lines;
create trigger audit_project_budget_lines
after insert or update or delete on public.project_budget_lines
for each row execute function public.audit_log_trigger();

drop trigger if exists cortex_mirror_budget_cost_code
  on public.cost_codes;
create trigger cortex_mirror_budget_cost_code
after insert or update or delete on public.cost_codes
for each row execute function public.cortex_mirror_generic(
  'cost_code',
  'name',
  'category'
);

drop trigger if exists cortex_mirror_project_budget
  on public.project_budgets;
create trigger cortex_mirror_project_budget
after insert or update or delete on public.project_budgets
for each row execute function public.cortex_mirror_generic(
  'project_budget',
  'revision_reason',
  'status'
);

alter table public.cost_codes enable row level security;
alter table public.cost_codes force row level security;
alter table public.project_budgets enable row level security;
alter table public.project_budgets force row level security;
alter table public.project_budget_lines enable row level security;
alter table public.project_budget_lines force row level security;

create policy cost_codes_budget_read
on public.cost_codes for select to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_budgets()
);
create policy cost_codes_budget_insert
on public.cost_codes for insert to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and public.auth_can_manage_budgets()
);
create policy cost_codes_budget_update
on public.cost_codes for update to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_budgets()
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_budgets()
);
create policy cost_codes_budget_delete
on public.cost_codes for delete to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_budgets()
);

create policy project_budgets_budget_read
on public.project_budgets for select to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_budgets()
);
create policy project_budgets_budget_insert
on public.project_budgets for insert to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and created_by = (select auth.uid())
  and status = 'draft'
  and public.auth_can_manage_budgets()
);
create policy project_budgets_budget_update
on public.project_budgets for update to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_budgets()
)
with check (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_budgets()
);
create policy project_budgets_budget_delete
on public.project_budgets for delete to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and status = 'draft'
  and public.auth_can_manage_budgets()
);

create policy project_budget_lines_budget_read
on public.project_budget_lines for select to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_read_budgets()
);
create policy project_budget_lines_budget_insert
on public.project_budget_lines for insert to authenticated
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_budgets()
  and exists (
    select 1
    from public.project_budgets budget
    where budget.id = project_budget_lines.project_budget_id
      and budget.tenant_id = project_budget_lines.tenant_id
      and budget.status = 'draft'
  )
);
create policy project_budget_lines_budget_update
on public.project_budget_lines for update to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_budgets()
  and exists (
    select 1
    from public.project_budgets budget
    where budget.id = project_budget_lines.project_budget_id
      and budget.tenant_id = project_budget_lines.tenant_id
      and budget.status = 'draft'
  )
)
with check (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_budgets()
  and exists (
    select 1
    from public.project_budgets budget
    where budget.id = project_budget_lines.project_budget_id
      and budget.tenant_id = project_budget_lines.tenant_id
      and budget.status = 'draft'
  )
);
create policy project_budget_lines_budget_delete
on public.project_budget_lines for delete to authenticated
using (
  tenant_id = public.auth_tenant_id()
  and public.auth_can_manage_budgets()
  and exists (
    select 1
    from public.project_budgets budget
    where budget.id = project_budget_lines.project_budget_id
      and budget.tenant_id = project_budget_lines.tenant_id
      and budget.status = 'draft'
  )
);

revoke all privileges on table public.cost_codes
  from public, anon, authenticated;
revoke all privileges on table public.project_budgets
  from public, anon, authenticated;
revoke all privileges on table public.project_budget_lines
  from public, anon, authenticated;

grant select, delete on table public.cost_codes to authenticated;
grant insert (
  tenant_id,
  parent_id,
  code,
  name,
  category,
  is_active,
  created_by
) on table public.cost_codes to authenticated;
grant update (
  parent_id,
  code,
  name,
  category,
  is_active,
  updated_at
) on table public.cost_codes to authenticated;

grant select, delete on table public.project_budgets to authenticated;
grant insert (
  tenant_id,
  project_id,
  source_bom_id,
  supersedes_budget_id,
  revision,
  status,
  control_mode,
  commitment_tolerance_bps,
  currency,
  effective_from,
  revision_reason,
  created_by
) on table public.project_budgets to authenticated;
grant update (
  source_bom_id,
  control_mode,
  commitment_tolerance_bps,
  currency,
  effective_from,
  revision_reason,
  updated_at
) on table public.project_budgets to authenticated;

grant select, delete on table public.project_budget_lines
  to authenticated;
grant insert (
  tenant_id,
  project_budget_id,
  cost_code_id,
  bom_line_item_id,
  line_number,
  description,
  amount_cents
) on table public.project_budget_lines to authenticated;
grant update (
  cost_code_id,
  bom_line_item_id,
  line_number,
  description,
  amount_cents,
  updated_at
) on table public.project_budget_lines to authenticated;

grant insert (bom_line_item_id, cost_code_id)
  on table public.po_line_items to authenticated;
grant update (bom_line_item_id, cost_code_id)
  on table public.po_line_items to authenticated;
grant insert (cost_code_id)
  on table public.supplier_bill_lines to authenticated;
grant update (cost_code_id)
  on table public.supplier_bill_lines to authenticated;
grant insert (cost_code_id)
  on table public.cost_entries to authenticated;
grant update (cost_code_id)
  on table public.cost_entries to authenticated;

grant all privileges on table public.cost_codes to service_role;
grant all privileges on table public.project_budgets to service_role;
grant all privileges on table public.project_budget_lines to service_role;

revoke execute on function public.auth_can_read_budgets()
  from public, anon;
revoke execute on function public.auth_can_manage_budgets()
  from public, anon;
grant execute on function public.auth_can_read_budgets()
  to authenticated, service_role;
grant execute on function public.auth_can_manage_budgets()
  to authenticated, service_role;

revoke execute on function public.guard_cost_code()
  from public, anon, authenticated;
revoke execute on function public.guard_project_budget()
  from public, anon, authenticated;
revoke execute on function public.guard_project_budget_line()
  from public, anon, authenticated;
revoke execute on function public.refresh_project_budget_total()
  from public, anon, authenticated;
revoke execute on function public.guard_po_line_budget_dimension()
  from public, anon, authenticated;
revoke execute on function public.guard_supplier_bill_cost_dimension()
  from public, anon, authenticated;
revoke execute on function public.guard_cost_entry_dimension()
  from public, anon, authenticated;
revoke execute on function public.enforce_project_budget_commitment()
  from public, anon, authenticated;
revoke execute on function public.submit_project_budget(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.review_project_budget(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.reject_project_budget(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.create_project_budget_revision(
  uuid,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.guard_cost_code() to service_role;
grant execute on function public.guard_project_budget() to service_role;
grant execute on function public.guard_project_budget_line()
  to service_role;
grant execute on function public.refresh_project_budget_total()
  to service_role;
grant execute on function public.guard_po_line_budget_dimension()
  to service_role;
grant execute on function public.guard_supplier_bill_cost_dimension()
  to service_role;
grant execute on function public.guard_cost_entry_dimension()
  to service_role;
grant execute on function public.enforce_project_budget_commitment()
  to service_role;
grant execute on function public.submit_project_budget(uuid, uuid)
  to service_role;
grant execute on function public.review_project_budget(uuid, uuid, text)
  to service_role;
grant execute on function public.reject_project_budget(uuid, uuid, text)
  to service_role;
grant execute on function public.create_project_budget_revision(
  uuid,
  uuid,
  text
) to service_role;
