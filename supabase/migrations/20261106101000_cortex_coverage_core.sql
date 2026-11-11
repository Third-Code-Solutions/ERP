-- Cortex coverage, Batch 1 (docs/erp/specs/cortex-coverage.md §7 row 1).
--
-- * §3.1 registry engine: cortex_apply_row, cortex_mirror_row,
--   cortex_fold_children, cortex_set_fold, cortex_mirror_link,
--   cortex_redact_text, cortex_close_stale_edges, cortex_backfill,
--   cortex_scrub_nodes (rewrites closed and orphaned nodes too).
-- * cortex_upsert_node keeps attributes.folds, skips no-change writes and
--   clears the embedding when the title or summary changes.
-- * S2: auth_can_read_cortex_node_type is deny-by-default by read group.
-- * S3: account/user/opportunity/document mirrors drop emails; KYC-linked
--   documents never use the file name as title.
-- * S1: the 23 generic-mirror tables move to literal per-table allowlists;
--   their old cortex_mirror_generic triggers are replaced by cortex_mirror_r.
--
-- Lock profile: functions and registry rows are written first. The trigger
-- swap (step 9b) runs last: DROP TRIGGER takes ACCESS EXCLUSIVE on each of the
-- 23 tables and on account_kyc_artifacts, held until COMMIT. lock_timeout
-- fails fast; retry off-peak. Existing nodes keep their old attributes until
-- the backfill (--mode all) and the scrub run (docs/runbooks/cortex-substrate.md).
-- Rollback: packages/database/src/sql/cortex-coverage-rollback.sql.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Node upsert: preserve folds, short-circuit identical writes.
-- ---------------------------------------------------------------------------
create or replace function public.cortex_upsert_node(
  p_tenant uuid, p_node_type cortex_node_type, p_ref_table text, p_ref_id uuid,
  p_title text, p_summary text, p_attributes jsonb, p_actor uuid, p_origin_ref text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_title text; v_summary text; v_attrs jsonb;
  v_fresh cortex_freshness; v_new jsonb;
begin
  select id, title, summary, attributes, freshness
    into v_id, v_title, v_summary, v_attrs, v_fresh
    from cortex_nodes
   where tenant_id = p_tenant and ref_table = p_ref_table and ref_id = p_ref_id and valid_to is null
   limit 1;
  if v_id is null then
    insert into cortex_nodes(tenant_id, node_type, ref_table, ref_id, title, summary, attributes, last_verified_at, freshness, created_by)
    values (p_tenant, p_node_type, p_ref_table, p_ref_id, p_title, p_summary, p_attributes, now(), 'fresh', p_actor)
    returning id into v_id;
  else
    v_new := p_attributes;
    -- A parent's own write never wipes the folds its children maintain.
    if coalesce(v_attrs ? 'folds', false) and not coalesce(p_attributes ? 'folds', false) then
      v_new := coalesce(p_attributes, '{}'::jsonb) || jsonb_build_object('folds', v_attrs -> 'folds');
    end if;
    if v_fresh = 'fresh'
       and v_title is not distinct from p_title
       and v_summary is not distinct from p_summary
       and v_attrs is not distinct from v_new then
      return v_id;
    end if;
    -- Folds come from the row being updated, not the unlocked read above: a
    -- child fold committed meanwhile is kept (UPDATE re-reads the newest row).
    update cortex_nodes n
       set title = p_title, summary = p_summary,
           attributes = case
             when coalesce(n.attributes ? 'folds', false) and not coalesce(p_attributes ? 'folds', false)
               then coalesce(p_attributes, '{}'::jsonb) || jsonb_build_object('folds', n.attributes -> 'folds')
             else p_attributes end,
           -- A new title or summary invalidates the vector; the embed job
           -- refills a null embedding from the new text.
           embedding = case when n.title is distinct from p_title or n.summary is distinct from p_summary
                            then null else n.embedding end,
           last_verified_at = now(), recorded_at = now(), freshness = 'fresh'
     where n.id = v_id;
  end if;
  perform cortex_provenance_append(p_tenant, 'node', v_id, 'mutation', p_origin_ref, p_actor);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Redaction helpers (pure).
-- ---------------------------------------------------------------------------
-- Same patterns as packages/shared-types/src/cortex-redaction.ts (\y is the
-- PostgreSQL word boundary). Tax ids run before phones: a 12-digit TIN
-- would otherwise read as a phone number.
create or replace function public.cortex_redact_text(p_text text, p_max integer)
returns text
language sql immutable set search_path = '' as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(p_text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
          '\y(?:TIN|tax identification number)\s*[:#-]?\s*\d{3}[- ]?\d{3}[- ]?\d{3}(?:[- ]?\d{3})?\y',
          '[tax id]', 'gi'),
        '\y\d{3}[- ]\d{3}[- ]\d{3}(?:[- ]\d{3})?\y', '[tax id]', 'g'),
      -- 10 to 13 digits, up to two separators between digits: "(02) 8123-4567".
      '(?<![[:alnum:]_-])[+(]?[0-9](?:[ .()-]{0,2}[0-9]){9,12}(?![[:alnum:]_-])', '[phone]', 'g'
    ),
    p_max
  )
$$;

