-- Harden the generic mirror: strip secrets, PII and heavy blobs from the row
-- before storing it in node attributes (defense-in-depth; attributes never
-- reaches an external LLM, but we avoid a second plaintext copy of sensitive
-- fields at rest).
create or replace function cortex_mirror_generic() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  j jsonb; j_clean jsonb; v_tenant uuid; v_id uuid; v_title text; v_summary text; v_node uuid;
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
    -- redaction denylist: secrets, raw PII, large blobs
    j_clean := j
      - 'token_hash' - 'response_token_hash' - 'signer_ip' - 'signer_user_agent'
      - 'signer_email' - 'signer_name' - 'bir_tin' - 'payload' - 'snapshot'
      - 'tasks' - 'mentions' - 'percent_by_category' - 'line_items' - 'body';
    v_node := cortex_upsert_node(v_tenant, nt, TG_TABLE_NAME, v_id, v_title, v_summary, j_clean, auth.uid(), TG_TABLE_NAME || ':' || lower(tg_op));
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

-- Re-apply the redacted attributes to existing nodes (no-op self-update fires the trigger).
update vendors set tenant_id = tenant_id;
update scope_items set tenant_id = tenant_id;
update permits set tenant_id = tenant_id;
update progress_claims set tenant_id = tenant_id;
update delivery_schedules set tenant_id = tenant_id;
update weekly_reports set tenant_id = tenant_id;

-- Re-lock RPC surface.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'cortex\_%'
  loop execute format('revoke execute on function %s from anon, authenticated, public', f.sig); end loop;
end $$;;
