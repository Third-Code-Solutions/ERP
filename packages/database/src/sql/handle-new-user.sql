-- ---------------------------------------------------------------------------
-- Auto-provision a workspace + profile row for every new auth user.
--
-- Why: signup only calls supabase.auth.signUp(), which inserts into auth.users
-- but never into public.users. Without a public.users row, getUserProfile()
-- returns null and the (dashboard) layout redirects to /auth/login, which the
-- middleware bounces straight back to /dashboard — an infinite redirect loop
-- (ERR_TOO_MANY_REDIRECTS).
--
-- This trigger makes signup self-contained: each new auth user gets its own
-- tenant (one firm = one tenant per the multi-tenant model) and is seeded as
-- that tenant's `admin`. SECURITY DEFINER so it can write past RLS.
-- Idempotent: skips if a profile already exists.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  base_slug     text;
  final_slug    text;
  domain        text;
  display_name  text;
begin
  -- Idempotent guard — never double-provision.
  if exists (select 1 from public.users where id = new.id) then
    return new;
  end if;

  domain       := nullif(split_part(new.email, '@', 2), '');
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1)
  );

  base_slug := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'workspace';
  end if;
  -- Slug is unique; suffix with a short hash to avoid collisions.
  final_slug := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  insert into public.tenants (name, slug)
  values (coalesce(domain, 'New Workspace'), final_slug)
  returning id into new_tenant_id;

  insert into public.users (id, tenant_id, email, full_name, role)
  values (new.id, new_tenant_id, new.email, display_name, 'admin');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
