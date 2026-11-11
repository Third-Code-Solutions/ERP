-- =============================================================================
-- Cortex coverage rollback (Batches 0-1). docs/erp/specs/cortex-coverage.md §7.
--
-- Run by hand, as one transaction, under the migration timeouts:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 \
--     -f packages/database/src/sql/cortex-coverage-rollback.sql
--
-- Restores the pre-Batch-1 triggers and function bodies. Keeps ALL data: enum
-- values, cortex_mirror_registry, cortex_node_type_access, and every cortex
-- node, edge and provenance row. Mirrored nodes keep their allowlisted
-- attributes until the old triggers rewrite them. Re-opens S1, S2 and S3.
-- =============================================================================
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1. Drop every registry-driven trigger and the KYC re-title trigger.
do $$
declare r record;
begin
  for r in select ref_table from public.cortex_mirror_registry loop
    if to_regclass(format('public.%I', r.ref_table)) is not null then
      execute format('drop trigger if exists cortex_mirror_r on public.%I', r.ref_table);
      execute format('drop trigger if exists cortex_fold_ins on public.%I', r.ref_table);
      execute format('drop trigger if exists cortex_fold_upd on public.%I', r.ref_table);
      execute format('drop trigger if exists cortex_fold_del on public.%I', r.ref_table);
      execute format('drop trigger if exists cortex_link on public.%I', r.ref_table);
    end if;
  end loop;
end
$$;
drop trigger if exists cortex_kyc_redact on public.account_kyc_artifacts;

-- 2. Re-create the generic triggers with their original names and arguments
--    (20260614052136, 20260614063911, 20260726243000, 20260726245000).
do $$
declare r record;
begin
  for r in
    select * from (values
      ('vendors', 'cortex_mirror_g', 'vendor', 'name', ''),
      ('scope_items', 'cortex_mirror_g', 'scope_item', 'description', ''),
      ('contacts', 'cortex_mirror_g', 'contact', 'full_name', 'role_title'),
      ('permits', 'cortex_mirror_g', 'permit', 'permit_type', 'status'),
      ('variation_orders', 'cortex_mirror_g', 'change_order', 'vo_number', 'status'),
      ('progress_claims', 'cortex_mirror_g', 'claim', 'claim_number', 'status'),
      ('warranty_tickets', 'cortex_mirror_g', 'ticket', 'ticket_number', 'status'),
      ('delivery_schedules', 'cortex_mirror_g', 'delivery', '', 'status'),
      ('rfqs', 'cortex_mirror_g', 'rfq', '', 'status'),
      ('contracts', 'cortex_mirror_g', 'contract', '', 'status'),
      ('certificates_of_completion', 'cortex_mirror_g', 'certificate', '', 'status'),
      ('punchlist_items', 'cortex_mirror_g', 'punchlist', 'description', 'status'),
      ('site_inspections', 'cortex_mirror_g', 'inspection', '', 'status'),
      ('design_files', 'cortex_mirror_g', 'design', 'name', 'file_type'),
      ('change_requests', 'cortex_mirror_g', 'change_request', 'description', 'priority'),
      ('master_schedules', 'cortex_mirror_g', 'schedule_event', 'name', ''),
      ('material_items', 'cortex_mirror_g', 'material', 'description', 'category'),
      ('weekly_reports', 'cortex_mirror_g', 'weekly_report', '', ''),
      ('pre_con_checklist_items', 'cortex_mirror_g', 'task', 'title', 'status'),
      ('cost_entries', 'cortex_mirror_g', 'cost_line', 'description', 'cost_category'),
      ('cost_codes', 'cortex_mirror_budget_cost_code', 'cost_code', 'name', 'category'),
      ('project_budgets', 'cortex_mirror_project_budget', 'project_budget', 'revision_reason', 'status'),
      ('stock_movements', 'cortex_mirror_stock_movement', 'stock_movement', 'reason', 'status')
    ) as t(tbl, trigger_name, node_type, title_col, summary_col)
  loop
    execute format('drop trigger if exists %I on public.%I', r.trigger_name, r.tbl);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.cortex_mirror_generic(%L, %L, %L)',
      r.trigger_name, r.tbl, r.node_type, r.title_col, r.summary_col);
  end loop;
end
$$;

-- 3. Previous bodies, verbatim apart from schema-qualified names
--    (20260613192346, 20260613193116, 20260726234000).
create or replace function public.cortex_upsert_node(
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

create or replace function public.cortex_mirror_account() returns trigger
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

create or replace function public.cortex_mirror_user() returns trigger
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

create or replace function public.cortex_mirror_opportunity() returns trigger
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

create or replace function public.cortex_mirror_document() returns trigger
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

create or replace function public.auth_can_read_cortex_node_type(
  p_node_type public.cortex_node_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_node_type::text in (
      'invoice',
      'supplier_bill',
      'cash_account',
      'cash_transaction',
      'bank_statement',
      'fiscal_period',
      'ledger_account',
      'journal_entry',
      'journal_line'
    ) then exists (
      select 1
      from public.users app_user
      where app_user.id = auth.uid()
        and app_user.tenant_id = public.auth_tenant_id()
        and app_user.role::text in ('finance', 'admin', 'owner')
    )
    when p_node_type::text in (
      'warehouse',
      'stock_receipt',
      'stock_ledger_entry'
    ) then public.auth_can_read_inventory()
    else true
  end
$$;

-- 4. Drop the Batch 1 functions.
drop function if exists public.cortex_backfill(text, text, integer, uuid);
drop function if exists public.cortex_kyc_redact();
drop function if exists public.cortex_apply_account(jsonb, text);
drop function if exists public.cortex_apply_user(jsonb, text);
drop function if exists public.cortex_apply_opportunity(jsonb, text);
drop function if exists public.cortex_apply_document(jsonb, text);
drop function if exists public.cortex_mirror_link();
drop function if exists public.cortex_link_edge(text, jsonb, boolean);
drop function if exists public.cortex_fold_children();
drop function if exists public.cortex_refresh_fold(text, uuid, uuid);
drop function if exists public.cortex_set_fold(uuid, text, uuid, text, jsonb);
drop function if exists public.cortex_mirror_row();
drop function if exists public.cortex_apply_row(text, jsonb, text);
drop function if exists public.cortex_edge_targets(uuid, jsonb, jsonb);
drop function if exists public.cortex_close_stale_edges(uuid, public.cortex_edge_type, text, uuid[], boolean);
drop function if exists public.cortex_render_tpl(text, jsonb);
drop function if exists public.cortex_redact_attrs(jsonb);
drop function if exists public.cortex_redact_text(text, integer);
