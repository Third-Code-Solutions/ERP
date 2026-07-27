-- Forward-only Cortex/cost hardening.
--
-- Trust boundary:
--   * anon receives no direct access to these tables.
--   * authenticated clients receive only the operations required by RLS.
--   * service_role and the database owner retain privileged server workflows.
--   * graph/provenance writes remain trigger/server-owned.

-- ---------------------------------------------------------------------------
-- 1. Validate cost domain invariants without allowing new invalid rows while
--    existing rows are scanned. NOT VALID starts enforcing each check for new
--    writes immediately; VALIDATE then proves all existing rows comply.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cost_entries'::regclass
      and conname = 'cost_entries_amount_nonnegative'
  ) then
    alter table public.cost_entries
      add constraint cost_entries_amount_nonnegative
      check (amount_cents >= 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cost_entries'::regclass
      and conname = 'cost_entries_quantity_positive'
  ) then
    alter table public.cost_entries
      add constraint cost_entries_quantity_positive
      check (quantity > 0) not valid;
  end if;
end
$$;

alter table public.cost_entries
  validate constraint cost_entries_amount_nonnegative;
alter table public.cost_entries
  validate constraint cost_entries_quantity_positive;

create unique index if not exists ux_bom_line_items_tenant_id_id
  on public.bom_line_items(tenant_id, id);
create unique index if not exists ux_po_line_items_tenant_id_id
  on public.po_line_items(tenant_id, id);
create index if not exists idx_cost_entries_bom_line_item_id
  on public.cost_entries(bom_line_item_id);
create index if not exists idx_cost_entries_po_line_item_id
  on public.cost_entries(po_line_item_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cost_entries'::regclass
      and conname = 'cost_entries_bom_line_tenant_fk'
  ) then
    alter table public.cost_entries
      add constraint cost_entries_bom_line_tenant_fk
      foreign key (tenant_id, bom_line_item_id)
      references public.bom_line_items(tenant_id, id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cost_entries'::regclass
      and conname = 'cost_entries_po_line_tenant_fk'
  ) then
    alter table public.cost_entries
      add constraint cost_entries_po_line_tenant_fk
      foreign key (tenant_id, po_line_item_id)
      references public.po_line_items(tenant_id, id)
      on delete restrict
      not valid;
  end if;
end
$$;

alter table public.cost_entries
  validate constraint cost_entries_bom_line_tenant_fk;
alter table public.cost_entries
  validate constraint cost_entries_po_line_tenant_fk;

-- ---------------------------------------------------------------------------
-- 2. Serialize each tenant's provenance appends. A transaction-level advisory
--    lock prevents concurrent writes from choosing the same previous hash.
--    hashtextextended provides a stable 64-bit key; cross-tenant writes remain
--    concurrent except for a vanishingly unlikely hash collision.
-- ---------------------------------------------------------------------------

