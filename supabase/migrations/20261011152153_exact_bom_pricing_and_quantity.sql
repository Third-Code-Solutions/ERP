-- ADR-041. Preserve signed/posted snapshots; only draft BOMs are reconciled.
-- Recovery: retain widened precision and roll forward. Never narrow quantities.
-- Untypmodded numeric plus a scale check rejects excess precision rather than
-- PostgreSQL rounding it before a trigger can inspect the submitted value.
alter table public.bom_line_items alter column quantity type numeric using quantity::numeric;
alter table public.bom_line_items
  add column direct_cost_cents bigint not null default 0,
  add column selling_ex_vat_cents bigint not null default 0,
  add column vat_cents bigint not null default 0,
  add column manual_vat_bps integer not null default 1200 check (manual_vat_bps between 0 and 10000),
  add constraint bom_quantity_exact_range check (quantity >= 0 and quantity <= 2147483647 and quantity=trunc(quantity,4));
alter table public.boms
  add column selling_ex_vat_cents bigint not null default 0,
  add column vat_cents bigint not null default 0,
  add column pricing_basis text not null default 'legacy_unreviewed'
    check (pricing_basis in ('legacy_unreviewed', 'reconciled_v1'));
alter table public.invoices
  add column pricing_basis text not null default 'legacy_unreviewed'
    check (pricing_basis in ('legacy_unreviewed', 'reconciled_v1')),
  add column source_bom_id uuid,
  add column withholding_bps integer not null default 200 check (withholding_bps between 0 and 10000),
  add constraint invoices_source_bom_tenant_fk foreign key (tenant_id, source_bom_id) references public.boms(tenant_id,id);
create index invoices_source_bom_idx on public.invoices(tenant_id,source_bom_id);

-- Application writers lock the parent first. This guard also protects direct SQL;
-- a child-first SQL writer may be aborted by PostgreSQL deadlock detection.
create function public.lock_draft_dupa_parent() returns trigger language plpgsql
security definer set search_path = '' as $$
declare v_bom_id uuid; v_status text; v_dupa_id uuid;
begin
  if tg_table_name = 'dupas' then
    if tg_op='DELETE' and exists(select 1 from public.bom_line_items where id=old.bom_line_item_id) then
      raise exception 'Delete the draft BOM line to remove its DUPA, or replace its analysis explicitly' using errcode='23514';
    end if;
    select line.bom_id into v_bom_id from public.bom_line_items line
      where line.id = case when tg_op='DELETE' then old.bom_line_item_id else new.bom_line_item_id end;
  else
    v_dupa_id := case when tg_op='DELETE' then old.dupa_id else new.dupa_id end;
    select line.bom_id into v_bom_id from public.dupas dupa
      join public.bom_line_items line on line.id=dupa.bom_line_item_id and line.tenant_id=dupa.tenant_id
      where dupa.id=v_dupa_id;
  end if;
  if v_bom_id is not null then
    select status::text into v_status from public.boms where id=v_bom_id for update;
    if v_status is not null and v_status <> 'draft' then
      raise exception 'Revise the approved or locked BOM before changing its pricing' using errcode='23514';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.lock_draft_dupa_parent() from public, anon, authenticated;
create trigger a_lock_draft_dupa_parent before insert or update or delete on public.dupas
for each row execute function public.lock_draft_dupa_parent();
create trigger a_lock_draft_dupa_parent before insert or update or delete on public.dupa_material_lines
for each row execute function public.lock_draft_dupa_parent();
create trigger a_lock_draft_dupa_parent before insert or update or delete on public.dupa_labour_lines
for each row execute function public.lock_draft_dupa_parent();
create trigger a_lock_draft_dupa_parent before insert or update or delete on public.dupa_equipment_lines
for each row execute function public.lock_draft_dupa_parent();

