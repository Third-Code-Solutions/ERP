-- =============================================================================
-- Cortex coverage rollback (Batches 0-1). docs/erp/specs/cortex-coverage.md §7.
--
-- Run by hand, as one transaction, under the migration timeouts:
--   psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 --     -f packages/database/src/sql/cortex-coverage-rollback.sql
--
-- Switches the registry engine off. The 23 registry tables stop mirroring:
-- their nodes keep their current (allowlisted) attributes and go stale until
-- Batch 1 step 9b is re-applied. It does NOT re-attach cortex_mirror_generic,
-- and it keeps every S1/S2/S3 fix: the deny-by-default read check, the
-- email-free account/user/opportunity/document mirrors and the KYC re-title.
-- Keeps ALL data: enum values, cortex_mirror_registry, cortex_node_type_access,
-- and every cortex node, edge and provenance row.
-- =============================================================================
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 1. Drop every registry-driven trigger.
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

-- 2. Previous cortex_upsert_node body (no fold merge, no no-change skip),
--    verbatim from 20260613192346.
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

-- 3. Drop the registry engine. The hand-written mirrors keep their apply
--    functions, cortex_close_stale_edges and the redaction helpers.
drop function if exists public.cortex_scrub_nodes;
drop function if exists public.cortex_backfill;
drop function if exists public.cortex_mirror_link();
drop function if exists public.cortex_link_edge(text, jsonb, boolean);
drop function if exists public.cortex_fold_children();
drop function if exists public.cortex_refresh_fold(text, uuid, uuid);
drop function if exists public.cortex_set_fold(uuid, text, uuid, text, jsonb);
drop function if exists public.cortex_mirror_row();
drop function if exists public.cortex_apply_row(text, jsonb, text);
drop function if exists public.cortex_edge_targets(uuid, jsonb, jsonb);
drop function if exists public.cortex_render_tpl(text, jsonb);