create or replace function public.cortex_provenance_append(
  p_tenant uuid,
  p_subject_kind cortex_subject_kind,
  p_subject_id uuid,
  p_origin cortex_provenance_origin,
  p_origin_ref text,
  p_actor uuid
) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prev text;
  v_hash text;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('cortex_provenance:' || p_tenant::text, 0)
  );

  select hash
    into v_prev
    from public.cortex_provenance
   where tenant_id = p_tenant
   order by id desc
   limit 1;

  if v_prev is null then
    v_prev := 'genesis';
  end if;

  v_hash := encode(
    digest(
      v_prev
        || p_subject_kind::text
        || coalesce(p_subject_id::text, '')
        || p_origin::text
        || coalesce(p_origin_ref, '')
        || clock_timestamp()::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.cortex_provenance(
    tenant_id,
    subject_kind,
    subject_id,
    origin,
    origin_ref,
    actor_id,
    prev_hash,
    hash
  )
  values (
    p_tenant,
    p_subject_kind,
    p_subject_id,
    p_origin,
    p_origin_ref,
    p_actor,
    v_prev,
    v_hash
  )
  returning id into v_id;

  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Harden the tenant helper and audit chain. Audit rows are trigger/server
--    authored. Per-tenant advisory locking prevents concurrent forks.
-- ---------------------------------------------------------------------------

alter function public.auth_tenant_id()
  set search_path = public, auth;

create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_action text;
  v_entity_id uuid;
  v_tenant_id uuid;
  v_diff jsonb;
  v_prev_hash text;
  v_created_at timestamptz := clock_timestamp();
begin
  if tg_op = 'INSERT' then
    v_action := 'create';
    v_entity_id := new.id;
    v_tenant_id := new.tenant_id;
    v_diff := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_entity_id := new.id;
    v_tenant_id := new.tenant_id;
    v_diff := public.jsonb_diff(to_jsonb(old), to_jsonb(new));
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_entity_id := old.id;
    v_tenant_id := old.tenant_id;
    v_diff := to_jsonb(old);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('audit_log:' || v_tenant_id::text, 0)
  );

  select hash
    into v_prev_hash
    from public.audit_log
   where tenant_id = v_tenant_id
   order by id desc
   limit 1;

  if v_prev_hash is null then
    v_prev_hash := 'genesis';
  end if;

  insert into public.audit_log(
    tenant_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    diff,
    prev_hash,
    hash,
    created_at
  )
  values (
    v_tenant_id,
    auth.uid(),
    tg_table_name,
    v_entity_id,
    v_action,
    v_diff,
    v_prev_hash,
    encode(
      digest(
        v_prev_hash
          || tg_table_name
          || v_entity_id::text
          || v_action
          || v_created_at::text,
        'sha256'
      ),
      'hex'
    ),
    v_created_at
  );

  return coalesce(new, old);
end
$$;

drop policy if exists audit_log_tenant_read
  on public.audit_log;
drop policy if exists audit_log_tenant_insert
  on public.audit_log;
drop policy if exists audit_log_no_update
  on public.audit_log;
drop policy if exists audit_log_no_delete
  on public.audit_log;

create policy audit_log_tenant_read
  on public.audit_log
  for select
  to authenticated
  using (tenant_id = auth_tenant_id());

-- ---------------------------------------------------------------------------
-- 4. Replace tenant-only chat policies with tenant + authenticated-user
--    ownership. Message access derives from the parent conversation.
-- ---------------------------------------------------------------------------

drop policy if exists cortex_conversations_tenant_read
  on public.cortex_conversations;
drop policy if exists cortex_conversations_tenant_write
  on public.cortex_conversations;
drop policy if exists cortex_conversations_tenant_update
  on public.cortex_conversations;
drop policy if exists cortex_conversations_tenant_delete
  on public.cortex_conversations;

create policy cortex_conversations_owner_read
  on public.cortex_conversations
  for select
  to authenticated
  using (
    tenant_id = auth_tenant_id()
    and user_id = (select auth.uid())
  );

create policy cortex_conversations_owner_insert
  on public.cortex_conversations
  for insert
  to authenticated
  with check (
    tenant_id = auth_tenant_id()
    and user_id = (select auth.uid())
  );

create policy cortex_conversations_owner_update
  on public.cortex_conversations
  for update
  to authenticated
  using (
    tenant_id = auth_tenant_id()
    and user_id = (select auth.uid())
  )
  with check (
    tenant_id = auth_tenant_id()
    and user_id = (select auth.uid())
  );

drop policy if exists cortex_messages_tenant_read
  on public.cortex_messages;
drop policy if exists cortex_messages_tenant_write
  on public.cortex_messages;
drop policy if exists cortex_messages_tenant_update
  on public.cortex_messages;
drop policy if exists cortex_messages_tenant_delete
  on public.cortex_messages;

create policy cortex_messages_parent_owner_read
  on public.cortex_messages
  for select
  to authenticated
  using (
    tenant_id = auth_tenant_id()
    and exists (
      select 1
      from public.cortex_conversations as conversation
      where conversation.id = cortex_messages.conversation_id
        and conversation.tenant_id = cortex_messages.tenant_id
        and conversation.user_id = (select auth.uid())
    )
  );

create policy cortex_messages_parent_owner_insert
  on public.cortex_messages
  for insert
  to authenticated
  with check (
    tenant_id = auth_tenant_id()
    and exists (
      select 1
      from public.cortex_conversations as conversation
      where conversation.id = cortex_messages.conversation_id
        and conversation.tenant_id = cortex_messages.tenant_id
        and conversation.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Graph/provenance are readable tenant projections, never client-authored.
-- ---------------------------------------------------------------------------

drop policy if exists cortex_nodes_tenant_read
  on public.cortex_nodes;
drop policy if exists cortex_nodes_tenant_insert
  on public.cortex_nodes;
drop policy if exists cortex_nodes_tenant_update
  on public.cortex_nodes;
drop policy if exists cortex_nodes_tenant_delete
  on public.cortex_nodes;

create policy cortex_nodes_tenant_read
  on public.cortex_nodes
  for select
  to authenticated
  using (tenant_id = auth_tenant_id());

drop policy if exists cortex_edges_tenant_read
  on public.cortex_edges;
drop policy if exists cortex_edges_tenant_insert
  on public.cortex_edges;
drop policy if exists cortex_edges_tenant_update
  on public.cortex_edges;
drop policy if exists cortex_edges_tenant_delete
  on public.cortex_edges;

create policy cortex_edges_tenant_read
  on public.cortex_edges
  for select
  to authenticated
  using (tenant_id = auth_tenant_id());

drop policy if exists cortex_provenance_tenant_read
  on public.cortex_provenance;
drop policy if exists cortex_provenance_tenant_insert
  on public.cortex_provenance;
drop policy if exists cortex_provenance_no_update
  on public.cortex_provenance;
drop policy if exists cortex_provenance_no_delete
  on public.cortex_provenance;

create policy cortex_provenance_tenant_read
  on public.cortex_provenance
  for select
  to authenticated
  using (tenant_id = auth_tenant_id());

-- Cost reads remain tenant-scoped. Writes also require the same roles as the
-- application capability gate, a same-tenant project, the current actor, and a
-- manual source. System-derived rows remain service-owned.
drop policy if exists cost_entries_tenant_read
  on public.cost_entries;
drop policy if exists cost_entries_tenant_insert
  on public.cost_entries;
drop policy if exists cost_entries_tenant_update
  on public.cost_entries;
drop policy if exists cost_entries_tenant_delete
  on public.cost_entries;

create policy cost_entries_tenant_read
  on public.cost_entries
  for select
  to authenticated
  using (tenant_id = auth_tenant_id());

create policy cost_entries_tenant_insert
  on public.cost_entries
  for insert
  to authenticated
  with check (
    tenant_id = auth_tenant_id()
    and created_by = (select auth.uid())
    and cost_source = 'manual'
    and exists (
      select 1
      from public.projects as project
      where project.id = cost_entries.project_id
        and project.tenant_id = cost_entries.tenant_id
    )
    and exists (
      select 1
      from public.users as actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = cost_entries.tenant_id
        and actor.role::text = any (
          array['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'finance']
        )
    )
  );

create policy cost_entries_tenant_update
  on public.cost_entries
  for update
  to authenticated
  using (
    tenant_id = auth_tenant_id()
    and cost_source = 'manual'
    and exists (
      select 1
      from public.users as actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = cost_entries.tenant_id
        and actor.role::text = any (
          array['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'finance']
        )
    )
  )
  with check (
    tenant_id = auth_tenant_id()
    and cost_source = 'manual'
    and exists (
      select 1
      from public.projects as project
      where project.id = cost_entries.project_id
        and project.tenant_id = cost_entries.tenant_id
    )
    and exists (
      select 1
      from public.users as actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = cost_entries.tenant_id
        and actor.role::text = any (
          array['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'finance']
        )
    )
  );

create policy cost_entries_tenant_delete
  on public.cost_entries
  for delete
  to authenticated
  using (
    tenant_id = auth_tenant_id()
    and cost_source = 'manual'
    and exists (
      select 1
      from public.users as actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = cost_entries.tenant_id
        and actor.role::text = any (
          array['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'finance']
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Explicit Data API privileges. Revoke broad default grants first.
-- ---------------------------------------------------------------------------

revoke all privileges on table
  public.cortex_conversations,
  public.cortex_messages,
  public.cortex_nodes,
  public.cortex_edges,
  public.cortex_provenance,
  public.audit_log,
  public.cost_entries
from public, anon, authenticated;

revoke all privileges
  on sequence
    public.cortex_provenance_id_seq,
    public.audit_log_id_seq
  from public, anon, authenticated;

grant select
  on table public.cortex_conversations
  to authenticated;
grant insert (tenant_id, user_id, title)
  on table public.cortex_conversations
  to authenticated;
grant update (title, updated_at)
  on table public.cortex_conversations
  to authenticated;

grant select
  on table public.cortex_messages
  to authenticated;
grant insert (tenant_id, conversation_id, role, content, citations)
  on table public.cortex_messages
  to authenticated;

grant select
  on table
    public.cortex_nodes,
    public.cortex_edges,
    public.cortex_provenance,
    public.audit_log
  to authenticated;

grant select, delete
  on table public.cost_entries
  to authenticated;
grant insert (
  tenant_id,
  project_id,
  created_by,
  cost_category,
  description,
  amount_cents,
  quantity,
  unit,
  incurred_at,
  reference_number,
  notes
)
  on table public.cost_entries
  to authenticated;
grant update (
  cost_category,
  description,
  amount_cents,
  quantity,
  unit,
  incurred_at,
  reference_number,
  notes,
  updated_at
)
  on table public.cost_entries
  to authenticated;

grant all privileges
  on table
    public.cortex_conversations,
    public.cortex_messages,
    public.cortex_nodes,
    public.cortex_edges,
    public.cortex_provenance,
    public.audit_log,
    public.cost_entries
  to service_role;

grant usage, select, update
  on sequence
    public.cortex_provenance_id_seq,
    public.audit_log_id_seq
  to service_role;

-- SECURITY DEFINER helpers remain unavailable to untrusted RPC callers.
-- Trusted service_role calls and trigger/owner execution stay supported.
do $$
declare
  function_record record;
begin
  for function_record in
    select procedure.oid::regprocedure as signature
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and (
        procedure.proname like 'cortex\_%'
        or procedure.proname = 'handle_new_user'
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      function_record.signature
    );
    execute format(
      'grant execute on function %s to service_role',
      function_record.signature
    );
  end loop;
end
$$;

revoke execute on function public.audit_log_trigger()
  from public, anon, authenticated;
revoke execute on function public.auth_tenant_id()
  from public;
grant execute on function public.auth_tenant_id()
  to anon, authenticated, service_role;
grant execute on function public.audit_log_trigger()
  to service_role;
