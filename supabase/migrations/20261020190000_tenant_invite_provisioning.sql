-- Provision invited users into the inviter's tenant instead of a fresh one.
--
-- `handle_new_user()` assumed every `auth.users` row is a self-signup, so every
-- admin invite created an orphan tenant and a public user that the server action
-- then tried to insert a second time. The invite path now claims an existing
-- tenant in `raw_app_meta_data`, which only a service-role caller can set, and
-- the claim is re-validated here inside the same transaction as the auth insert.
-- Tenant and role authority therefore stays in the database: a browser-supplied
-- tenant or role can never reach `public.users` through this trigger.
--
-- Rollback: this migration only replaces `public.handle_new_user()` and
-- `public.provision_platform_invited_user()`; it touches no table, column, index
-- or row, so there is nothing to un-migrate and no data backfill to reverse. To
-- revert, re-apply the prior definitions: `handle_new_user()` from
-- `20260729054456_persist_signup_organization_type.sql` and
-- `provision_platform_invited_user()` from
-- `20260904020000_platform_owner_administration_boundary.sql` (each is the
-- previous `create or replace function`), which also removes the
-- non-object-metadata guard and the pending-invitation conflict guard. Do that only if invite claims must stop provisioning;
-- users already provisioned through the invite path remain valid rows and need no
-- cleanup. Reverting is safe while mixed versions run: the trigger is replaced
-- atomically, so in-flight auth inserts either see the old or the new definition,
-- never a partial one. Re-applying this file is idempotent (`create or replace`
-- plus `drop trigger if exists`), so a failed deploy can be retried as-is.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite jsonb;
  invite_tenant_id uuid;
  invite_actor_id uuid;
  invite_role public.role;
  invite_actor public.users%rowtype;
  new_tenant_id uuid;
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

  normalized_email := coalesce(
    nullif(pg_catalog.btrim(new.email), ''),
    new.id::text || '@auth.local'
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

  -- Supabase always stores app metadata as a JSON object. A scalar or string
  -- value means the writer double-encoded it, which would hide an invite claim
  -- from the lookup below and silently fall back to self-signup. Fail closed.
  if new.raw_app_meta_data is not null
    and pg_catalog.jsonb_typeof(new.raw_app_meta_data) <> 'object' then
    raise exception 'raw app metadata must be a JSON object'
      using errcode = '22023';
  end if;

  invite := nullif(new.raw_app_meta_data -> 'erp_invite', 'null'::jsonb);

  if invite is not null then
    if pg_catalog.jsonb_typeof(invite) <> 'object' then
      raise exception 'invite claim must be an object'
        using errcode = '22023';
    end if;

    begin
      invite_tenant_id := (invite ->> 'tenant_id')::uuid;
      invite_actor_id := (invite ->> 'invited_by')::uuid;
      invite_role := (invite ->> 'role')::public.role;
    exception
      when others then
        raise exception 'invite claim is malformed'
          using errcode = '22023';
    end;

    if invite_tenant_id is null
      or invite_actor_id is null
      or invite_role is null then
      raise exception 'invite claim is incomplete'
        using errcode = '22023';
    end if;

    select *
      into invite_actor
      from public.users
     where id = invite_actor_id;

    if not found
      or invite_actor.tenant_id is distinct from invite_tenant_id
      or invite_actor.role not in ('owner', 'admin')
      or invite_actor.account_status is distinct from 'active' then
      raise exception 'invite claim rejected'
        using errcode = '42501';
    end if;

    if invite_role = 'owner' and invite_actor.role <> 'owner' then
      raise exception 'only an owner may invite an owner'
        using errcode = '42501';
    end if;

    insert into public.users (
      id,
      tenant_id,
      email,
      full_name,
      role
    )
    values (
      new.id,
      invite_tenant_id,
      normalized_email,
      display_name,
      invite_role
    );

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

-- `a_platform_invited_user_provision` fires before `on_auth_user_created` and
-- matches on email alone. Without this guard a tenant admin could create an
-- auth user (known password, confirmed email) for an address that holds a
-- pending platform invitation to ANOTHER tenant; the invitation trigger would
-- then place that account in the invited tenant before the `erp_invite` claim
-- above is ever evaluated. A service-role invite claim and a platform
-- invitation are two different provisioning channels: an auth insert that
-- carries both is rejected so no account is created. Body is otherwise the
-- definition from 20260904020000_platform_owner_administration_boundary.sql;
-- grants are unchanged by `create or replace`.
create or replace function public.provision_platform_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.platform_user_invitations%rowtype;
begin
  select candidate.*
    into invitation
    from public.platform_user_invitations as candidate
   where candidate.normalized_email = lower(btrim(new.email))
     and candidate.status = 'pending'
     and candidate.auth_user_id is null
   order by candidate.created_at desc
   limit 1
   for update;

  if not found then
    return new;
  end if;

  if new.raw_app_meta_data is not null
    and pg_catalog.jsonb_typeof(new.raw_app_meta_data) = 'object'
    and pg_catalog.jsonb_exists(new.raw_app_meta_data, 'erp_invite') then
    raise exception 'email has a pending platform invitation'
      using errcode = '42501';
  end if;

  insert into public.users (
    id,
    tenant_id,
    email,
    full_name,
    role,
    account_status,
    invited_at
  ) values (
    new.id,
    invitation.tenant_id,
    invitation.normalized_email,
    invitation.full_name,
    invitation.role,
    'invited',
    now()
  );

  update public.platform_user_invitations
     set status = 'sent',
         auth_user_id = new.id,
         sent_at = now()
   where id = invitation.id;

  return new;
end
$$;
