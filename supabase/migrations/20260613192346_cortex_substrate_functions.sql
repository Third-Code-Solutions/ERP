-- Cortex provenance hash chain + node/edge upsert + defensive mirror triggers.
create or replace function cortex_provenance_append(
  p_tenant uuid, p_subject_kind cortex_subject_kind, p_subject_id uuid,
  p_origin cortex_provenance_origin, p_origin_ref text, p_actor uuid
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_prev text; v_hash text; v_id bigint;
begin
  select hash into v_prev from cortex_provenance where tenant_id = p_tenant order by id desc limit 1;
  if v_prev is null then v_prev := 'genesis'; end if;
  v_hash := encode(
    digest(
      v_prev || p_subject_kind::text || coalesce(p_subject_id::text, '')
             || p_origin::text || coalesce(p_origin_ref, '') || clock_timestamp()::text,
      'sha256'
    ), 'hex'
  );
  insert into cortex_provenance(tenant_id, subject_kind, subject_id, origin, origin_ref, actor_id, prev_hash, hash)
  values (p_tenant, p_subject_kind, p_subject_id, p_origin, p_origin_ref, p_actor, v_prev, v_hash)
  returning id into v_id;
  return v_id;
end $$;

create or replace function cortex_node_current(p_tenant uuid, p_ref_table text, p_ref_id uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select id from cortex_nodes
  where tenant_id = p_tenant and ref_table = p_ref_table and ref_id = p_ref_id and valid_to is null
  order by recorded_at desc limit 1
$$;

create or replace function cortex_upsert_node(
  p_tenant uuid, p_node_type cortex_node_type, p_ref_table text, p_ref_id uuid,
  p_title text, p_summary text, p_attributes jsonb, p_actor uuid, p_origin_ref text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from cortex_nodes
  where tenant_id = p_tenant and ref_table = p_ref_table and ref_id = p_ref_id and valid_to is null
  limit 1;
  if v_id is null then
    insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id, title, summary, attributes, last_verified_at, freshness, created_by)
    values (p_tenant, p_node_type, p_ref_table, p_ref_id, p_title, p_summary, p_attributes, now(), 'fresh', p_actor)
    returning id into v_id;
  else
    update cortex_nodes
       set title = p_title, summary = p_summary, attributes = p_attributes,
           last_verified_at = now(), recorded_at = now(), freshness = 'fresh'
     where id = v_id;
  end if;
  perform cortex_provenance_append(p_tenant, 'node', v_id, 'mutation', p_origin_ref, p_actor);
  return v_id;
end $$;

create or replace function cortex_close_node(
  p_tenant uuid, p_ref_table text, p_ref_id uuid, p_actor uuid, p_origin_ref text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update cortex_nodes set valid_to = now(), recorded_at = now()
   where tenant_id = p_tenant and ref_table = p_ref_table and ref_id = p_ref_id and valid_to is null
  returning id into v_id;
  if v_id is not null then
    perform cortex_provenance_append(p_tenant, 'node', v_id, 'mutation', p_origin_ref, p_actor);
  end if;
end $$;

create or replace function cortex_upsert_edge(
  p_tenant uuid, p_src uuid, p_dst uuid, p_edge_type cortex_edge_type,
  p_origin cortex_edge_origin, p_confidence real, p_actor uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_prov bigint;
begin
  if p_src is null or p_dst is null then return null; end if;
  select id into v_id from cortex_edges
  where tenant_id = p_tenant and src_id = p_src and dst_id = p_dst and edge_type = p_edge_type and valid_to is null
  limit 1;
  if v_id is null then
    v_prov := cortex_provenance_append(p_tenant, 'edge', null, 'mutation', 'edge:' || p_edge_type::text, p_actor);
    insert into cortex_edges(tenant_id, src_id, dst_id, edge_type, origin, confidence, provenance_id)
    values (p_tenant, p_src, p_dst, p_edge_type, p_origin, p_confidence, v_prov)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function cortex_mirror_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_acct uuid; v_user uuid; v_tenant uuid;
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'projects', OLD.id, auth.uid(), 'projects:delete');
      return OLD;
    end if;
    v_tenant := NEW.tenant_id;
    v_node := cortex_upsert_node(
      v_tenant, 'project', 'projects', NEW.id, NEW.name,
      'Client: ' || coalesce(NEW.client, '') || ' · Status: ' || coalesce(NEW.status::text, ''),
      jsonb_build_object('status', NEW.status, 'client', NEW.client, 'project_type', NEW.project_type,
                         'location', NEW.location, 'total_sqm', NEW.total_sqm, 'account_id', NEW.account_id),
      auth.uid(), 'projects:' || lower(tg_op)
    );
    if NEW.account_id is not null then
      v_acct := cortex_node_current(v_tenant, 'accounts', NEW.account_id);
      perform cortex_upsert_edge(v_tenant, v_node, v_acct, 'part_of', 'canonical', 1, auth.uid());
    end if;
    if NEW.created_by is not null then
      v_user := cortex_node_current(v_tenant, 'users', NEW.created_by);
      perform cortex_upsert_edge(v_tenant, v_user, v_node, 'owns', 'canonical', 1, auth.uid());
    end if;
  exception when others then
    raise warning 'cortex_mirror_project failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

create or replace function cortex_mirror_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'accounts', OLD.id, auth.uid(), 'accounts:delete');
      return OLD;
    end if;
    perform cortex_upsert_node(
      NEW.tenant_id, 'account', 'accounts', NEW.id, NEW.name,
      'Industry: ' || coalesce(NEW.industry::text, '') || ' · KYC: ' || coalesce(NEW.kyc_status::text, ''),
      jsonb_build_object('industry', NEW.industry, 'kyc_status', NEW.kyc_status, 'primary_email', NEW.primary_email),
      auth.uid(), 'accounts:' || lower(tg_op)
    );
  exception when others then
    raise warning 'cortex_mirror_account failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

create or replace function cortex_mirror_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform cortex_close_node(OLD.tenant_id, 'users', OLD.id, null, 'users:delete');
      return OLD;
    end if;
    perform cortex_upsert_node(
      NEW.tenant_id, 'employee', 'users', NEW.id, NEW.full_name,
      'Role: ' || coalesce(NEW.role::text, ''),
      jsonb_build_object('role', NEW.role, 'email', NEW.email),
      NEW.id, 'users:' || lower(tg_op)
    );
  exception when others then
    raise warning 'cortex_mirror_user failed for %: %', coalesce(NEW.id, OLD.id), sqlerrm;
  end;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists cortex_mirror_projects on projects;
create trigger cortex_mirror_projects after insert or update or delete on projects
  for each row execute function cortex_mirror_project();

drop trigger if exists cortex_mirror_accounts on accounts;
create trigger cortex_mirror_accounts after insert or update or delete on accounts
  for each row execute function cortex_mirror_account();

drop trigger if exists cortex_mirror_users on users;
create trigger cortex_mirror_users after insert or update or delete on users
  for each row execute function cortex_mirror_user();;
