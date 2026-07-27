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
  for each row execute function public.handle_new_user();;
