-- WO-02 proposal only. Do not apply to the production project until a
-- disposable Supabase branch or restored staging database has passed the
-- migration, RLS, audit, rollback, and advisor gates.
--
-- Purpose:
--   1. Extend the existing audit chain to every tenant-scoped mutable table.
--   2. Preserve numeric/composite primary keys without changing downstream
--      foreign keys: entity_key is the source row key; entity_id remains a
--      UUID-compatible lookup key for the existing audit contract.
--   3. Persist tenant holiday data so changing a holiday does not require a
--      web deployment.

-- ---------------------------------------------------------------------------
-- 1. Audit identity for numeric and composite primary keys
-- ---------------------------------------------------------------------------

alter table public.audit_log
  add column if not exists entity_key text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.audit_log'::regclass
       and conname = 'audit_log_entity_key_nonempty'
  ) then
    alter table public.audit_log
      add constraint audit_log_entity_key_nonempty
      check (entity_key is null or length(btrim(entity_key)) > 0);
  end if;
end
$$;

create or replace function public.audit_entity_uuid(
  p_entity_type text,
  p_entity_key text
)
returns uuid
language sql
immutable
strict
parallel safe
as $$
  select md5('audit:' || p_entity_type || ':' || p_entity_key)::uuid;
$$;

-- The existing function only supports UUID `id` columns. This version keeps
-- that identity for normal rows and deterministically maps bigint/composite
-- keys into entity_id while retaining the exact source key in entity_key.
create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_action text;
  v_row jsonb;
  v_old_row jsonb;
  v_entity_key text;
  v_entity_id uuid;
  v_tenant_id uuid;
  v_diff jsonb;
  v_prev_hash text;
  v_created_at timestamptz := clock_timestamp();