-- Every string value is masked and cut to 500 characters; other values pass.
create or replace function public.cortex_redact_attrs(p_attrs jsonb)
returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(
    key,
    case when jsonb_typeof(value) = 'string'
      then to_jsonb(public.cortex_redact_text(value #>> '{}', 500))
      else value end
  ), '{}'::jsonb)
  from jsonb_each(coalesce(p_attrs, '{}'::jsonb))
$$;

-- '{col}' placeholders filled from p_ctx; null when any placeholder is empty.
create or replace function public.cortex_render_tpl(p_tpl text, p_ctx jsonb)
returns text
language plpgsql immutable set search_path = '' as $$
declare v_out text := p_tpl; v_key text; v_val text;
begin
  if coalesce(p_tpl, '') = '' then return null; end if;
  for v_key in select (regexp_matches(p_tpl, '\{([a-z0-9_]+)\}', 'g'))[1] loop
    v_val := nullif(p_ctx ->> v_key, '');
    if v_val is null then return null; end if;
    v_out := replace(v_out, '{' || v_key || '}', v_val);
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Edge maintenance.
-- ---------------------------------------------------------------------------
-- Close p_node's current canonical edges of one type to/from p_other_ref_table
-- except p_keep. Link-table edges (attributes.link) are owned by
-- cortex_mirror_link and never closed here.
create or replace function public.cortex_close_stale_edges(
  p_node uuid, p_edge_type public.cortex_edge_type, p_other_ref_table text,
  p_keep uuid[], p_out boolean default true
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.cortex_edges e
     set valid_to = now(), recorded_at = now()
    from public.cortex_nodes o
   where e.valid_to is null
     and e.origin = 'canonical'
     and e.edge_type = p_edge_type
     and not coalesce(e.attributes ? 'link', false)
     and ((p_out and e.src_id = p_node and o.id = e.dst_id)
       or (not p_out and e.dst_id = p_node and o.id = e.src_id))
     and o.ref_table = p_other_ref_table
     and not (o.id = any(array_remove(coalesce(p_keep, '{}'::uuid[]), null)));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Resolve one registry edge spec to the other endpoint's ref table and ids.
--   {"cols": [..first non-null..], "table": t, "type": e, "dir": "out"|"in",
--    "many": true (cols[0] is uuid[]), "via": {"table": t, "col": c},
--    "poly": {"type_col": c, "map": {"value": "ref_table"}}}
create or replace function public.cortex_edge_targets(
  p_tenant uuid, p_row jsonb, p_spec jsonb, out ref_table text, out node_ids uuid[]
)
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_id uuid; v_col text;
begin
  ref_table := coalesce(
    p_spec ->> 'table',
    p_spec -> 'poly' -> 'map' ->> (p_row ->> (p_spec -> 'poly' ->> 'type_col'))
  );
  if ref_table is null then node_ids := '{}'; return; end if;
  if coalesce((p_spec ->> 'many')::boolean, false) then
    select coalesce(array_agg(x::uuid), '{}') into v_ids
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_row -> (p_spec -> 'cols' ->> 0)) = 'array'
          then p_row -> (p_spec -> 'cols' ->> 0) else '[]'::jsonb end
      ) as x;
  else
    for v_col in select jsonb_array_elements_text(p_spec -> 'cols') loop
      v_id := nullif(p_row ->> v_col, '')::uuid;
      exit when v_id is not null;
    end loop;
    v_ids := array_remove(array[v_id], null);
  end if;
  if p_spec ? 'via' and cardinality(v_ids) > 0 then
    execute format(
      'select (to_jsonb(t) ->> %L)::uuid from public.%I t where t.tenant_id = $1 and t.id = $2',
      p_spec -> 'via' ->> 'col', p_spec -> 'via' ->> 'table'
    ) into v_id using p_tenant, v_ids[1];
    v_ids := array_remove(array[v_id], null);
  end if;
  select coalesce(array_agg(n), '{}') into node_ids
    from (select public.cortex_node_current(p_tenant, ref_table, i) as n from unnest(v_ids) i) s
   where n is not null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Registry apply: one row -> node + edges (or close on DELETE).
