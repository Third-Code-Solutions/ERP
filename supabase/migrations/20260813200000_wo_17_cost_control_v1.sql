-- WO-17 — Cost control v1.
--
-- Posted supplier-bill lines are actual execution cost. They are allocations
-- against PO lines, so persist the BOM-line dimension at the bill boundary and
-- make the database maintain that lineage. This keeps budget, commitment, and
-- invoiced actuals comparable without adding an invoiced PO to the forecast a
-- second time.

alter table public.supplier_bill_lines
  add column if not exists bom_line_item_id uuid;

update public.supplier_bill_lines bill_line
   set bom_line_item_id = po_line.bom_line_item_id
  from public.po_line_items po_line
 where po_line.id = bill_line.po_line_item_id
   and po_line.tenant_id = bill_line.tenant_id
   and bill_line.bom_line_item_id is distinct from po_line.bom_line_item_id;

create index if not exists idx_supplier_bill_lines_bom_line
  on public.supplier_bill_lines (tenant_id, bom_line_item_id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'supplier_bill_lines_bom_line_tenant_fk'
       and conrelid = 'public.supplier_bill_lines'::regclass
  ) then
    alter table public.supplier_bill_lines
      add constraint supplier_bill_lines_bom_line_tenant_fk
      foreign key (tenant_id, bom_line_item_id)
      references public.bom_line_items (tenant_id, id)
      on delete restrict;
  end if;
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
  v_po_bom_line_item_id uuid;
begin
  if new.po_line_item_id is null then
    raise exception 'Supplier Bill line requires Purchase Order Cost Code evidence'
      using errcode = '23514';
  end if;

  select po_line.cost_code_id, po_line.bom_line_item_id
    into v_po_cost_code_id, v_po_bom_line_item_id
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

  if new.bom_line_item_id is null then
    new.bom_line_item_id := v_po_bom_line_item_id;
  elsif new.bom_line_item_id is distinct from v_po_bom_line_item_id then
    raise exception 'Supplier Bill BOM line must match Purchase Order line'
      using errcode = '23514';
  end if;

  return new;
end
$$;

comment on column public.supplier_bill_lines.bom_line_item_id is
  'BOM line consumed by this posted supplier-bill allocation; maintained from the PO line.';
