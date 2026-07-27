-- Cortex live graph — execution core: boms (Quanto), purchase_orders + invoices
-- (Forge/Ledger), daily_tasks (Crew).
create or replace function cortex_mirror_bom() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_proj uuid; v_opp uuid; v_user uuid; v_appr uuid; v_tenant uuid;
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'boms', OLD.id, auth.uid(), 'boms:delete');
      return OLD;
    end if;
    v_tenant := NEW.tenant_id;
    v_node := cortex_upsert_node(
      v_tenant, 'bom', 'boms', NEW.id,
      coalesce(NEW.label, 'BOM v' || coalesce(NEW.version::text, '1')),
      'Status: ' || coalesce(NEW.status::text, '') || ' · TCV(cents): ' || coalesce(NEW.tcv_cents::text, '0'),
      jsonb_build_object('status', NEW.status, 'version', NEW.version, 'total_cost_cents', NEW.total_cost_cents,
                         'tcv_cents', NEW.tcv_cents, 'gp_cents', NEW.gp_cents, 'gp_margin_bps', NEW.gp_margin_bps,
                         'project_id', NEW.project_id, 'opportunity_id', NEW.opportunity_id),
      auth.uid(), 'boms:' || lower(tg_op)
    );
    v_proj := cortex_node_current(v_tenant, 'projects', NEW.project_id);
    perform cortex_upsert_edge(v_tenant, v_node, v_proj, 'part_of', 'canonical', 1, auth.uid());
    if NEW.opportunity_id is not null then
      v_opp := cortex_node_current(v_tenant, 'opportunities', NEW.opportunity_id);
      perform cortex_upsert_edge(v_tenant, v_node, v_opp, 'derived_from', 'canonical', 1, auth.uid());
    end if;
    if NEW.created_by is not null then
      v_user := cortex_node_current(v_tenant, 'users', NEW.created_by);
      perform cortex_upsert_edge(v_tenant, v_user, v_node, 'owns', 'canonical', 1, auth.uid());
    end if;
    if NEW.approved_by is not null then
      v_appr := cortex_node_current(v_tenant, 'users', NEW.approved_by);
      perform cortex_upsert_edge(v_tenant, v_appr, v_node, 'approved_by', 'canonical', 1, auth.uid());
    end if;
  exception when others then
    raise warning 'cortex_mirror_bom failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

create or replace function cortex_mirror_purchase_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_proj uuid; v_user uuid; v_tenant uuid;
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'purchase_orders', OLD.id, auth.uid(), 'purchase_orders:delete');
      return OLD;
    end if;
    v_tenant := NEW.tenant_id;
    v_node := cortex_upsert_node(
      v_tenant, 'purchase_order', 'purchase_orders', NEW.id, NEW.po_number,
      'Status: ' || coalesce(NEW.status::text, '') || ' · Total(cents): ' || coalesce(NEW.total_cents::text, '0'),
      jsonb_build_object('status', NEW.status, 'po_number', NEW.po_number, 'subtotal_cents', NEW.subtotal_cents,
                         'vat_cents', NEW.vat_cents, 'withholding_tax_cents', NEW.withholding_tax_cents,
                         'total_cents', NEW.total_cents, 'project_id', NEW.project_id, 'vendor_id', NEW.vendor_id),
      auth.uid(), 'purchase_orders:' || lower(tg_op)
    );
    v_proj := cortex_node_current(v_tenant, 'projects', NEW.project_id);
    perform cortex_upsert_edge(v_tenant, v_node, v_proj, 'part_of', 'canonical', 1, auth.uid());
    if NEW.created_by is not null then
      v_user := cortex_node_current(v_tenant, 'users', NEW.created_by);
      perform cortex_upsert_edge(v_tenant, v_user, v_node, 'owns', 'canonical', 1, auth.uid());
    end if;
  exception when others then
    raise warning 'cortex_mirror_purchase_order failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

