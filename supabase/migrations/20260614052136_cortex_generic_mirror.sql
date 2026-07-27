-- Generic Cortex mirror: one trigger fn drives every business table into the
-- graph (full row → node attributes; FK-derived edges). Args:
--   [0] node_type  [1] title column ('' = fallback)  [2] summary column ('' = none)
create or replace function cortex_mirror_generic() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb; v_tenant uuid; v_id uuid; v_title text; v_summary text; v_node uuid;
  nt cortex_node_type; v_fk uuid; v_creator uuid;
begin
  begin
    nt := TG_ARGV[0]::cortex_node_type;
    if tg_op = 'DELETE' then j := to_jsonb(OLD); else j := to_jsonb(NEW); end if;
    v_tenant := nullif(j->>'tenant_id','')::uuid;
    v_id := nullif(j->>'id','')::uuid;
    if v_tenant is null or v_id is null then return coalesce(NEW, OLD); end if;

    if tg_op = 'DELETE' then
      perform cortex_close_node(v_tenant, TG_TABLE_NAME, v_id, auth.uid(), TG_TABLE_NAME || ':delete');
      return OLD;
    end if;

    if TG_ARGV[1] <> '' and nullif(j->>TG_ARGV[1],'') is not null then
      v_title := j->>TG_ARGV[1];
    else
      v_title := initcap(replace(TG_ARGV[0], '_', ' ')) || ' ' || left(v_id::text, 8);
    end if;

    if TG_ARGV[2] <> '' and nullif(j->>TG_ARGV[2],'') is not null then
      v_summary := initcap(replace(TG_ARGV[2], '_', ' ')) || ': ' || (j->>TG_ARGV[2]);
    else
      v_summary := null;
    end if;

    v_node := cortex_upsert_node(
      v_tenant, nt, TG_TABLE_NAME, v_id, v_title, v_summary, j, auth.uid(),
      TG_TABLE_NAME || ':' || lower(tg_op)
    );

    -- FK-derived edges (each guarded by presence; missing endpoint → no-op)
    v_fk := nullif(j->>'project_id','')::uuid;
    if v_fk is not null then perform cortex_upsert_edge(v_tenant, v_node, cortex_node_current(v_tenant,'projects',v_fk), 'part_of','canonical',1, auth.uid()); end if;
    v_fk := nullif(j->>'account_id','')::uuid;
    if v_fk is not null then perform cortex_upsert_edge(v_tenant, v_node, cortex_node_current(v_tenant,'accounts',v_fk), 'part_of','canonical',1, auth.uid()); end if;
    v_fk := nullif(j->>'opportunity_id','')::uuid;
    if v_fk is not null then perform cortex_upsert_edge(v_tenant, v_node, cortex_node_current(v_tenant,'opportunities',v_fk), 'part_of','canonical',1, auth.uid()); end if;
    v_fk := nullif(j->>'bom_id','')::uuid;
    if v_fk is not null then perform cortex_upsert_edge(v_tenant, v_node, cortex_node_current(v_tenant,'boms',v_fk), 'derived_from','canonical',1, auth.uid()); end if;
    v_fk := nullif(j->>'vendor_id','')::uuid;
    if v_fk is not null then perform cortex_upsert_edge(v_tenant, cortex_node_current(v_tenant,'vendors',v_fk), v_node, 'supplies','canonical',1, auth.uid()); end if;
    v_creator := coalesce(nullif(j->>'created_by',''), nullif(j->>'uploaded_by',''), nullif(j->>'submitted_by',''))::uuid;
    if v_creator is not null then perform cortex_upsert_edge(v_tenant, cortex_node_current(v_tenant,'users',v_creator), v_node, 'owns','canonical',1, auth.uid()); end if;
  exception when others then
    raise warning 'cortex_mirror_generic(%) failed: %', TG_TABLE_NAME, sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