begin
  v_old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_row := case when tg_op = 'DELETE' then v_old_row else to_jsonb(new) end;
  v_action := case tg_op
    when 'INSERT' then 'create'
    when 'UPDATE' then 'update'
    when 'DELETE' then 'delete'
  end;

  v_tenant_id := nullif(v_row ->> 'tenant_id', '')::uuid;
  v_entity_key := coalesce(
    nullif(v_row ->> 'id', ''),
    nullif(concat_ws(':', v_row ->> 'tenant_id', v_row ->> 'sequence_key'), ''),
    nullif(v_row ->> 'subject_id', '')
  );

  if v_tenant_id is null or v_entity_key is null then
    raise exception 'Audit identity missing for %.%', tg_table_schema, tg_table_name;
  end if;

  if v_entity_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_entity_id := v_entity_key::uuid;
  else
    v_entity_id := public.audit_entity_uuid(tg_table_name, v_entity_key);
  end if;

  v_diff := case
    when tg_op = 'UPDATE' then public.jsonb_diff(v_old_row, v_row)
    else v_row
  end;

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
    entity_key,
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
    v_entity_key,
    v_action,
    v_diff,
    v_prev_hash,
    encode(
      digest(
        v_prev_hash
          || tg_table_name
          || v_entity_key
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

do $$
declare
  table_name text;
begin
  foreach table_name in array ARRAY[
    'cortex_conversations',
    'cortex_edges',
    'cortex_messages',
    'cortex_nodes',
    'cortex_provenance',
    'documents',
    'embeddings',
    'financial_sequences',
    'notification_deliveries',
    'notification_outbox',
    'po_line_items',
    'project_comments',
    'scope_items',
    'users',
    'vendors'
  ] loop
    if not exists (
      select 1
        from pg_trigger
       where tgrelid = format('public.%I', table_name)::regclass
         and tgname = format('audit_%s', table_name)
    ) then
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()',
        format('audit_%s', table_name),
        table_name
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Tenant-maintained Philippine holiday calendar
-- ---------------------------------------------------------------------------

create table if not exists public.business_calendar_holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  holiday_date date not null,
  name varchar(255) not null,
  kind varchar(32) not null,
  source text not null,
  is_enabled boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_calendar_holidays_kind
    check (kind in ('regular', 'special_non_working', 'local')),
  constraint business_calendar_holidays_name_nonempty
    check (length(btrim(name)) > 0),
  constraint business_calendar_holidays_source_nonempty
    check (length(btrim(source)) > 0),
  constraint business_calendar_holidays_tenant_date_unique
    unique (tenant_id, holiday_date),
  constraint business_calendar_holidays_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint business_calendar_holidays_updated_by_tenant_fk
    foreign key (tenant_id, updated_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_business_calendar_holidays_tenant_id_id
  on public.business_calendar_holidays (tenant_id, id);

create index if not exists idx_business_calendar_holidays_tenant_date
  on public.business_calendar_holidays (tenant_id, holiday_date)
  where is_enabled;

alter table public.business_calendar_holidays enable row level security;

revoke all privileges on table public.business_calendar_holidays
from public, anon, authenticated;

grant select, insert, update, delete
on table public.business_calendar_holidays
to authenticated;

grant all privileges on table public.business_calendar_holidays
to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'business_calendar_holidays'
       and policyname = 'business_calendar_holidays_tenant_read'
  ) then
    create policy business_calendar_holidays_tenant_read
      on public.business_calendar_holidays
      for select
      to authenticated
      using (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'business_calendar_holidays'
       and policyname = 'business_calendar_holidays_tenant_insert'
  ) then
    create policy business_calendar_holidays_tenant_insert
      on public.business_calendar_holidays
      for insert
      to authenticated
      with check (
        tenant_id = public.auth_tenant_id()
        and exists (
          select 1
          from public.users actor
          where actor.id = (select auth.uid())
            and actor.tenant_id = public.auth_tenant_id()
            and actor.role::text in ('owner', 'admin', 'finance')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'business_calendar_holidays'
       and policyname = 'business_calendar_holidays_tenant_update'
  ) then
    create policy business_calendar_holidays_tenant_update
      on public.business_calendar_holidays
      for update
      to authenticated
      using (
        tenant_id = public.auth_tenant_id()
        and exists (
          select 1
          from public.users actor
          where actor.id = (select auth.uid())
            and actor.tenant_id = public.auth_tenant_id()
            and actor.role::text in ('owner', 'admin', 'finance')
        )
      )
      with check (
        tenant_id = public.auth_tenant_id()
        and exists (
          select 1
          from public.users actor
          where actor.id = (select auth.uid())
            and actor.tenant_id = public.auth_tenant_id()
            and actor.role::text in ('owner', 'admin', 'finance')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'business_calendar_holidays'
       and policyname = 'business_calendar_holidays_tenant_delete'
  ) then
    create policy business_calendar_holidays_tenant_delete
      on public.business_calendar_holidays
      for delete
      to authenticated
      using (
        tenant_id = public.auth_tenant_id()
        and exists (
          select 1
          from public.users actor
          where actor.id = (select auth.uid())
            and actor.tenant_id = public.auth_tenant_id()
            and actor.role::text in ('owner', 'admin', 'finance')
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.business_calendar_holidays'::regclass
       and tgname = 'audit_business_calendar_holidays'
  ) then
    create trigger audit_business_calendar_holidays
      after insert or update or delete on public.business_calendar_holidays
      for each row execute function public.audit_log_trigger();
  end if;
end
$$;

create or replace function public.business_calendar_holidays_set_actor()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(
      new.created_by,
      (
        select app_user.id
        from public.users app_user
        where app_user.id = (select auth.uid())
          and app_user.tenant_id = new.tenant_id
      )
    );
  end if;
  new.updated_by := (
    select app_user.id
    from public.users app_user
    where app_user.id = (select auth.uid())
      and app_user.tenant_id = new.tenant_id
  );
  new.updated_at := clock_timestamp();
  return new;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.business_calendar_holidays'::regclass
       and tgname = 'business_calendar_holidays_set_actor'
  ) then
    create trigger business_calendar_holidays_set_actor
      before insert or update on public.business_calendar_holidays
      for each row execute function public.business_calendar_holidays_set_actor();
  end if;
end
$$;

-- New tenants must receive the same national seed. Tenant-maintained rows then
-- replace or disable individual dates without changing the application build.
create or replace function public.seed_business_calendar_holidays_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_calendar_holidays (
    tenant_id, holiday_date, name, kind, source
  )
  values
    (new.id, '2026-01-01', 'New Year''s Day', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-02-17', 'Chinese New Year', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-03-20', 'Eid''l Fitr', 'regular', 'Proclamation No. 1189, s. 2026'),
    (new.id, '2026-04-02', 'Maundy Thursday', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-04-03', 'Good Friday', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-04-04', 'Black Saturday', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-04-09', 'Araw ng Kagitingan', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-05-01', 'Labor Day', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-05-27', 'Eid''l Adha', 'regular', 'Proclamation No. 1264, s. 2026'),
    (new.id, '2026-06-12', 'Independence Day', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-08-21', 'Ninoy Aquino Day', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-08-31', 'National Heroes Day', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-11-01', 'All Saints'' Day', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-11-02', 'All Souls'' Day', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-11-30', 'Bonifacio Day', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-12-08', 'Feast of the Immaculate Conception of Mary', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-12-24', 'Christmas Eve', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-12-25', 'Christmas Day', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-12-30', 'Rizal Day', 'regular', 'Proclamation No. 1006, s. 2025'),
    (new.id, '2026-12-31', 'Last Day of the Year', 'special_non_working', 'Proclamation No. 1006, s. 2025')
  on conflict (tenant_id, holiday_date) do nothing;
  return new;
end
$$;

revoke execute on function public.seed_business_calendar_holidays_for_tenant()
from public, anon, authenticated;
grant execute on function public.seed_business_calendar_holidays_for_tenant()
to service_role;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.tenants'::regclass
       and tgname = 'seed_business_calendar_holidays_for_tenant'
  ) then
    create trigger seed_business_calendar_holidays_for_tenant
      after insert on public.tenants
      for each row execute function public.seed_business_calendar_holidays_for_tenant();
  end if;
end
$$;

-- Seed the current official national calendar for every existing tenant. New
-- years are intentionally data operations, not code changes.
insert into public.business_calendar_holidays (
  tenant_id, holiday_date, name, kind, source
)
select
  tenant.id,
  seed.holiday_date,
  seed.name,
  seed.kind,
  seed.source
from public.tenants as tenant
cross join (values
  ('2026-01-01'::date, 'New Year''s Day', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-02-17'::date, 'Chinese New Year', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
  ('2026-03-20'::date, 'Eid''l Fitr', 'regular', 'Proclamation No. 1189, s. 2026'),
  ('2026-04-02'::date, 'Maundy Thursday', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-04-03'::date, 'Good Friday', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-04-04'::date, 'Black Saturday', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
  ('2026-04-09'::date, 'Araw ng Kagitingan', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-05-01'::date, 'Labor Day', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-05-27'::date, 'Eid''l Adha', 'regular', 'Proclamation No. 1264, s. 2026'),
  ('2026-06-12'::date, 'Independence Day', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-08-21'::date, 'Ninoy Aquino Day', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
  ('2026-08-31'::date, 'National Heroes Day', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-11-01'::date, 'All Saints'' Day', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
  ('2026-11-02'::date, 'All Souls'' Day', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
  ('2026-11-30'::date, 'Bonifacio Day', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-12-08'::date, 'Feast of the Immaculate Conception of Mary', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
  ('2026-12-24'::date, 'Christmas Eve', 'special_non_working', 'Proclamation No. 1006, s. 2025'),
  ('2026-12-25'::date, 'Christmas Day', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-12-30'::date, 'Rizal Day', 'regular', 'Proclamation No. 1006, s. 2025'),
  ('2026-12-31'::date, 'Last Day of the Year', 'special_non_working', 'Proclamation No. 1006, s. 2025')
) as seed(holiday_date, name, kind, source)
on conflict (tenant_id, holiday_date) do nothing;