create or replace function cortex_mirror_invoice() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_proj uuid; v_user uuid; v_tenant uuid;
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'invoices', OLD.id, auth.uid(), 'invoices:delete');
      return OLD;
    end if;
    v_tenant := NEW.tenant_id;
    v_node := cortex_upsert_node(
      v_tenant, 'invoice', 'invoices', NEW.id, NEW.invoice_number,
      'Status: ' || coalesce(NEW.status::text, '') || ' · Net(cents): ' || coalesce(NEW.net_amount_cents::text, '0'),
      jsonb_build_object('status', NEW.status, 'invoice_number', NEW.invoice_number,
                         'billing_percent_bps', NEW.billing_percent_bps, 'retention_bps', NEW.retention_bps,
                         'subtotal_cents', NEW.subtotal_cents, 'retention_cents', NEW.retention_cents,
                         'vat_cents', NEW.vat_cents, 'withholding_tax_cents', NEW.withholding_tax_cents,
                         'net_amount_cents', NEW.net_amount_cents, 'project_id', NEW.project_id),
      auth.uid(), 'invoices:' || lower(tg_op)
    );
    v_proj := cortex_node_current(v_tenant, 'projects', NEW.project_id);
    perform cortex_upsert_edge(v_tenant, v_node, v_proj, 'bills', 'canonical', 1, auth.uid());
    if NEW.created_by is not null then
      v_user := cortex_node_current(v_tenant, 'users', NEW.created_by);
      perform cortex_upsert_edge(v_tenant, v_user, v_node, 'owns', 'canonical', 1, auth.uid());
    end if;
  exception when others then
    raise warning 'cortex_mirror_invoice failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

create or replace function cortex_mirror_daily_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_proj uuid; v_user uuid; v_tenant uuid;
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'daily_tasks', OLD.id, auth.uid(), 'daily_tasks:delete');
      return OLD;
    end if;
    v_tenant := NEW.tenant_id;
    v_node := cortex_upsert_node(
      v_tenant, 'task', 'daily_tasks', NEW.id, NEW.title,
      'Status: ' || coalesce(NEW.status::text, '') || ' · Role: ' || coalesce(NEW.role, ''),
      jsonb_build_object('status', NEW.status, 'role', NEW.role, 'due_date', NEW.due_date,
                         'project_id', NEW.project_id, 'assignee_id', NEW.assignee_id),
      auth.uid(), 'daily_tasks:' || lower(tg_op)
    );
    v_proj := cortex_node_current(v_tenant, 'projects', NEW.project_id);
    perform cortex_upsert_edge(v_tenant, v_node, v_proj, 'part_of', 'canonical', 1, auth.uid());
    if NEW.assignee_id is not null then
      v_user := cortex_node_current(v_tenant, 'users', NEW.assignee_id);
      perform cortex_upsert_edge(v_tenant, v_user, v_node, 'assigned_to', 'canonical', 1, auth.uid());
    end if;
  exception when others then
    raise warning 'cortex_mirror_daily_task failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists cortex_mirror_boms on boms;
create trigger cortex_mirror_boms after insert or update or delete on boms
  for each row execute function cortex_mirror_bom();
drop trigger if exists cortex_mirror_purchase_orders on purchase_orders;
create trigger cortex_mirror_purchase_orders after insert or update or delete on purchase_orders
  for each row execute function cortex_mirror_purchase_order();
drop trigger if exists cortex_mirror_invoices on invoices;
create trigger cortex_mirror_invoices after insert or update or delete on invoices
  for each row execute function cortex_mirror_invoice();
drop trigger if exists cortex_mirror_daily_tasks on daily_tasks;
create trigger cortex_mirror_daily_tasks after insert or update or delete on daily_tasks
  for each row execute function cortex_mirror_daily_task();

