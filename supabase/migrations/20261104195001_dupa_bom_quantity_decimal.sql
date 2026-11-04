-- D-5 (switch): DUPA BOQ amounts use the exact numeric(18,4) quantity.
--
-- recompute_dupa_totals() wrote line_total_cents from the integer
-- bom_line_items.quantity. 20261104110600 added quantity_decimal; this
-- replaces the function so the BOQ amount is round(H x quantity_decimal),
-- half-up (PostgreSQL round(numeric) for non-negative values), matching
-- deriveBoqLineAmount in packages/shared-types/src/bom/dupa.ts. The body is
-- otherwise the 20260812180000_wo_06_dupa_engine definition. Existing rows
-- hold whole quantities, so no persisted amount changes.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.recompute_dupa_totals(target_dupa_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dupa public.dupas%rowtype;
  v_material numeric(38,12);
  v_labour numeric(38,12);
  v_equipment numeric(38,12);
  v_direct numeric(38,12);
  v_indirect numeric(38,12);
  v_vat numeric(38,12);
  v_total numeric(38,12);
  v_vat_base numeric(38,12);
  v_unit_rate bigint;
begin
  select * into v_dupa from public.dupas where id = target_dupa_id for update;
  if not found then
    return;
  end if;

  select coalesce(sum((line.quantity * line.unit_rate_centavos)::numeric(38,12)), 0::numeric(38,12))
    into v_material
    from public.dupa_material_lines line
   where line.tenant_id = v_dupa.tenant_id
     and line.dupa_id = v_dupa.id;

  select coalesce(sum((line.no_of_persons * line.hourly_rate_centavos / line.productivity_per_hour)::numeric(38,12)), 0::numeric(38,12))
    into v_labour
    from public.dupa_labour_lines line
   where line.tenant_id = v_dupa.tenant_id
     and line.dupa_id = v_dupa.id;

  select coalesce(sum((line.no_of_units * line.hourly_rate_centavos / line.productivity_per_hour)::numeric(38,12)), 0::numeric(38,12))
    into v_equipment
    from public.dupa_equipment_lines line
   where line.tenant_id = v_dupa.tenant_id
     and line.dupa_id = v_dupa.id;

  v_direct := (v_material + v_labour + v_equipment)::numeric(38,12);
  v_indirect := (v_direct * (v_dupa.ocm_bps + v_dupa.profit_bps) / 10000)::numeric(38,12);
  v_vat_base := case
    when v_dupa.vat_base = 'direct_plus_indirect' then v_direct + v_indirect
    else v_direct
  end;
  v_vat := (v_vat_base * v_dupa.vat_bps / 10000)::numeric(38,12);
  v_total := (v_direct + v_indirect + v_vat)::numeric(38,12);
  v_unit_rate := round(v_total / v_dupa.header_quantity)::bigint;

  update public.dupas
     set direct_cost_centavos = round(v_direct)::bigint,
         indirect_cost_centavos = round(v_indirect)::bigint,
         vat_centavos = round(v_vat)::bigint,
         total_cost_centavos = round(v_total)::bigint,
         unit_rate_centavos = v_unit_rate,
         computed_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where id = v_dupa.id
     and tenant_id = v_dupa.tenant_id;

  -- Existing downstream identity stays intact. BOQ amount derives from H,
  -- with legacy line-level markup removed when DUPA owns the rate.
  -- D-5: amount = half-up round(H x quantity_decimal), the exact quantity.
  update public.bom_line_items
     set unit_rate_source = 'dupa',
         unit_cost_cents = v_unit_rate,
         markup_bps = 0,
         line_total_cents = round(v_unit_rate::numeric * quantity_decimal)::bigint,
         updated_at = clock_timestamp()
   where tenant_id = v_dupa.tenant_id
     and id = v_dupa.bom_line_item_id;
end
$$;

-- Preserve the existing function privileges; callers reach it through triggers.
revoke execute on function public.recompute_dupa_totals(uuid) from public, anon, authenticated;
grant execute on function public.recompute_dupa_totals(uuid) to service_role;

commit;