-- Attach to every top-level business entity.
drop trigger if exists cortex_mirror_g on vendors;
create trigger cortex_mirror_g after insert or update or delete on vendors for each row execute function cortex_mirror_generic('vendor','name','');
drop trigger if exists cortex_mirror_g on scope_items;
create trigger cortex_mirror_g after insert or update or delete on scope_items for each row execute function cortex_mirror_generic('scope_item','description','');
drop trigger if exists cortex_mirror_g on contacts;
create trigger cortex_mirror_g after insert or update or delete on contacts for each row execute function cortex_mirror_generic('contact','full_name','role_title');
drop trigger if exists cortex_mirror_g on permits;
create trigger cortex_mirror_g after insert or update or delete on permits for each row execute function cortex_mirror_generic('permit','permit_type','status');
drop trigger if exists cortex_mirror_g on variation_orders;
create trigger cortex_mirror_g after insert or update or delete on variation_orders for each row execute function cortex_mirror_generic('change_order','vo_number','status');
drop trigger if exists cortex_mirror_g on progress_claims;
create trigger cortex_mirror_g after insert or update or delete on progress_claims for each row execute function cortex_mirror_generic('claim','claim_number','status');
drop trigger if exists cortex_mirror_g on warranty_tickets;
create trigger cortex_mirror_g after insert or update or delete on warranty_tickets for each row execute function cortex_mirror_generic('ticket','ticket_number','status');
drop trigger if exists cortex_mirror_g on delivery_schedules;
create trigger cortex_mirror_g after insert or update or delete on delivery_schedules for each row execute function cortex_mirror_generic('delivery','','status');
drop trigger if exists cortex_mirror_g on rfqs;
create trigger cortex_mirror_g after insert or update or delete on rfqs for each row execute function cortex_mirror_generic('rfq','','status');
drop trigger if exists cortex_mirror_g on contracts;
create trigger cortex_mirror_g after insert or update or delete on contracts for each row execute function cortex_mirror_generic('contract','','status');
drop trigger if exists cortex_mirror_g on certificates_of_completion;
create trigger cortex_mirror_g after insert or update or delete on certificates_of_completion for each row execute function cortex_mirror_generic('certificate','','status');
drop trigger if exists cortex_mirror_g on punchlist_items;
create trigger cortex_mirror_g after insert or update or delete on punchlist_items for each row execute function cortex_mirror_generic('punchlist','description','status');
drop trigger if exists cortex_mirror_g on site_inspections;
create trigger cortex_mirror_g after insert or update or delete on site_inspections for each row execute function cortex_mirror_generic('inspection','','status');
drop trigger if exists cortex_mirror_g on design_files;
create trigger cortex_mirror_g after insert or update or delete on design_files for each row execute function cortex_mirror_generic('design','name','file_type');
drop trigger if exists cortex_mirror_g on change_requests;
create trigger cortex_mirror_g after insert or update or delete on change_requests for each row execute function cortex_mirror_generic('change_request','description','priority');
drop trigger if exists cortex_mirror_g on master_schedules;
create trigger cortex_mirror_g after insert or update or delete on master_schedules for each row execute function cortex_mirror_generic('schedule_event','name','');
drop trigger if exists cortex_mirror_g on material_items;
create trigger cortex_mirror_g after insert or update or delete on material_items for each row execute function cortex_mirror_generic('material','description','category');
drop trigger if exists cortex_mirror_g on weekly_reports;
create trigger cortex_mirror_g after insert or update or delete on weekly_reports for each row execute function cortex_mirror_generic('weekly_report','','');
drop trigger if exists cortex_mirror_g on pre_con_checklist_items;
create trigger cortex_mirror_g after insert or update or delete on pre_con_checklist_items for each row execute function cortex_mirror_generic('task','title','status');

-- Re-lock the RPC surface (covers cortex_mirror_generic).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'cortex\_%'
  loop execute format('revoke execute on function %s from anon, authenticated, public', f.sig); end loop;
end $$;;
