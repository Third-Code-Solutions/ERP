-- ---------------------------------------------------------------------------
-- Auto-provision a self-signup workspace or a server-authorized tenant invite.
--
-- Signup inserts into auth.users. This trigger atomically creates one tenant
-- and same-ID Admin profile. SECURITY DEFINER is required because
-- supabase_auth_admin cannot write the application tables directly.
-- ---------------------------------------------------------------------------

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

    -- The migration also updates audit_log_trigger to consume this trusted,
    -- transaction-local actor id for profile and membership audit records.
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

  -- Stable UUID-derived suffix keeps retries deterministic.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to service_role;