create function public.price_bom_line_exact() returns trigger language plpgsql
security definer set search_path = '' as $$
declare v_status text; v_dupa public.dupas%rowtype; v_direct numeric(38,12); v_vat numeric(38,12);
begin
  select status::text into v_status from public.boms
    where id=case when tg_op='DELETE' then old.bom_id else new.bom_id end for update;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Revise the approved or locked BOM before changing its lines' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and (new.bom_id<>old.bom_id or new.tenant_id<>old.tenant_id) then
    raise exception 'BOM line ownership cannot change' using errcode='23514';
  end if;
  if new.is_group=1 then
    new.direct_cost_cents:=0; new.selling_ex_vat_cents:=0; new.vat_cents:=0; new.line_total_cents:=0;
  elsif new.unit_rate_source='dupa' then
    select * into v_dupa from public.dupas where bom_line_item_id=new.id and tenant_id=new.tenant_id;
    if not found then raise exception 'DUPA pricing requires its persisted analysis' using errcode='23514'; end if;
    select coalesce((select sum(quantity*unit_rate_centavos) from public.dupa_material_lines where dupa_id=v_dupa.id),0)
      + coalesce((select sum(no_of_persons*hourly_rate_centavos/productivity_per_hour) from public.dupa_labour_lines where dupa_id=v_dupa.id),0)
      + coalesce((select sum(no_of_units*hourly_rate_centavos/productivity_per_hour) from public.dupa_equipment_lines where dupa_id=v_dupa.id),0)
      into v_direct;
    v_vat := v_direct * case when v_dupa.vat_base='direct_plus_indirect' then 1+(v_dupa.ocm_bps+v_dupa.profit_bps)::numeric/10000 else 1 end * v_dupa.vat_bps/10000;
    new.unit_cost_cents := round(v_direct/v_dupa.header_quantity)::bigint;
    new.markup_bps:=0;
    new.direct_cost_cents:=round(v_direct/v_dupa.header_quantity*new.quantity)::bigint;
    new.line_total_cents:=round(v_dupa.unit_rate_centavos::numeric*new.quantity)::bigint;
    new.vat_cents:=round(v_vat/v_dupa.header_quantity*new.quantity)::bigint;
    new.selling_ex_vat_cents:=new.line_total_cents-new.vat_cents;
  else
    new.direct_cost_cents:=round(new.unit_cost_cents::numeric*new.quantity)::bigint;
    new.selling_ex_vat_cents:=round(new.unit_cost_cents::numeric*new.quantity*(10000+new.markup_bps)/10000)::bigint;
    new.vat_cents:=round(new.selling_ex_vat_cents::numeric*new.manual_vat_bps/10000)::bigint;
    new.line_total_cents:=new.selling_ex_vat_cents+new.vat_cents;
  end if;
  if greatest(new.direct_cost_cents,new.line_total_cents,new.vat_cents,new.selling_ex_vat_cents)>9007199254740991
    or least(new.direct_cost_cents,new.line_total_cents,new.vat_cents,new.selling_ex_vat_cents)<0 then
    raise exception 'BOM price exceeds exact centavo range' using errcode='22003';
  end if;
  return new;
end $$;
revoke all on function public.price_bom_line_exact() from public, anon, authenticated;
create trigger a_price_bom_line_exact before insert or update or delete on public.bom_line_items
for each row execute function public.price_bom_line_exact();

-- Also intercept compatibility callers that still submit their own rollups.
create function public.derive_bom_aggregates_exact() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  if old.status::text <> 'draft' then
    if (new.total_cost_cents,new.tcv_cents,new.gp_cents,new.gp_margin_bps,new.selling_ex_vat_cents,new.vat_cents,new.pricing_basis)
      is distinct from (old.total_cost_cents,old.tcv_cents,old.gp_cents,old.gp_margin_bps,old.selling_ex_vat_cents,old.vat_cents,old.pricing_basis) then
      raise exception 'Approved BOM monetary snapshots are immutable; create a revision' using errcode='23514';
    end if;
    return new;
  end if;
  select coalesce(sum(direct_cost_cents),0),coalesce(sum(selling_ex_vat_cents),0),coalesce(sum(vat_cents),0),coalesce(sum(line_total_cents),0)
    into new.total_cost_cents,new.selling_ex_vat_cents,new.vat_cents,new.tcv_cents
    from public.bom_line_items where bom_id=new.id and tenant_id=new.tenant_id and parent_line_item_id is null and is_group=0;
  new.gp_cents:=new.selling_ex_vat_cents-new.total_cost_cents;
  new.gp_margin_bps:=case when new.selling_ex_vat_cents=0 then 0 else round(new.gp_cents::numeric*10000/new.selling_ex_vat_cents)::integer end;
  new.pricing_basis:='reconciled_v1';
  if greatest(new.total_cost_cents,new.tcv_cents,new.selling_ex_vat_cents,new.vat_cents,abs(new.gp_cents))>9007199254740991 then
    raise exception 'BOM aggregate exceeds exact centavo range' using errcode='22003';
  end if;
  return new;
