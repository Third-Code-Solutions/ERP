-- =============================================================================
-- Cortex graph substrate — BUILDOPS_IMPLEMENTATION_PROMPT §5 / Appendix B.
--
-- Additive only. Creates the derived, permissioned, hash-chained projection of
-- the ERP: cortex_nodes / cortex_edges / cortex_provenance, kept live by
-- defensive mirror triggers on the canonical ERP tables.
--
-- Idempotent: safe to re-run. Apply AFTER Drizzle schema + RLS base policies
-- (depends on auth_tenant_id() from rls-policies.sql and pgcrypto for digest()).
-- =============================================================================

-- --- 1. Enums -----------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'cortex_node_type') then
    create type cortex_node_type as enum (
      'employee','project','opportunity','account','scope_item','bom','bom_line',
      'vendor','purchase_order','po_line','invoice','invoice_line','milestone',
      'cost_line','task','announcement','schedule_event','document','change_order','audit_event'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_edge_type') then
    create type cortex_edge_type as enum (
      'owns','assigned_to','member_of','part_of','derived_from','bills','supplies',
      'pays','blocks','depends_on','mentions','scheduled_for','approved_by',
      'superseded_by','references_doc'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_edge_origin') then
    create type cortex_edge_origin as enum ('canonical','derived','ai');
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_subject_kind') then
    create type cortex_subject_kind as enum ('node','edge','answer');
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_provenance_origin') then
    create type cortex_provenance_origin as enum ('mutation','document','ai_run','import');
  end if;
  if not exists (select 1 from pg_type where typname = 'cortex_freshness') then
    create type cortex_freshness as enum ('fresh','stale','unknown');
  end if;
end $$;

-- --- 2. Tables ----------------------------------------------------------------
create table if not exists cortex_provenance (
  id            bigserial primary key,
  tenant_id     uuid not null references tenants(id) on delete cascade,
  subject_kind  cortex_subject_kind not null,
  subject_id    uuid,
  origin        cortex_provenance_origin not null,
  origin_ref    text,
  actor_id      uuid references users(id) on delete set null,
  prev_hash     varchar(64) not null default 'genesis',
  hash          varchar(64) not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cortex_provenance_tenant_id on cortex_provenance(tenant_id);
create index if not exists idx_cortex_provenance_subject on cortex_provenance(subject_kind, subject_id);
create index if not exists idx_cortex_provenance_tenant_created on cortex_provenance(tenant_id, id);

create table if not exists cortex_nodes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  node_type        cortex_node_type not null,
  ref_table        varchar(100) not null,
  ref_id           uuid not null,
  title            varchar(500),
  summary          text,
  attributes       jsonb,
  valid_from       timestamptz not null default now(),
  valid_to         timestamptz,
  recorded_at      timestamptz not null default now(),
  last_verified_at timestamptz,
  freshness        cortex_freshness not null default 'fresh',
  embedding        vector(1536),
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_cortex_nodes_tenant_id on cortex_nodes(tenant_id);
create index if not exists idx_cortex_nodes_tenant_type on cortex_nodes(tenant_id, node_type);
create index if not exists idx_cortex_nodes_ref on cortex_nodes(tenant_id, ref_table, ref_id);
-- One CURRENT node per ERP row (bi-temporal history allowed via valid_to).
create unique index if not exists ux_cortex_nodes_current
  on cortex_nodes(tenant_id, ref_table, ref_id) where valid_to is null;

create table if not exists cortex_edges (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  src_id        uuid not null references cortex_nodes(id) on delete cascade,
  dst_id        uuid not null references cortex_nodes(id) on delete cascade,
  edge_type     cortex_edge_type not null,
  origin        cortex_edge_origin not null default 'canonical',
  weight        real not null default 1,
  confidence    real not null default 1,
  attributes    jsonb,
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz,
  recorded_at   timestamptz not null default now(),
  provenance_id bigint references cortex_provenance(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_cortex_edges_tenant_id on cortex_edges(tenant_id);
create index if not exists idx_cortex_edges_src on cortex_edges(src_id, edge_type);
create index if not exists idx_cortex_edges_dst on cortex_edges(dst_id, edge_type);
create unique index if not exists ux_cortex_edges_current
  on cortex_edges(tenant_id, src_id, dst_id, edge_type) where valid_to is null;

-- --- 3. RLS -------------------------------------------------------------------
alter table cortex_nodes      enable row level security;
alter table cortex_edges      enable row level security;
alter table cortex_provenance enable row level security;

drop policy if exists cortex_nodes_tenant_read   on cortex_nodes;
drop policy if exists cortex_nodes_tenant_insert on cortex_nodes;
drop policy if exists cortex_nodes_tenant_update on cortex_nodes;
create policy cortex_nodes_tenant_read   on cortex_nodes for select using (tenant_id = auth_tenant_id());
create policy cortex_nodes_tenant_insert on cortex_nodes for insert with check (tenant_id = auth_tenant_id());
create policy cortex_nodes_tenant_update on cortex_nodes for update using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());

drop policy if exists cortex_edges_tenant_read   on cortex_edges;
drop policy if exists cortex_edges_tenant_insert on cortex_edges;
drop policy if exists cortex_edges_tenant_update on cortex_edges;
create policy cortex_edges_tenant_read   on cortex_edges for select using (tenant_id = auth_tenant_id());
create policy cortex_edges_tenant_insert on cortex_edges for insert with check (tenant_id = auth_tenant_id());
create policy cortex_edges_tenant_update on cortex_edges for update using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());

-- Provenance is append-only and tenant-scoped.
drop policy if exists cortex_provenance_tenant_read   on cortex_provenance;
drop policy if exists cortex_provenance_tenant_insert on cortex_provenance;
drop policy if exists cortex_provenance_no_update     on cortex_provenance;
drop policy if exists cortex_provenance_no_delete     on cortex_provenance;
create policy cortex_provenance_tenant_read   on cortex_provenance for select using (tenant_id = auth_tenant_id());
create policy cortex_provenance_tenant_insert on cortex_provenance for insert with check (tenant_id = auth_tenant_id());
create policy cortex_provenance_no_update     on cortex_provenance for update using (false);
create policy cortex_provenance_no_delete     on cortex_provenance for delete using (false);

-- --- 4. Provenance hash chain (per tenant, mirrors audit_log) ------------------
create or replace function cortex_provenance_append(
  p_tenant uuid,
  p_subject_kind cortex_subject_kind,
  p_subject_id uuid,
  p_origin cortex_provenance_origin,
  p_origin_ref text,
  p_actor uuid
) returns bigint
-- pgcrypto's digest() lives in the `extensions` schema on Supabase.
language plpgsql security definer set search_path = public, extensions as $$
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

-- --- 5. Node / edge upsert helpers --------------------------------------------
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

-- --- 6. Mirror trigger functions (DEFENSIVE — never break the ERP mutation) ----
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

-- --- 7. Attach triggers -------------------------------------------------------
drop trigger if exists cortex_mirror_projects on projects;
create trigger cortex_mirror_projects after insert or update or delete on projects
  for each row execute function cortex_mirror_project();

drop trigger if exists cortex_mirror_accounts on accounts;
create trigger cortex_mirror_accounts after insert or update or delete on accounts
  for each row execute function cortex_mirror_account();

drop trigger if exists cortex_mirror_users on users;
create trigger cortex_mirror_users after insert or update or delete on users
  for each row execute function cortex_mirror_user();

-- --- 7b. Lock down the RPC surface -------------------------------------------
-- These SECURITY DEFINER functions must never be callable via PostgREST
-- (/rest/v1/rpc/*) — that would bypass RLS WITH CHECK and allow cross-tenant
-- writes. Triggers and internal calls run as the owner and don't need EXECUTE.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'cortex\_%'
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', f.sig);
  end loop;
end $$;

-- =============================================================================
-- Backfill (additive, idempotent — upserts skip existing current nodes).
-- Run order: users → accounts → projects (+ derived edges).
-- =============================================================================
do $$ declare r record; begin
  for r in select id, tenant_id, full_name, role, email from users loop
    perform cortex_upsert_node(r.tenant_id, 'employee', 'users', r.id, r.full_name,
      'Role: ' || coalesce(r.role::text, ''),
      jsonb_build_object('role', r.role, 'email', r.email), r.id, 'backfill:users');
  end loop;
end $$;

do $$ declare r record; begin
  for r in select id, tenant_id, name, industry, kyc_status, primary_email from accounts loop
    perform cortex_upsert_node(r.tenant_id, 'account', 'accounts', r.id, r.name,
      'Industry: ' || coalesce(r.industry::text, '') || ' · KYC: ' || coalesce(r.kyc_status::text, ''),
      jsonb_build_object('industry', r.industry, 'kyc_status', r.kyc_status, 'primary_email', r.primary_email),
      null, 'backfill:accounts');
  end loop;
end $$;

do $$ declare r record; v_node uuid; v_acct uuid; v_user uuid; begin
  for r in select id, tenant_id, name, client, status, project_type, location, total_sqm, account_id, created_by from projects loop
    v_node := cortex_upsert_node(r.tenant_id, 'project', 'projects', r.id, r.name,
      'Client: ' || coalesce(r.client, '') || ' · Status: ' || coalesce(r.status::text, ''),
      jsonb_build_object('status', r.status, 'client', r.client, 'project_type', r.project_type,
                         'location', r.location, 'total_sqm', r.total_sqm, 'account_id', r.account_id),
      r.created_by, 'backfill:projects');
    if r.account_id is not null then
      v_acct := cortex_node_current(r.tenant_id, 'accounts', r.account_id);
      perform cortex_upsert_edge(r.tenant_id, v_node, v_acct, 'part_of', 'canonical', 1, r.created_by);
    end if;
    if r.created_by is not null then
      v_user := cortex_node_current(r.tenant_id, 'users', r.created_by);
      perform cortex_upsert_edge(r.tenant_id, v_user, v_node, 'owns', 'canonical', 1, r.created_by);
    end if;
  end loop;
end $$;

-- =============================================================================
-- 9. Extended mirrors — opportunities (Pulse) and documents (Herald).
-- =============================================================================
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

-- Re-lock the RPC surface (covers the two new SECURITY DEFINER mirror fns).
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like 'cortex\_%'
  loop execute format('revoke execute on function %s from anon, authenticated, public', f.sig); end loop;
end $$;
