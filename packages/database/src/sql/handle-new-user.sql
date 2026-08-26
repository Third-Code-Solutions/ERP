-- ---------------------------------------------------------------------------
-- Auto-provision a self-signup workspace or an ADR-030 invitation intent.
--
-- The opaque token is carried only in raw_user_meta_data, then hashed and
-- locked against public.tenant_invitation_intents. It is scrubbed before an
-- application profile exists. Missing or unknown provisioning modes are
-- deterministically denied; app metadata is not an authority source.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tenant_id uuid;
  intent public.tenant_invitation_intents%rowtype;
  provisioning_mode text;
  invitation_token text;
  invitation_token_hash text;
  has_invitation_token boolean;
  base_slug text;
  final_slug text;
  normalized_email text;
  domain text;
  tenant_name text;
  display_name text;
  new_organization_type text;
begin
  has_invitation_token := coalesce(
    new.raw_user_meta_data,
    '{}'::jsonb
  ) ? 'tenant_invitation_token_v1';
  provisioning_mode := new.raw_user_meta_data ->> 'provisioning_mode';
  normalized_email := pg_catalog.lower(
    coalesce(
      nullif(pg_catalog.btrim(new.email), ''),
      new.id::text || '@auth.local'
    )
  );

  if provisioning_mode = 'tenant_invitation_v1' then
    if not has_invitation_token then
      raise exception 'tenant invitation provisioning mode requires a token'
        using errcode = '22023';
    end if;

    invitation_token := new.raw_user_meta_data ->> 'tenant_invitation_token_v1';
    if pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'tenant_invitation_token_v1'
    ) <> 'string'
      or invitation_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception 'invalid tenant invitation token'
        using errcode = '22023';
    end if;

    invitation_token_hash := pg_catalog.encode(
      extensions.digest(invitation_token, 'sha256'),
      'hex'
    );
    select * into intent
      from public.tenant_invitation_intents
     where token_hash = invitation_token_hash
     for update;

    if not found then
      raise exception 'unknown tenant invitation token'
        using errcode = '22023';
    end if;
    if intent.expires_at <= pg_catalog.clock_timestamp()
      or intent.revoked_at is not null
      or intent.consumed_at is not null then
      raise exception 'tenant invitation token is not usable'
        using errcode = '22023';
    end if;
    if intent.invited_email <> normalized_email then
      raise exception 'tenant invitation email does not match'
        using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.users inviter
       where inviter.id = intent.invited_by
         and inviter.tenant_id = intent.tenant_id
         and inviter.role in ('admin', 'owner')
    ) then
      raise exception 'tenant invitation inviter must be an owner or admin in the invited tenant'
        using errcode = '42501';
    end if;
    if exists (select 1 from public.users where id = new.id) then
      raise exception 'auth identity already has a profile'
        using errcode = '55000';
    end if;

    update public.tenant_invitation_intents
       set consumed_at = pg_catalog.clock_timestamp(),
           consumed_by_user_id = new.id
     where id = intent.id;
    update auth.users
       set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
         - 'tenant_invitation_token_v1'
     where id = new.id;

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

    perform pg_catalog.set_config(
      'app.tenant_invitation_v1_actor_id',
      intent.invited_by::text,
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
      intent.tenant_id,
      normalized_email,
      display_name,
      intent.invited_role
    );

    perform pg_catalog.set_config(
      'app.tenant_invitation_v1_actor_id',
      '',
      true
    );
    return new;
  end if;

  if provisioning_mode = 'self_signup_v1' then
    if has_invitation_token then
      raise exception 'self-signup provisioning mode cannot include an invitation token'
        using errcode = '22023';
    end if;
  else
    raise exception 'explicit valid provisioning mode is required'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.users
     where id = new.id
  ) then
    return new;
  end if;

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

-- GoTrue can persist raw user metadata in a later statement. Once the intent
-- is consumed, this trigger scrubs a capability from that later write as well.
create or replace function public.scrub_consumed_tenant_invitation_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ? 'tenant_invitation_token_v1'
    and exists (
      select 1
        from public.tenant_invitation_intents intent
       where intent.consumed_by_user_id = new.id
    ) then
    new.raw_user_meta_data := new.raw_user_meta_data
      - 'tenant_invitation_token_v1';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists scrub_consumed_tenant_invitation_token on auth.users;
create trigger scrub_consumed_tenant_invitation_token
  before update of raw_user_meta_data on auth.users
  for each row execute function public.scrub_consumed_tenant_invitation_token();

revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.handle_new_user()
  to service_role;

revoke execute on function public.scrub_consumed_tenant_invitation_token()
  from public, anon, authenticated;
grant execute on function public.scrub_consumed_tenant_invitation_token()
  to service_role;