end $$;
revoke all on function public.derive_bom_aggregates_exact() from public, anon, authenticated;
create trigger derive_bom_aggregates_exact before update on public.boms
for each row execute function public.derive_bom_aggregates_exact();

create function public.refresh_bom_aggregates_exact() returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  update public.boms set updated_at=clock_timestamp()
    where id=case when tg_op='DELETE' then old.bom_id else new.bom_id end and status='draft';
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.refresh_bom_aggregates_exact() from public, anon, authenticated;
create trigger refresh_bom_aggregates_exact after insert or update or delete on public.bom_line_items
for each row execute function public.refresh_bom_aggregates_exact();

create or replace function public.dupa_refresh_crew_rates() returns trigger language plpgsql
security definer set search_path = '' as $$
declare v_bom uuid; v_bom_ids uuid[] := '{}';
begin
  -- Lock every parent before any child write takes the tenant audit lock.
  -- Otherwise a later parent may be held by an editor waiting on that audit lock.
  for v_bom in select bom.id from public.boms bom
    where bom.tenant_id=new.tenant_id and bom.status='draft' and exists (
      select 1 from public.dupa_labour_lines labour
      join public.dupas dupa on dupa.id=labour.dupa_id and dupa.tenant_id=labour.tenant_id
      join public.bom_line_items line on line.id=dupa.bom_line_item_id and line.tenant_id=dupa.tenant_id
      where labour.tenant_id=new.tenant_id and labour.crew_role_id=new.id and line.bom_id=bom.id
    ) order by bom.id for update
  loop
    v_bom_ids := array_append(v_bom_ids,v_bom);
  end loop;
  -- Approved analyses keep their signed rate snapshots.
  foreach v_bom in array v_bom_ids loop
    update public.dupa_labour_lines labour set hourly_rate_centavos=new.hourly_rate_centavos,updated_at=clock_timestamp()
    from public.dupas dupa,public.bom_line_items line
    where labour.dupa_id=dupa.id and line.id=dupa.bom_line_item_id and line.bom_id=v_bom
      and labour.tenant_id=new.tenant_id and labour.crew_role_id=new.id;
  end loop;
  return new;
end $$;
-- AFTER triggers run alphabetically: acquire BOM locks before audit_crew_roles.
alter trigger crew_roles_refresh_dupa_rates on public.crew_roles
  rename to a_crew_roles_refresh_dupa_rates;

create function public.guard_invoice_pricing_snapshot() returns trigger language plpgsql
set search_path = '' as $$
begin
  if old.status::text='draft' and new.status::text='issued' and new.pricing_basis<>'reconciled_v1' then
    raise exception 'Legacy invoice pricing requires an explicitly reviewed replacement draft before issue' using errcode='23514';
  end if;
  if old.status::text<>'draft' and (new.pricing_basis,new.source_bom_id,new.withholding_bps)
    is distinct from (old.pricing_basis,old.source_bom_id,old.withholding_bps) then
    raise exception 'Issued invoice pricing snapshots are immutable' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.guard_invoice_pricing_snapshot() from public, anon, authenticated;
create trigger guard_invoice_pricing_snapshot before update on public.invoices
for each row execute function public.guard_invoice_pricing_snapshot();

-- Existing approved/locked/archived BOMs and every invoice remain untouched.
update public.bom_line_items line set quantity=line.quantity from public.boms bom
where bom.id=line.bom_id and bom.tenant_id=line.tenant_id and bom.status='draft';
update public.boms set updated_at=updated_at where status='draft';
