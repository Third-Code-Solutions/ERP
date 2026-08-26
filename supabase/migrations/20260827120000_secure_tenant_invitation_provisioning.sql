-- Harden tenant invitations without changing ADR-022's one-home-tenant model.
--
-- Auth admins may set app_metadata, while a browser may set only user_metadata.
-- A present tenant_invite_v1 marker therefore has to be complete and valid; it
-- must never fall through to self-signup provisioning.

begin;

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
  v_actor_id uuid;
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

  v_actor_id := auth.uid();
  -- A browser-authenticated session always wins. The transaction-local invite
  -- actor exists solely because Auth-admin trigger execution has no auth.uid().
  if v_actor_id is null then
    v_actor_id := nullif(
      current_setting('app.tenant_invite_v1_actor_id', true),
      ''
    )::uuid;
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
    v_actor_id,
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
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tenant_id uuid;
  invited_tenant_id uuid;
  invited_by uuid;
  invited_role public.role;
  invitation jsonb;
  base_slug text;
  final_slug text;
  normalized_email text;
  domain text;
  tenant_name text;
  display_name text;
  new_organization_type text;
begin
  if exists (
    select 1
      from public.users
     where id = new.id
  ) then
    return new;
  end if;

  invitation := new.raw_app_meta_data -> 'tenant_invite_v1';
  if invitation is not null then
    if jsonb_typeof(invitation) <> 'object'
      or jsonb_typeof(invitation -> 'tenant_id') <> 'string'
      or jsonb_typeof(invitation -> 'role') <> 'string'
      or jsonb_typeof(invitation -> 'invited_by') <> 'string' then
      raise exception 'invalid tenant invite metadata'
        using errcode = '22023';
    end if;

    begin
      invited_tenant_id := (invitation ->> 'tenant_id')::uuid;
      invited_role := (invitation ->> 'role')::public.role;
      invited_by := (invitation ->> 'invited_by')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'invalid tenant invite metadata'
          using errcode = '22023';
    end;

    if not exists (
      select 1
        from public.users inviter
       where inviter.id = invited_by
         and inviter.tenant_id = invited_tenant_id
         and inviter.role in ('admin', 'owner')
    ) then
      raise exception 'tenant invite inviter must be an owner or admin in the invited tenant'
        using errcode = '42501';
    end if;

    normalized_email := coalesce(
      nullif(pg_catalog.btrim(new.email), ''),
      new.id::text || '@auth.local'
    );
    display_name := pg_catalog.left(
      coalesce(
        nullif(
          pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
          ''
        ),
        nullif(
          pg_catalog.split_part(normalized_email, '@', 1),
          ''
        ),
        'New User'
      ),
      255
    );

    -- audit_log_trigger consumes this transaction-local value only after the
    -- inviter has been verified against the legacy one-home-tenant authority.
    perform pg_catalog.set_config(
      'app.tenant_invite_v1_actor_id',
      invited_by::text,
      true
    );

    insert into public.users (
      id,
      tenant_id,
      email,
      full_name,
      role
    )
    values (
      new.id,
      invited_tenant_id,
      normalized_email,
      display_name,
      invited_role
    );

    perform pg_catalog.set_config('app.tenant_invite_v1_actor_id', '', true);
    return new;
  end if;

  normalized_email := coalesce(
    nullif(pg_catalog.btrim(new.email), ''),
    new.id::text || '@auth.local'
  );
  domain := nullif(
    pg_catalog.split_part(normalized_email, '@', 2),
    ''
  );
  tenant_name := pg_catalog.left(
    coalesce(
      nullif(
        pg_catalog.btrim(
          new.raw_user_meta_data ->> 'company_name'
        ),
        ''
      ),
      domain,
      'New Workspace'
    ),
    255
  );
  display_name := pg_catalog.left(
    coalesce(
      nullif(
        pg_catalog.btrim(
          new.raw_user_meta_data ->> 'full_name'
        ),
        ''
      ),
      nullif(
        pg_catalog.split_part(normalized_email, '@', 1),
        ''
      ),
      'New User'
    ),
    255
  );
  new_organization_type := case
    pg_catalog.lower(
      pg_catalog.btrim(
        coalesce(
          new.raw_user_meta_data ->> 'organization_type',
          ''
        )
      )
    )
    when 'construction' then 'construction'
    when 'developer' then 'developer'
    when 'design-engineering' then 'design-engineering'
    when 'supply-manufacturing' then 'supply-manufacturing'
    when 'professional-services' then 'professional-services'
    when 'other' then 'other'
    else 'other'
  end;

  base_slug := pg_catalog.regexp_replace(
    pg_catalog.lower(tenant_name),
    '[^a-z0-9]+',
    '-',
    'g'
  );
  base_slug := pg_catalog.btrim(base_slug, '-');
  base_slug := pg_catalog.btrim(
    pg_catalog.left(base_slug, 87),
    '-'
  );
  if base_slug = '' then
    base_slug := 'workspace';
  end if;

  final_slug :=
    base_slug
    || '-'
    || pg_catalog.substr(
      pg_catalog.md5(new.id::text),
      1,
      12
    );

  insert into public.tenants (
    name,
    slug,
    organization_type
  )
  values (
    tenant_name,
    final_slug,
    new_organization_type
  )
  returning id into new_tenant_id;

  insert into public.users (
    id,
    tenant_id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    new_tenant_id,
    normalized_email,
    display_name,
    'admin'
  );

  return new;
end;
$$;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to service_role;

commit;
