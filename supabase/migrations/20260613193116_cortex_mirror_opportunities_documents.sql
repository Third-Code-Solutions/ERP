-- Extend the Cortex live graph to opportunities (Pulse) and documents (Herald).
create or replace function cortex_mirror_opportunity() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_acct uuid; v_user uuid; v_proj uuid; v_tenant uuid;
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'opportunities', OLD.id, auth.uid(), 'opportunities:delete');
      return OLD;
    end if;
    v_tenant := NEW.tenant_id;
    v_node := cortex_upsert_node(
      v_tenant, 'opportunity', 'opportunities', NEW.id,
      coalesce(NEW.opportunity_type, 'Opportunity'),
      'Stage: ' || coalesce(NEW.stage::text, '') || ' · TCV(cents): ' || coalesce(NEW.tcv_cents::text, '0')
        || ' · Prob: ' || coalesce(NEW.probability::text, '0') || '%',
      jsonb_build_object('stage', NEW.stage, 'tcv_cents', NEW.tcv_cents, 'gp_cents', NEW.gp_cents,
                         'probability', NEW.probability, 'weighted_tcv_cents', NEW.weighted_tcv_cents,
                         'account_id', NEW.account_id, 'project_id', NEW.project_id, 'rep_id', NEW.rep_id),
      auth.uid(), 'opportunities:' || lower(tg_op)
    );
    if NEW.account_id is not null then
      v_acct := cortex_node_current(v_tenant, 'accounts', NEW.account_id);
      perform cortex_upsert_edge(v_tenant, v_node, v_acct, 'part_of', 'canonical', 1, auth.uid());
    end if;
    if NEW.project_id is not null then
      v_proj := cortex_node_current(v_tenant, 'projects', NEW.project_id);
      perform cortex_upsert_edge(v_tenant, v_node, v_proj, 'part_of', 'canonical', 1, auth.uid());
    end if;
    if NEW.rep_id is not null then
      v_user := cortex_node_current(v_tenant, 'users', NEW.rep_id);
      perform cortex_upsert_edge(v_tenant, v_user, v_node, 'owns', 'canonical', 1, auth.uid());
    end if;
  exception when others then
    raise warning 'cortex_mirror_opportunity failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

create or replace function cortex_mirror_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_proj uuid; v_user uuid; v_tenant uuid;
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'documents', OLD.id, auth.uid(), 'documents:delete');
      return OLD;
    end if;
    v_tenant := NEW.tenant_id;
    v_node := cortex_upsert_node(
      v_tenant, 'document', 'documents', NEW.id, NEW.file_name,
      'Type: ' || coalesce(NEW.document_type::text, '') || ' · ' || coalesce(NEW.mime_type, ''),
      jsonb_build_object('document_type', NEW.document_type, 'mime_type', NEW.mime_type,
                         'size_bytes', NEW.size_bytes, 'project_id', NEW.project_id),
      auth.uid(), 'documents:' || lower(tg_op)
    );
    if NEW.project_id is not null then
      v_proj := cortex_node_current(v_tenant, 'projects', NEW.project_id);
      perform cortex_upsert_edge(v_tenant, v_node, v_proj, 'part_of', 'canonical', 1, auth.uid());
    end if;
    if NEW.uploaded_by is not null then
      v_user := cortex_node_current(v_tenant, 'users', NEW.uploaded_by);
      perform cortex_upsert_edge(v_tenant, v_user, v_node, 'owns', 'canonical', 1, auth.uid());
    end if;
  exception when others then
    raise warning 'cortex_mirror_document failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists cortex_mirror_opportunities on opportunities;
create trigger cortex_mirror_opportunities after insert or update or delete on opportunities
  for each row execute function cortex_mirror_opportunity();

drop trigger if exists cortex_mirror_documents on documents;
create trigger cortex_mirror_documents after insert or update or delete on documents
  for each row execute function cortex_mirror_document();

-- Backfill (idempotent).
do $$ declare r record; v_node uuid; v_acct uuid; v_user uuid; v_proj uuid; begin
  for r in select id, tenant_id, opportunity_type, stage, tcv_cents, gp_cents, probability, weighted_tcv_cents, account_id, project_id, rep_id from opportunities loop
    v_node := cortex_upsert_node(r.tenant_id, 'opportunity', 'opportunities', r.id,
      coalesce(r.opportunity_type, 'Opportunity'),
      'Stage: ' || coalesce(r.stage::text, '') || ' · TCV(cents): ' || coalesce(r.tcv_cents::text, '0'),
      jsonb_build_object('stage', r.stage, 'tcv_cents', r.tcv_cents, 'gp_cents', r.gp_cents,
                         'probability', r.probability, 'weighted_tcv_cents', r.weighted_tcv_cents,
                         'account_id', r.account_id, 'project_id', r.project_id, 'rep_id', r.rep_id),
      null, 'backfill:opportunities');
    if r.account_id is not null then v_acct := cortex_node_current(r.tenant_id,'accounts',r.account_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_acct,'part_of','canonical',1,null); end if;
    if r.project_id is not null then v_proj := cortex_node_current(r.tenant_id,'projects',r.project_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_proj,'part_of','canonical',1,null); end if;
    if r.rep_id is not null then v_user := cortex_node_current(r.tenant_id,'users',r.rep_id); perform cortex_upsert_edge(r.tenant_id, v_user, v_node,'owns','canonical',1,null); end if;
  end loop;
end $$;

do $$ declare r record; v_node uuid; v_proj uuid; v_user uuid; begin
  for r in select id, tenant_id, file_name, document_type, mime_type, size_bytes, project_id, uploaded_by from documents loop
    v_node := cortex_upsert_node(r.tenant_id, 'document', 'documents', r.id, r.file_name,
      'Type: ' || coalesce(r.document_type::text, '') || ' · ' || coalesce(r.mime_type, ''),
      jsonb_build_object('document_type', r.document_type, 'mime_type', r.mime_type, 'size_bytes', r.size_bytes, 'project_id', r.project_id),
      null, 'backfill:documents');
    if r.project_id is not null then v_proj := cortex_node_current(r.tenant_id,'projects',r.project_id); perform cortex_upsert_edge(r.tenant_id, v_node, v_proj,'part_of','canonical',1,null); end if;
    if r.uploaded_by is not null then v_user := cortex_node_current(r.tenant_id,'users',r.uploaded_by); perform cortex_upsert_edge(r.tenant_id, v_user, v_node,'owns','canonical',1,null); end if;
  end loop;
end $$;

-- Re-lock the RPC surface for the two new SECURITY DEFINER functions.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'cortex\_%'
  loop execute format('revoke execute on function %s from anon, authenticated, public', f.sig); end loop;
end $$;

select
  (select count(*) from cortex_nodes where node_type='opportunity') as opp_nodes,
  (select count(*) from cortex_nodes where node_type='document') as doc_nodes,
  (select count(*) from cortex_edges) as total_edges,
  (select count(*) from cortex_nodes) as total_nodes;;
