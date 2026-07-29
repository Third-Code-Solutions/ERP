-- Preserve signup business classification as tenant profile data.
--
-- This value is user-provided onboarding context. It is constrained to the
-- product catalog and must never grant roles, capabilities, or tenant access.

alter table public.tenants
  add column organization_type varchar(64)
  not null
  default 'other';

alter table public.tenants
  add constraint tenants_organization_type_check
  check (
    organization_type in (
      'construction',
      'developer',
      'design-engineering',
      'supply-manufacturing',
      'professional-services',
      'other'
    )
  )
  not valid;

alter table public.tenants
  validate constraint tenants_organization_type_check;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
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
