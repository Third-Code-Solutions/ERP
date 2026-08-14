-- WO-15: bind PO commitment to the approved budget line and BOM grain.
--
-- The existing PO approval timeline and PH tax calculation are intentionally
-- unchanged. This replaces only the budget-control trigger function so a
-- controlled budget cannot be committed by cost code alone: every PO line
-- must resolve to the approved budget line for the same BOM line and cost
-- code. No ABI Delegation-of-Approval rows are seeded here; O-03 remains a
-- source-blocked configuration input.

begin;

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

  -- Controlled commitments must retain the full budget lineage. A cost code
  -- without its BOM grain is not sufficient to identify the allowable.
  if exists (
    select 1
      from public.po_line_items line
      left join public.project_budget_lines budget_line
        on budget_line.tenant_id = line.tenant_id
       and budget_line.project_budget_id = v_budget.id
       and budget_line.bom_line_item_id = line.bom_line_item_id
       and budget_line.cost_code_id = line.cost_code_id
     where line.po_id = new.id
       and line.tenant_id = new.tenant_id
       and (
         line.bom_line_item_id is null
         or line.cost_code_id is null
         or budget_line.id is null
       )
  ) then
    raise exception
      'Blocked budget requires a PO line joined to an approved budget line by bom_line_item_id and Cost Code'
      using errcode = '23514';
  end if;

  for v_current in
    select
      line.cost_code_id,
      line.bom_line_item_id,
      sum(line.line_total_cents)::bigint as amount
    from public.po_line_items line
    where line.po_id = new.id
      and line.tenant_id = new.tenant_id
    group by line.cost_code_id, line.bom_line_item_id
    order by line.cost_code_id, line.bom_line_item_id
  loop
    select budget_line.amount_cents
      into v_budget_amount
      from public.project_budget_lines budget_line
     where budget_line.project_budget_id = v_budget.id
       and budget_line.tenant_id = v_budget.tenant_id
       and budget_line.cost_code_id = v_current.cost_code_id
       and budget_line.bom_line_item_id = v_current.bom_line_item_id;
    if v_budget_amount is null then
      raise exception
        'Blocked budget does not contain PO BOM line budget evidence'
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
       and line.bom_line_item_id = v_current.bom_line_item_id
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
      raise exception 'Purchase Order commitment exceeds approved budget line allowable'
        using errcode = '23514';
    end if;
  end loop;

  return new;
end
$$;

commit;