-- Backfill (idempotent).
do $$ declare r record; v_node uuid; v_proj uuid; v_opp uuid; v_user uuid; v_appr uuid; begin
  for r in select id, tenant_id, label, version, status, total_cost_cents, tcv_cents, gp_cents, gp_margin_bps, project_id, opportunity_id, created_by, approved_by from boms loop
    v_node := cortex_upsert_node(r.tenant_id, 'bom', 'boms', r.id,
      coalesce(r.label, 'BOM v' || coalesce(r.version::text,'1')),
      'Status: ' || coalesce(r.status::text,'') || ' · TCV(cents): ' || coalesce(r.tcv_cents::text,'0'),
      jsonb_build_object('status', r.status, 'version', r.version, 'tcv_cents', r.tcv_cents, 'gp_cents', r.gp_cents,
                         'project_id', r.project_id, 'opportunity_id', r.opportunity_id), null, 'backfill:boms');
    v_proj := cortex_node_current(r.tenant_id,'projects',r.project_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_proj,'part_of','canonical',1,null);
    if r.opportunity_id is not null then v_opp := cortex_node_current(r.tenant_id,'opportunities',r.opportunity_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_opp,'derived_from','canonical',1,null); end if;
    if r.created_by is not null then v_user := cortex_node_current(r.tenant_id,'users',r.created_by); perform cortex_upsert_edge(r.tenant_id, v_user, v_node,'owns','canonical',1,null); end if;
    if r.approved_by is not null then v_appr := cortex_node_current(r.tenant_id,'users',r.approved_by); perform cortex_upsert_edge(r.tenant_id, v_appr, v_node,'approved_by','canonical',1,null); end if;
  end loop;
end $$;

do $$ declare r record; v_node uuid; v_proj uuid; v_user uuid; begin
  for r in select id, tenant_id, po_number, status, subtotal_cents, vat_cents, withholding_tax_cents, total_cents, project_id, vendor_id, created_by from purchase_orders loop
    v_node := cortex_upsert_node(r.tenant_id, 'purchase_order', 'purchase_orders', r.id, r.po_number,
      'Status: ' || coalesce(r.status::text,'') || ' · Total(cents): ' || coalesce(r.total_cents::text,'0'),
      jsonb_build_object('status', r.status, 'po_number', r.po_number, 'total_cents', r.total_cents,
                         'project_id', r.project_id, 'vendor_id', r.vendor_id), null, 'backfill:purchase_orders');
    v_proj := cortex_node_current(r.tenant_id,'projects',r.project_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_proj,'part_of','canonical',1,null);
    if r.created_by is not null then v_user := cortex_node_current(r.tenant_id,'users',r.created_by); perform cortex_upsert_edge(r.tenant_id, v_user, v_node,'owns','canonical',1,null); end if;
  end loop;
end $$;

do $$ declare r record; v_node uuid; v_proj uuid; v_user uuid; begin
  for r in select id, tenant_id, invoice_number, status, net_amount_cents, billing_percent_bps, retention_bps, retention_cents, project_id, created_by from invoices loop
    v_node := cortex_upsert_node(r.tenant_id, 'invoice', 'invoices', r.id, r.invoice_number,
      'Status: ' || coalesce(r.status::text,'') || ' · Net(cents): ' || coalesce(r.net_amount_cents::text,'0'),
      jsonb_build_object('status', r.status, 'invoice_number', r.invoice_number, 'net_amount_cents', r.net_amount_cents,
                         'retention_cents', r.retention_cents, 'project_id', r.project_id), null, 'backfill:invoices');
    v_proj := cortex_node_current(r.tenant_id,'projects',r.project_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_proj,'bills','canonical',1,null);
    if r.created_by is not null then v_user := cortex_node_current(r.tenant_id,'users',r.created_by); perform cortex_upsert_edge(r.tenant_id, v_user, v_node,'owns','canonical',1,null); end if;
  end loop;
end $$;

do $$ declare r record; v_node uuid; v_proj uuid; v_user uuid; begin
  for r in select id, tenant_id, title, status, role, due_date, project_id, assignee_id from daily_tasks loop
    v_node := cortex_upsert_node(r.tenant_id, 'task', 'daily_tasks', r.id, r.title,
      'Status: ' || coalesce(r.status::text,'') || ' · Role: ' || coalesce(r.role,''),
      jsonb_build_object('status', r.status, 'role', r.role, 'project_id', r.project_id, 'assignee_id', r.assignee_id),
      null, 'backfill:daily_tasks');
    v_proj := cortex_node_current(r.tenant_id,'projects',r.project_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_proj,'part_of','canonical',1,null);
    if r.assignee_id is not null then v_user := cortex_node_current(r.tenant_id,'users',r.assignee_id); perform cortex_upsert_edge(r.tenant_id, v_user, v_node,'assigned_to','canonical',1,null); end if;
  end loop;
end $$;

-- Re-lock the RPC surface for the new SECURITY DEFINER functions.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'cortex\_%'
  loop execute format('revoke execute on function %s from anon, authenticated, public', f.sig); end loop;
end $$;;