--    p_op: INSERT | UPDATE | DELETE | BACKFILL.
-- ---------------------------------------------------------------------------
create or replace function public.cortex_apply_row(p_table text, p_row jsonb, p_op text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.cortex_mirror_registry;
  v_tenant uuid; v_id uuid; v_node uuid; v_ctx jsonb; v_val text;
  v_title text; v_summary text; v_attrs jsonb := '{}'::jsonb;
  v_key text; v_spec jsonb; v_t record; v_other uuid;
  v_keep jsonb := '{}'::jsonb; v_group text; v_parts text[];
begin
  select * into r from public.cortex_mirror_registry where ref_table = p_table;
  if r.node_type is null then return null; end if;
  v_tenant := nullif(p_row ->> 'tenant_id', '')::uuid;
  v_id := nullif(p_row ->> 'id', '')::uuid;
  if v_tenant is null or v_id is null then return null; end if;

  if p_op = 'DELETE' then
    v_node := public.cortex_node_current(v_tenant, p_table, v_id);
    if v_node is not null then
      update public.cortex_edges
         set valid_to = now(), recorded_at = now()
       where tenant_id = v_tenant and valid_to is null and origin = 'canonical'
         and (src_id = v_node or dst_id = v_node);
      perform public.cortex_close_node(v_tenant, p_table, v_id, auth.uid(), p_table || ':delete');
    end if;
    return v_node;
  end if;

  v_ctx := p_row;
  for v_key, v_spec in select key, value from jsonb_each(r.lookups) loop
    execute format(
      'select to_jsonb(t) ->> %L from public.%I t where t.tenant_id = $1 and t.id = $2',
      v_spec ->> 'col', v_spec ->> 'table'
    ) into v_val using v_tenant, nullif(p_row ->> (v_spec ->> 'key'), '')::uuid;
    v_ctx := v_ctx || jsonb_build_object(v_key, v_val);
  end loop;

  v_title := public.cortex_redact_text(coalesce(
    public.cortex_render_tpl(r.title_tpl, v_ctx),
    initcap(replace(r.node_type::text, '_', ' ')) || ' ' || left(v_id::text, 8)
  ), 300);
  v_summary := public.cortex_redact_text(public.cortex_render_tpl(r.summary_tpl, v_ctx), 300);

  foreach v_key in array r.attr_cols loop
    if p_row ? v_key then v_attrs := v_attrs || jsonb_build_object(v_key, p_row -> v_key); end if;
  end loop;
  -- Scalars only: redaction masks top-level strings, never nested ones.
  foreach v_key in array r.attr_paths loop
    if jsonb_typeof(p_row #> string_to_array(v_key, '.')) in ('string', 'number', 'boolean') then
      v_attrs := v_attrs || jsonb_build_object(
        regexp_replace(v_key, '^.*\.', ''), p_row #> string_to_array(v_key, '.'));
    end if;
  end loop;
  v_attrs := public.cortex_redact_attrs(v_attrs);

  v_node := public.cortex_upsert_node(
    v_tenant, r.node_type, p_table, v_id, v_title, v_summary, v_attrs,
    auth.uid(), p_table || ':' || lower(p_op)
  );

  for v_spec in select value from jsonb_array_elements(r.edges) loop
    -- A poly edge can move to another table: track every mapped table so the
    -- edge to the previous one is closed below.
    for v_key in select value from jsonb_each_text(coalesce(v_spec -> 'poly' -> 'map', '{}'::jsonb)) loop
      v_group := (v_spec ->> 'type') || '|' || v_key || '|' || coalesce(v_spec ->> 'dir', 'out');
      v_keep := v_keep || jsonb_build_object(v_group, coalesce(v_keep -> v_group, '[]'::jsonb));
    end loop;
    select * into v_t from public.cortex_edge_targets(v_tenant, p_row, v_spec);
    if v_t.ref_table is null then continue; end if;
    foreach v_other in array v_t.node_ids loop
      if coalesce(v_spec ->> 'dir', 'out') = 'out' then
        perform public.cortex_upsert_edge(v_tenant, v_node, v_other,
          (v_spec ->> 'type')::public.cortex_edge_type, 'canonical', 1, auth.uid());
      else
        perform public.cortex_upsert_edge(v_tenant, v_other, v_node,
          (v_spec ->> 'type')::public.cortex_edge_type, 'canonical', 1, auth.uid());
      end if;
    end loop;
    v_group := (v_spec ->> 'type') || '|' || v_t.ref_table || '|' || coalesce(v_spec ->> 'dir', 'out');
    v_keep := v_keep || jsonb_build_object(v_group, coalesce(v_keep -> v_group, '[]'::jsonb) || to_jsonb(v_t.node_ids));
  end loop;

  if p_op in ('UPDATE', 'BACKFILL') then
    for v_group in select jsonb_object_keys(v_keep) loop
      v_parts := string_to_array(v_group, '|');
      perform public.cortex_close_stale_edges(
        v_node, v_parts[1]::public.cortex_edge_type, v_parts[2],
        array(select jsonb_array_elements_text(v_keep -> v_group)::uuid),
        v_parts[3] = 'out');
    end loop;
  end if;
  return v_node;
end $$;

create or replace function public.cortex_mirror_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.cortex_apply_row(
      tg_table_name::text,
      case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
      tg_op);
  exception when others then
    raise warning 'cortex_mirror_row(%) failed: %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Folds (child rows summarised on the parent node) and link tables.
--    fold: {"parent_table", "fk", "key", "limit", "sum_col", "order_col", "items": [cols]}
--    links: {"src": {"table","col"}, "dst": {"table","col"}, "type"}
-- ---------------------------------------------------------------------------
create or replace function public.cortex_set_fold(
  p_tenant uuid, p_parent_table text, p_parent_id uuid, p_key text, p_value jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_attrs jsonb; v_new jsonb;
begin
  select id, attributes into v_id, v_attrs
    from public.cortex_nodes
   where tenant_id = p_tenant and ref_table = p_parent_table and ref_id = p_parent_id and valid_to is null
   limit 1;
  if v_id is null then return; end if;
  v_new := coalesce(v_attrs, '{}'::jsonb) || jsonb_build_object(
    'folds', coalesce(v_attrs -> 'folds', '{}'::jsonb) || jsonb_build_object(p_key, p_value));
  if v_new is not distinct from v_attrs then return; end if;
  update public.cortex_nodes
     set attributes = v_new, recorded_at = now(), last_verified_at = now()
   where id = v_id;
  perform public.cortex_provenance_append(
    p_tenant, 'node', v_id, 'mutation', p_parent_table || ':fold:' || p_key, auth.uid());
end $$;

create or replace function public.cortex_refresh_fold(p_child_table text, p_tenant uuid, p_parent_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare f jsonb; v_items text; v_value jsonb;
begin
  select fold into f from public.cortex_mirror_registry where ref_table = p_child_table;
  if f is null or p_parent_id is null then return; end if;
  -- Lock the parent node before counting: a concurrent child write then waits
  -- and recounts after this one commits, instead of overwriting it. NO KEY
  -- UPDATE leaves the KEY SHARE an edge insert takes on the node free.
  perform 1 from public.cortex_nodes n
    where n.tenant_id = p_tenant and n.ref_table = f ->> 'parent_table'
      and n.ref_id = p_parent_id and n.valid_to is null
    for no key update;
  if not found then return; end if;
  select coalesce(string_agg(format('%L, c.%I', col, col), ', '), '') into v_items
    from jsonb_array_elements_text(f -> 'items') col;
  execute format(
    'select jsonb_build_object(''count'', (select count(*) from public.%1$I c where c.tenant_id = $1 and c.%2$I = $2)%3$s,
       ''items'', coalesce((select jsonb_agg(public.cortex_redact_attrs(jsonb_build_object(%4$s)))
          from (select * from public.%1$I c where c.tenant_id = $1 and c.%2$I = $2
                 order by c.%5$I desc limit %6$s) c), ''[]''::jsonb))',
    p_child_table, f ->> 'fk',
    case when f ? 'sum_col' then format(
      ', ''sum'', (select coalesce(sum(c.%I), 0) from public.%I c where c.tenant_id = $1 and c.%I = $2)',
      f ->> 'sum_col', p_child_table, f ->> 'fk') else '' end,
    v_items, coalesce(f ->> 'order_col', 'id'), coalesce((f ->> 'limit')::int, 50)
  ) into v_value using p_tenant, p_parent_id;
  perform public.cortex_set_fold(p_tenant, f ->> 'parent_table', p_parent_id, f ->> 'key', v_value);
end $$;

-- Statement-level AFTER trigger; transition tables are named cortex_new/cortex_old.
create or replace function public.cortex_fold_children() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_fk text; v_rows text; v_pair record;
begin
  begin
    select fold ->> 'fk' into v_fk from public.cortex_mirror_registry where ref_table = tg_table_name;
    if v_fk is null then return null; end if;
    v_rows := case tg_op
      when 'INSERT' then 'select to_jsonb(n) as j from cortex_new n'
      when 'DELETE' then 'select to_jsonb(o) as j from cortex_old o'
      else 'select to_jsonb(n) as j from cortex_new n union all select to_jsonb(o) from cortex_old o' end;
    for v_pair in execute format(
      -- Ordered, so two statements lock their parents in the same order.
      'select distinct (j ->> ''tenant_id'')::uuid as tenant_id, (j ->> %L)::uuid as parent_id from (%s) s where j ->> %L is not null order by 1, 2',
      v_fk, v_rows, v_fk)
    loop
      perform public.cortex_refresh_fold(tg_table_name, v_pair.tenant_id, v_pair.parent_id);
    end loop;
  exception when others then
    raise warning 'cortex_fold_children(%) failed: %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

create or replace function public.cortex_link_edge(p_table text, p_row jsonb, p_open boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare l jsonb; v_tenant uuid; v_src uuid; v_dst uuid; v_edge uuid;
begin
  select links into l from public.cortex_mirror_registry where ref_table = p_table;
  v_tenant := nullif(p_row ->> 'tenant_id', '')::uuid;
  if l is null or v_tenant is null then return; end if;
  v_src := public.cortex_node_current(v_tenant, l -> 'src' ->> 'table',
    nullif(p_row ->> (l -> 'src' ->> 'col'), '')::uuid);
  v_dst := public.cortex_node_current(v_tenant, l -> 'dst' ->> 'table',
    nullif(p_row ->> (l -> 'dst' ->> 'col'), '')::uuid);
  if v_src is null or v_dst is null then return; end if;
  if p_open then
    v_edge := public.cortex_upsert_edge(v_tenant, v_src, v_dst,
      (l ->> 'type')::public.cortex_edge_type, 'canonical', 1, auth.uid());
    update public.cortex_edges set attributes = jsonb_build_object('link', p_table)
     where id = v_edge and attributes is distinct from jsonb_build_object('link', p_table);
  else
    update public.cortex_edges set valid_to = now(), recorded_at = now()
     where tenant_id = v_tenant and src_id = v_src and dst_id = v_dst
       and edge_type = (l ->> 'type')::public.cortex_edge_type and valid_to is null;
  end if;
end $$;

create or replace function public.cortex_mirror_link() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or to_jsonb(old) is distinct from to_jsonb(new)) then
      perform public.cortex_link_edge(tg_table_name, to_jsonb(old), false);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.cortex_link_edge(tg_table_name, to_jsonb(new), true);
    end if;
  exception when others then
    raise warning 'cortex_mirror_link(%) failed: %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Hand-written mirrors split into apply functions (S3).
-- ---------------------------------------------------------------------------
create or replace function public.cortex_apply_account(p_row jsonb, p_op text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := (p_row ->> 'tenant_id')::uuid; v_id uuid := (p_row ->> 'id')::uuid;
begin
  if v_tenant is null or v_id is null then return null; end if;
  if p_op = 'DELETE' then
    perform public.cortex_close_node(v_tenant, 'accounts', v_id, auth.uid(), 'accounts:delete');
    return null;
  end if;
  return public.cortex_upsert_node(
    v_tenant, 'account', 'accounts', v_id, p_row ->> 'name',
    'Industry: ' || coalesce(p_row ->> 'industry', '') || ' · KYC: ' || coalesce(p_row ->> 'kyc_status', ''),
    jsonb_build_object('industry', p_row -> 'industry', 'kyc_status', p_row -> 'kyc_status'),
    auth.uid(), 'accounts:' || lower(p_op));
end $$;

create or replace function public.cortex_apply_user(p_row jsonb, p_op text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid := (p_row ->> 'tenant_id')::uuid; v_id uuid := (p_row ->> 'id')::uuid;
begin
  if v_tenant is null or v_id is null then return null; end if;
  if p_op = 'DELETE' then
    perform public.cortex_close_node(v_tenant, 'users', v_id, null, 'users:delete');
    return null;
  end if;
  return public.cortex_upsert_node(
    v_tenant, 'employee', 'users', v_id, p_row ->> 'full_name',
    'Role: ' || coalesce(p_row ->> 'role', ''),
    jsonb_build_object('role', p_row -> 'role'),
    v_id, 'users:' || lower(p_op));
end $$;

-- Stage history (spec §3.3): folds.stage_history, last 50 entries. Seeded from
-- succeeded transition receipts when the node has none yet.
create or replace function public.cortex_apply_opportunity(p_row jsonb, p_op text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (p_row ->> 'tenant_id')::uuid; v_id uuid := (p_row ->> 'id')::uuid;
  v_node uuid; v_attrs jsonb; v_hist jsonb; v_prev text; v_account text; v_title text;
  v_acct uuid; v_proj uuid; v_rep uuid;
begin
  if v_tenant is null or v_id is null then return null; end if;
  if p_op = 'DELETE' then
    perform public.cortex_close_node(v_tenant, 'opportunities', v_id, auth.uid(), 'opportunities:delete');
    return null;
  end if;

  select attributes into v_attrs from public.cortex_nodes
   where tenant_id = v_tenant and ref_table = 'opportunities' and ref_id = v_id and valid_to is null limit 1;
  v_prev := v_attrs ->> 'stage';
  v_hist := v_attrs -> 'folds' -> 'stage_history';
  if p_op = 'INSERT' then
    v_hist := jsonb_build_array(jsonb_build_object('to', p_row -> 'stage', 'at', now()));
  else
    if v_hist is null then
      select jsonb_agg(jsonb_build_object('from', r.from_stage, 'to', r.to_stage, 'at', r.completed_at)
                       order by r.completed_at, r.id)
        into v_hist
        from public.opportunity_stage_transition_requests r
       where r.tenant_id = v_tenant and r.opportunity_id = v_id and r.state = 'succeeded';
      -- No receipts: start from the stage the node last saw, so a live
      -- change below still records from -> to.
      v_hist := coalesce(v_hist, jsonb_build_array(jsonb_build_object(
        'to', coalesce(to_jsonb(v_prev), p_row -> 'stage'), 'at', p_row -> 'created_at')));
    end if;
    if p_op = 'UPDATE' and v_prev is distinct from p_row ->> 'stage'
       and (v_hist -> -1 ->> 'to') is distinct from p_row ->> 'stage' then
      v_hist := v_hist || jsonb_build_array(jsonb_build_object(
        'from', v_prev, 'to', p_row -> 'stage', 'at', now(), 'by', auth.uid()));
    end if;
  end if;
  if jsonb_array_length(v_hist) > 50 then
    select jsonb_agg(e order by n) into v_hist
      from jsonb_array_elements(v_hist) with ordinality as x(e, n)
     where n > jsonb_array_length(v_hist) - 50;
  end if;

  select a.name into v_account from public.accounts a
   where a.tenant_id = v_tenant and a.id = nullif(p_row ->> 'account_id', '')::uuid;
  v_title := public.cortex_redact_text(coalesce(
    nullif(btrim(p_row ->> 'prospective_project_name'), ''), nullif(btrim(v_account), ''),
    nullif(btrim(p_row ->> 'opportunity_type'), ''), 'Opportunity'), 300);

  v_node := public.cortex_upsert_node(
    v_tenant, 'opportunity', 'opportunities', v_id, v_title,
    'Stage: ' || coalesce(p_row ->> 'stage', '') || ' · TCV(cents): ' || coalesce(p_row ->> 'tcv_cents', '0')
      || ' · Prob: ' || coalesce(p_row ->> 'probability', '0') || '%',
    public.cortex_redact_attrs(jsonb_build_object(
      'stage', p_row -> 'stage', 'tcv_cents', p_row -> 'tcv_cents', 'gp_cents', p_row -> 'gp_cents',
      'probability', p_row -> 'probability', 'weighted_tcv_cents', p_row -> 'weighted_tcv_cents',
      'account_id', p_row -> 'account_id', 'project_id', p_row -> 'project_id', 'rep_id', p_row -> 'rep_id',
      'closing_date', p_row -> 'closing_date', 'area_sqm', p_row -> 'area_sqm',
      -- No free text: remarks and lost_reason stay in the ERP row.
      'opportunity_type', p_row -> 'opportunity_type'))
    || jsonb_build_object('folds',
         coalesce(v_attrs -> 'folds', '{}'::jsonb) || jsonb_build_object('stage_history', v_hist)),
    auth.uid(), 'opportunities:' || lower(p_op));

  v_acct := public.cortex_node_current(v_tenant, 'accounts', nullif(p_row ->> 'account_id', '')::uuid);
  v_proj := public.cortex_node_current(v_tenant, 'projects', nullif(p_row ->> 'project_id', '')::uuid);
  v_rep := public.cortex_node_current(v_tenant, 'users', nullif(p_row ->> 'rep_id', '')::uuid);
  perform public.cortex_upsert_edge(v_tenant, v_node, v_acct, 'part_of', 'canonical', 1, auth.uid());
  perform public.cortex_upsert_edge(v_tenant, v_node, v_proj, 'part_of', 'canonical', 1, auth.uid());
  perform public.cortex_upsert_edge(v_tenant, v_rep, v_node, 'owns', 'canonical', 1, auth.uid());
  if p_op <> 'INSERT' then
    perform public.cortex_close_stale_edges(v_node, 'part_of', 'accounts', array[v_acct], true);
    perform public.cortex_close_stale_edges(v_node, 'part_of', 'projects', array[v_proj], true);
    perform public.cortex_close_stale_edges(v_node, 'owns', 'users', array[v_rep], false);
  end if;
  return v_node;
end $$;

create or replace function public.cortex_apply_document(p_row jsonb, p_op text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant uuid := (p_row ->> 'tenant_id')::uuid; v_id uuid := (p_row ->> 'id')::uuid;
  v_node uuid; v_kyc text; v_title text; v_proj uuid; v_user uuid;
begin
  if v_tenant is null or v_id is null then return null; end if;
  if p_op = 'DELETE' then
    perform public.cortex_close_node(v_tenant, 'documents', v_id, auth.uid(), 'documents:delete');
    return null;
  end if;
  -- KYC artifact files never enter Cortex by name (S3).
  select min(a.artifact_type::text) into v_kyc
    from public.account_kyc_artifacts a
   where a.tenant_id = v_tenant and a.document_id = v_id;
  v_title := case when v_kyc is not null then 'KYC artifact: ' || v_kyc
    else public.cortex_redact_text(p_row ->> 'file_name', 300) end;
  if v_kyc is not null then
    -- A vector computed from the old file name must not outlive the re-title;
    -- the embed job refills a null embedding from the new title.
    update public.cortex_nodes
       set embedding = null
     where tenant_id = v_tenant and ref_table = 'documents' and ref_id = v_id and valid_to is null
       and embedding is not null and title is distinct from v_title;
  end if;
  v_node := public.cortex_upsert_node(
    v_tenant, 'document', 'documents', v_id, v_title,
    'Type: ' || coalesce(p_row ->> 'document_type', '') || ' · ' || coalesce(p_row ->> 'mime_type', ''),
    jsonb_build_object('document_type', p_row -> 'document_type', 'mime_type', p_row -> 'mime_type',
                       'size_bytes', p_row -> 'size_bytes', 'project_id', p_row -> 'project_id'),
    auth.uid(), 'documents:' || lower(p_op));
  v_proj := public.cortex_node_current(v_tenant, 'projects', nullif(p_row ->> 'project_id', '')::uuid);
  v_user := public.cortex_node_current(v_tenant, 'users', nullif(p_row ->> 'uploaded_by', '')::uuid);
  perform public.cortex_upsert_edge(v_tenant, v_node, v_proj, 'part_of', 'canonical', 1, auth.uid());
  perform public.cortex_upsert_edge(v_tenant, v_user, v_node, 'owns', 'canonical', 1, auth.uid());
  if p_op <> 'INSERT' then
    perform public.cortex_close_stale_edges(v_node, 'part_of', 'projects', array[v_proj], true);
    perform public.cortex_close_stale_edges(v_node, 'owns', 'users', array[v_user], false);
  end if;
  return v_node;
end $$;

-- Trigger wrappers keep their names; bodies delegate (defensive as before).
create or replace function public.cortex_mirror_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.cortex_apply_account(case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end, tg_op);
  exception when others then
    raise warning 'cortex_mirror_account failed for %: %', case when tg_op = 'DELETE' then old.id else new.id end, sqlerrm;
  end;
  return coalesce(new, old);
end $$;

create or replace function public.cortex_mirror_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.cortex_apply_user(case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end, tg_op);
  exception when others then
    raise warning 'cortex_mirror_user failed for %: %', case when tg_op = 'DELETE' then old.id else new.id end, sqlerrm;
  end;
  return coalesce(new, old);
end $$;

create or replace function public.cortex_mirror_opportunity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.cortex_apply_opportunity(case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end, tg_op);
  exception when others then
    raise warning 'cortex_mirror_opportunity failed for %: %', case when tg_op = 'DELETE' then old.id else new.id end, sqlerrm;
  end;
  return coalesce(new, old);
end $$;

create or replace function public.cortex_mirror_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.cortex_apply_document(case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end, tg_op);
  exception when others then
    raise warning 'cortex_mirror_document failed for %: %', case when tg_op = 'DELETE' then old.id else new.id end, sqlerrm;
  end;
  return coalesce(new, old);
end $$;

-- account_kyc_artifacts is never mirrored; it only re-titles the linked document.
create or replace function public.cortex_kyc_redact() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_doc jsonb;
begin
  begin
    select to_jsonb(d) into v_doc from public.documents d
     where d.tenant_id = new.tenant_id and d.id = new.document_id;
    if v_doc is not null then
      perform public.cortex_apply_document(v_doc, 'UPDATE');
    end if;
  exception when others then
    raise warning 'cortex_kyc_redact failed for %: %', new.id, sqlerrm;
  end;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Backfill (DB-1): one tenant per call, keyset by id within it, so a call
--    holds only that tenant's provenance and audit locks. Each row is re-read
--    under FOR SHARE when it is applied, so a live update cannot be
--    overwritten by an older image; a row a live transaction holds is skipped
--    (SKIP LOCKED) and left to that transaction's own mirror trigger. A row
--    that fails is reported in failures and does not stop the call. Call
--    until processed = 0, passing back last_id. Run by
--    scripts/cortex-backfill.mjs.
-- ---------------------------------------------------------------------------
create or replace function public.cortex_backfill(
  p_table text, p_tenant uuid, p_mode text default 'missing', p_limit integer default 200,
  p_after uuid default null,
  out processed integer, out applied integer, out skipped integer, out failures jsonb, out last_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  r public.cortex_mirror_registry; v_apply text; v_row jsonb; v_parents jsonb := '{}'::jsonb;
  v_key text; v_missing text := ''; v_id uuid;
begin
  if p_mode not in ('missing', 'all') then
    raise exception 'cortex_backfill: mode must be missing or all, got %', p_mode;
  end if;
  if p_tenant is null or p_limit is null or p_limit not between 1 and 2000 then
    raise exception 'cortex_backfill: tenant is required and limit must be 1 to 2000';
  end if;
  v_apply := case p_table
    when 'accounts' then 'cortex_apply_account' when 'users' then 'cortex_apply_user'
    when 'opportunities' then 'cortex_apply_opportunity' when 'documents' then 'cortex_apply_document' end;
  select * into r from public.cortex_mirror_registry where ref_table = p_table;
  if v_apply is null and r.ref_table is null then
    raise exception 'cortex_backfill: % is not a registry or split mirror table', p_table;
  end if;
  if p_mode = 'missing' and (v_apply is not null or r.node_type is not null) then
    v_missing := format(
      'and not exists (select 1 from public.cortex_nodes n where n.tenant_id = t.tenant_id and n.ref_table = %L and n.ref_id = t.id and n.valid_to is null)',
      p_table);
  end if;
  processed := 0; applied := 0; skipped := 0; failures := '[]'::jsonb;
  last_id := p_after;
  for v_id in execute format(
    'select t.id from public.%I t where t.tenant_id = $1 and ($2::uuid is null or t.id > $2) %s order by t.id limit $3',
    p_table, v_missing) using p_tenant, p_after, p_limit
  loop
    processed := processed + 1;
    last_id := v_id;
    begin
      execute format(
        'select to_jsonb(t) from public.%I t where t.tenant_id = $1 and t.id = $2 for share skip locked',
        p_table) into v_row using p_tenant, v_id;
      if v_row is null then
        skipped := skipped + 1;
        continue;
      end if;
      if v_apply is not null then
        execute format('select public.%I($1, ''BACKFILL'')', v_apply) using v_row;
      elsif r.node_type is not null then
        perform public.cortex_apply_row(p_table, v_row, 'BACKFILL');
      elsif r.links is not null then
        perform public.cortex_link_edge(p_table, v_row, true);
      elsif v_row ->> (r.fold ->> 'fk') is not null then
        v_parents := v_parents || jsonb_build_object(v_row ->> (r.fold ->> 'fk'), true);
      end if;
      applied := applied + 1;
    exception when others then
      failures := failures || jsonb_build_object('table', p_table, 'id', v_id, 'error', sqlerrm);
      raise warning 'cortex_backfill: public.% id % failed: %', p_table, v_id, sqlerrm;
    end;
  end loop;
  for v_key in select jsonb_object_keys(v_parents) loop
    begin
      perform public.cortex_refresh_fold(p_table, p_tenant, v_key::uuid);
    exception when others then
      failures := failures || jsonb_build_object('table', p_table, 'id', v_key, 'error', 'fold: ' || sqlerrm);
      raise warning 'cortex_backfill: public.% fold parent % failed: %', p_table, v_key, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7b. Scrub (SEC-H1): rewrite EVERY node of a mirrored table, closed nodes and
--     nodes whose source row is gone included, to what the current mirror
--     keeps. The backfill cannot: it walks live source rows only.
--     * Registry tables keep only attr_cols (and attr_paths) plus folds;
--       titles and summaries re-render from the kept attributes, or stay
--       redacted.
--     * users, accounts, opportunities drop email and primary_email;
--       opportunities also drop the free-text lost_reason and remarks.
--     * documents linked to a KYC artifact, or whose row is gone, lose their
--       file-name title.
--     * Every string is redacted; a node whose title or summary changes loses
--       its embedding (the embed job refills it from the new text).
--     One tenant per call, keyset by node id. Each node is re-read FOR UPDATE
--     SKIP LOCKED: a node a live mirror holds is skipped (that mirror rewrites
--     it) and a re-run picks up anything left. Call until processed = 0.
-- ---------------------------------------------------------------------------
create or replace function public.cortex_scrub_nodes(
  p_table text, p_tenant uuid, p_limit integer default 200, p_after uuid default null,
  out processed integer, out changed integer, out skipped integer, out failures jsonb, out last_id uuid
)
language plpgsql security definer set search_path = '' as $$
declare
  r public.cortex_mirror_registry; n record; v_id uuid; v_keep text[];
  v_attrs jsonb; v_title text; v_summary text; v_kyc text;
begin
  if p_tenant is null or p_limit is null or p_limit not between 1 and 2000 then
    raise exception 'cortex_scrub_nodes: tenant is required and limit must be 1 to 2000';
  end if;
  select * into r from public.cortex_mirror_registry where ref_table = p_table;
  if r.node_type is null and p_table not in ('users', 'accounts', 'opportunities', 'documents') then
    raise exception 'cortex_scrub_nodes: % has no node mirror', p_table;
  end if;
  v_keep := coalesce(r.attr_cols, '{}')
    || array(select regexp_replace(p, '^.*\.', '') from unnest(coalesce(r.attr_paths, '{}')) p);
  processed := 0; changed := 0; skipped := 0; failures := '[]'::jsonb;
  last_id := p_after;
  for v_id in
    select c.id from public.cortex_nodes c
     where c.tenant_id = p_tenant and c.ref_table = p_table and (p_after is null or c.id > p_after)
     order by c.id limit p_limit
  loop
    processed := processed + 1;
    last_id := v_id;
    begin
      select c.ref_id, c.title, c.summary, coalesce(c.attributes, '{}'::jsonb) as attributes into n
        from public.cortex_nodes c where c.id = v_id
        for update skip locked;
      if not found then
        skipped := skipped + 1;
        continue;
      end if;
      if r.node_type is not null then
        select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_attrs
          from jsonb_each(n.attributes)
         where key = any(v_keep) and jsonb_typeof(value) not in ('object', 'array');
      else
        v_attrs := n.attributes - 'email' - 'primary_email' - 'folds';
        if p_table = 'opportunities' then
          v_attrs := v_attrs - 'lost_reason' - 'remarks';
        end if;
      end if;
      v_attrs := public.cortex_redact_attrs(v_attrs)
        || case when n.attributes ? 'folds' then jsonb_build_object('folds', n.attributes -> 'folds')
                else '{}'::jsonb end;
      v_title := public.cortex_redact_text(n.title, 300);
      v_summary := public.cortex_redact_text(n.summary, 300);
      if r.node_type is not null then
        -- No template: the same fallback as cortex_apply_row. A template column
        -- the attributes do not keep (name, description) cannot re-render
        -- here; the old title came from that same column (the legacy mirror,
        -- 20260614052136, used it too), so it stays, redacted.
        v_title := coalesce(
          public.cortex_redact_text(public.cortex_render_tpl(r.title_tpl, v_attrs), 300),
          case when coalesce(r.title_tpl, '') = ''
               then initcap(replace(r.node_type::text, '_', ' ')) || ' ' || left(n.ref_id::text, 8) end,
          v_title);
        v_summary := coalesce(public.cortex_redact_text(public.cortex_render_tpl(r.summary_tpl, v_attrs), 300), v_summary);
      elsif p_table = 'documents' then
        select min(a.artifact_type::text) into v_kyc
          from public.account_kyc_artifacts a
         where a.tenant_id = p_tenant and a.document_id = n.ref_id;
        if v_kyc is not null then
          v_title := 'KYC artifact: ' || v_kyc;
        elsif not exists (select 1 from public.documents d where d.tenant_id = p_tenant and d.id = n.ref_id) then
          -- The row (and any KYC link) is gone; its file name may have been KYC.
          v_title := 'Deleted document';
        end if;
      end if;
      if v_title is distinct from n.title or v_summary is distinct from n.summary
         or v_attrs is distinct from n.attributes then
        update public.cortex_nodes c
           set title = v_title, summary = v_summary, attributes = v_attrs, recorded_at = now(),
               embedding = case when v_title is distinct from n.title or v_summary is distinct from n.summary
                                then null else c.embedding end
         where c.id = v_id;
        perform public.cortex_provenance_append(p_tenant, 'node', v_id, 'mutation', p_table || ':scrub', null);
        changed := changed + 1;
      end if;
    exception when others then
      failures := failures || jsonb_build_object('table', p_table, 'id', v_id, 'error', sqlerrm);
      raise warning 'cortex_scrub_nodes: node % of public.% failed: %', v_id, p_table, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 8. S2: deny-by-default database read check, by read group (spec §5).
--    Role lists copied from packages/shared-types/src/authorization.ts.
-- ---------------------------------------------------------------------------
create or replace function public.auth_can_read_cortex_node_type(
  p_node_type public.cortex_node_type
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case a.read_group
      when 'tenant' then true
      when 'finance' then u.role in ('owner', 'admin', 'finance')
      when 'inventory' then public.auth_can_read_inventory()
      when 'budget' then public.auth_can_read_budgets()
      when 'kyc' then u.role in ('owner', 'admin', 'finance', 'viewer')
      when 'estimating' then u.role in ('owner', 'admin', 'commercial', 'estimator', 'viewer')
      when 'rfq' then u.role in ('owner', 'admin', 'commercial', 'finance', 'procurement')
      when 'rate_card' then u.role in ('owner', 'admin', 'commercial', 'viewer')
      when 'procurement' then u.role in ('owner', 'admin', 'commercial', 'sd_pm_pe', 'pm', 'procurement', 'viewer')
      when 'catalogue' then u.role in ('owner', 'admin', 'commercial', 'estimator', 'sd_pm_pe', 'pm', 'procurement', 'viewer')
      else false
    end
    from public.cortex_node_type_access a
    left join lateral (
      select app_user.role::text as role
        from public.users app_user
       where app_user.id = auth.uid()
         and app_user.tenant_id = public.auth_tenant_id()
    ) u on true
    where a.node_type = p_node_type
  ), false)
$$;

revoke execute on function public.auth_can_read_cortex_node_type(public.cortex_node_type)
  from public, anon;
grant execute on function public.auth_can_read_cortex_node_type(public.cortex_node_type)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. S1: registry rows for the 23 generic-mirror tables (spec §3.2). Each
--    attr_cols list is literal: a column is copied only when it is named here.
--    Left out: personal names, contact details, ids of people or submissions,
--    free text (description, location, notes, remarks, *_reason) and
--    reference numbers. Titles use the record's own name or code column,
--    redacted, and only NOT NULL columns, so a title never falls back to an
--    older one. Every named column must exist, or the migration fails.
--    Registry rows are written first; the trigger swap runs last (step 9b).
-- ---------------------------------------------------------------------------
create temporary table cortex_coverage_batch1 on commit drop as
select * from (values
  ('vendors', 'vendor', 'cortex_mirror_g', '{name}', '',
    array['created_at'], 10),
  ('cost_codes', 'cost_code', 'cortex_mirror_budget_cost_code', '{name}', 'Category: {category}',
    array['parent_id', 'code', 'category', 'is_active', 'created_at'], 10),
  ('material_items', 'material', 'cortex_mirror_g', '{description}', 'Category: {category}',
    array['code', 'category', 'unit', 'base_uom_id', 'inventory_tracked', 'wastage_bps', 'is_active', 'created_at'], 10),
  ('contacts', 'contact', 'cortex_mirror_g', '{full_name}', 'Role Title: {role_title}',
    array['account_id', 'role_title', 'is_primary', 'created_at'], 20),
  ('scope_items', 'scope_item', 'cortex_mirror_g', '{description}', '',
    array['project_id', 'code', 'unit', 'quantity', 'unit_cost_cents', 'line_total_cents', 'sort_order', 'created_at'], 20),
  ('permits', 'permit', 'cortex_mirror_g', '{permit_type}', 'Status: {status}',
    array['project_id', 'permit_type', 'status', 'submitted_at', 'expected_approval_at', 'expected_return_at',
          'approved_at', 'actual_return_at', 'refunded_at', 'lgu_name', 'duration_profile_id', 'min_duration_days',
          'expected_duration_days', 'max_duration_days', 'escalation_at', 'escalated_at', 'last_status_change_at',
          'created_at'], 20),
  ('variation_orders', 'change_order', 'cortex_mirror_g', '{vo_number}', 'Status: {status}',
    array['project_id', 'vo_number', 'change_type', 'cost_impact_cents', 'time_impact_days', 'status', 'signed_at',
          'created_at'], 20),
  ('progress_claims', 'claim', 'cortex_mirror_g', '{claim_number}', 'Status: {status}',
    array['project_id', 'claim_number', 'milestone_pct', 'amount_cents', 'status', 'submitted_at', 'certified_at',
          'handed_over_to_finance_at', 'invoice_id', 'paid_at', 'rejected_at', 'created_at'], 20),
  ('warranty_tickets', 'ticket', 'cortex_mirror_g', '{ticket_number}', 'Status: {status}',
    array['project_id', 'account_id', 'ticket_number', 'category', 'status', 'acknowledged_at', 'scheduled_at',
          'closed_at', 'sla_breached_ack', 'sla_breached_schedule', 'created_at'], 20),
  ('delivery_schedules', 'delivery', 'cortex_mirror_g', '', 'Status: {status}',
    array['purchase_order_id', 'status', 'scheduled_date', 'site_prepared_at', 'received_at', 'rejected_at',
          'cancelled_at', 'accepted_at', 'created_at'], 20),
  ('rfqs', 'rfq', 'cortex_mirror_g', '', 'Status: {status}',
    array['bom_id', 'status', 'created_at'], 20),
  ('contracts', 'contract', 'cortex_mirror_g', '', 'Status: {status}',
    array['project_id', 'bom_id', 'status', 'signed_at', 'created_at'], 20),
  ('certificates_of_completion', 'certificate', 'cortex_mirror_g', '', 'Status: {status}',
    array['project_id', 'status', 'signed_at', 'warranty_period_starts_at', 'warranty_period_ends_at', 'created_at'], 20),
  ('punchlist_items', 'punchlist', 'cortex_mirror_g', '{description}', 'Status: {status}',
    array['project_id', 'trade', 'priority', 'status', 'due_date', 'pe_signed_off_at', 'closed_at', 'created_at',
          'source_handoff_id'], 20),
  ('site_inspections', 'inspection', 'cortex_mirror_g', '', 'Status: {status}',
    array['opportunity_id', 'status', 'submitted_at', 'created_at'], 20),
  ('design_files', 'design', 'cortex_mirror_g', '{name}', 'File Type: {file_type}',
    array['opportunity_id', 'file_type', 'is_ready_for_presentation', 'is_client_approved', 'client_approved_at',
          'created_at'], 20),
  ('change_requests', 'change_request', 'cortex_mirror_g', '{description}', 'Priority: {priority}',
    array['opportunity_id', 'priority', 'affected_design_file_id', 'resolved_at', 'created_at'], 20),
  ('master_schedules', 'schedule_event', 'cortex_mirror_g', '{name}', '',
    array['project_id', 'imported_at'], 20),
  ('weekly_reports', 'weekly_report', 'cortex_mirror_g', '', '',
    array['project_id', 'week_ending', 'generated_at', 'created_at'], 20),
  ('pre_con_checklist_items', 'task', 'cortex_mirror_g', '{title}', 'Status: {status}',
    array['checklist_id', 'owner_role', 'sla_days', 'status', 'depends_on_item_id', 'completed_at',
          'sla_clock_started_at', 'sla_breached_at', 'sort_order', 'created_at'], 20),
  ('cost_entries', 'cost_line', 'cortex_mirror_g', '{description}', 'Cost Category: {cost_category}',
    array['project_id', 'bom_line_item_id', 'po_line_item_id', 'cost_code_id', 'voided_at', 'cost_category',
          'cost_source', 'amount_cents', 'quantity', 'unit', 'incurred_at', 'created_at'], 20),
  ('project_budgets', 'project_budget', 'cortex_mirror_project_budget', 'Budget revision {revision}', 'Status: {status}',
    array['project_id', 'source_bom_id', 'supersedes_budget_id', 'revision', 'status', 'control_mode',
          'commitment_tolerance_bps', 'currency', 'effective_from', 'total_budget_cents', 'original_gp_margin_bps',
          'submitted_at', 'commercial_approved_at', 'finance_approved_at', 'rejected_at', 'created_at'], 20),
  -- internal_number is null until posting, and only drafts can be deleted.
  ('stock_movements', 'stock_movement', 'cortex_mirror_stock_movement', 'Stock movement {movement_type} {movement_date}',
    'Status: {status}',
    array['movement_type', 'status', 'internal_number', 'source_warehouse_id', 'target_warehouse_id', 'project_id',
          'movement_date', 'currency', 'posting_journal_entry_id', 'reversal_journal_entry_id', 'posted_at',
          'reversed_at', 'created_at'], 20)
) as t(tbl, node_type, old_trigger, title_tpl, summary_tpl, attr_cols, ord);

do $$
declare
  r record; v_has text[]; v_edges jsonb; v_owner jsonb; v_missing text[];
begin
  for r in select * from pg_temp.cortex_coverage_batch1 loop
    if to_regclass(format('public.%I', r.tbl)) is null then
      raise exception 'cortex coverage: expected table public.%', r.tbl;
    end if;
    -- Edge columns must be uuid; a text cast failure would silence the mirror.
    select coalesce(array_agg(column_name::text), '{}') into v_has
      from information_schema.columns
     where table_schema = 'public' and table_name = r.tbl and data_type = 'uuid';

    v_edges := '[]'::jsonb;
    if 'project_id' = any(v_has) then
      v_edges := v_edges || jsonb_build_object('cols', jsonb_build_array('project_id'), 'table', 'projects', 'type', 'part_of', 'dir', 'out');
    end if;
    if 'account_id' = any(v_has) then
      v_edges := v_edges || jsonb_build_object('cols', jsonb_build_array('account_id'), 'table', 'accounts', 'type', 'part_of', 'dir', 'out');
    end if;
    if 'opportunity_id' = any(v_has) then
      v_edges := v_edges || jsonb_build_object('cols', jsonb_build_array('opportunity_id'), 'table', 'opportunities', 'type', 'part_of', 'dir', 'out');
    end if;
    if 'bom_id' = any(v_has) then
      v_edges := v_edges || jsonb_build_object('cols', jsonb_build_array('bom_id'), 'table', 'boms', 'type', 'derived_from', 'dir', 'out');
    end if;
    if 'vendor_id' = any(v_has) then
      v_edges := v_edges || jsonb_build_object('cols', jsonb_build_array('vendor_id'), 'table', 'vendors', 'type', 'supplies', 'dir', 'in');
    end if;
    select jsonb_agg(col order by array_position(array['created_by', 'uploaded_by', 'submitted_by'], col))
      into v_owner
      from unnest(array['created_by', 'uploaded_by', 'submitted_by']) col
     where col = any(v_has);
    if v_owner is not null then
      v_edges := v_edges || jsonb_build_object('cols', v_owner, 'table', 'users', 'type', 'owns', 'dir', 'in');
    end if;
    if r.tbl = 'punchlist_items' then
      v_edges := v_edges || jsonb_build_object(
        'cols', jsonb_build_array('source_handoff_id'),
        'via', jsonb_build_object('table', 'quality_hold_point_punchlist_handoffs', 'col', 'quality_hold_point_id'),
        'table', 'quality_hold_points', 'type', 'derived_from', 'dir', 'out');
    elsif r.tbl = 'pre_con_checklist_items' then
      v_edges := v_edges || jsonb_build_object(
        'cols', jsonb_build_array('checklist_id'),
        'via', jsonb_build_object('table', 'pre_con_checklists', 'col', 'project_id'),
        'table', 'projects', 'type', 'part_of', 'dir', 'out');
    end if;

    -- Every column the row names (attributes, templates, edges) must exist.
    select coalesce(array_agg(distinct c), '{}') into v_missing
      from (
        select unnest(r.attr_cols) as c
        union all
        select (regexp_matches(r.title_tpl || ' ' || r.summary_tpl, '\{([a-z0-9_]+)\}', 'g'))[1]
        union all
        select jsonb_array_elements_text(e -> 'cols') from jsonb_array_elements(v_edges) e
      ) named
     where not exists (
       select 1 from information_schema.columns ic
        where ic.table_schema = 'public' and ic.table_name = r.tbl and ic.column_name = named.c);
    if cardinality(v_missing) > 0 then
      raise exception 'cortex coverage: public.% has no column(s) %', r.tbl, v_missing;
    end if;

    insert into public.cortex_mirror_registry(
      ref_table, node_type, title_tpl, summary_tpl, attr_cols, edges, backfill_order)
    values (
      r.tbl, r.node_type::public.cortex_node_type, r.title_tpl, r.summary_tpl, r.attr_cols, v_edges, r.ord)
    on conflict (ref_table) do update
      set node_type = excluded.node_type, title_tpl = excluded.title_tpl,
          summary_tpl = excluded.summary_tpl, attr_cols = excluded.attr_cols,
          edges = excluded.edges, backfill_order = excluded.backfill_order;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 9b. Trigger swap, last: each DROP TRIGGER takes ACCESS EXCLUSIVE on its
--     table until COMMIT, so no catalog work runs after the first one.
-- ---------------------------------------------------------------------------
do $$
declare r record; v_trigger name;
begin
  for r in select tbl, old_trigger from pg_temp.cortex_coverage_batch1 order by tbl loop
    execute format('drop trigger if exists %I on public.%I', r.old_trigger, r.tbl);
    -- Also under any other name: a leftover generic trigger would keep leaking.
    for v_trigger in
      select t.tgname from pg_catalog.pg_trigger t
       where t.tgrelid = format('public.%I', r.tbl)::regclass and not t.tgisinternal
         and t.tgfoid = 'public.cortex_mirror_generic()'::regprocedure
    loop
      execute format('drop trigger %I on public.%I', v_trigger, r.tbl);
    end loop;
    execute format('drop trigger if exists cortex_mirror_r on public.%I', r.tbl);
    execute format(
      'create trigger cortex_mirror_r after insert or update or delete on public.%I for each row execute function public.cortex_mirror_row()',
      r.tbl);
  end loop;
end
$$;

drop trigger if exists cortex_kyc_redact on public.account_kyc_artifacts;
create trigger cortex_kyc_redact
after insert or update of document_id on public.account_kyc_artifacts
for each row when (new.document_id is not null)
execute function public.cortex_kyc_redact();

-- ---------------------------------------------------------------------------
-- 10. Re-lock the RPC surface for every cortex_* function (20260726192929).
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'cortex\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end
$$;

commit;
