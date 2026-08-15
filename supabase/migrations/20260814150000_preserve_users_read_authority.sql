-- Preserve the tenant-scoped user directory read surface after browser DML
-- was moved to the Nest/Core authority. RLS remains the row boundary; this
-- migration only makes the intended authenticated SELECT grant explicit.

begin;

grant select on table public.users to authenticated;
revoke insert, update, delete on table public.users
  from public, anon, authenticated;
revoke insert (id, tenant_id, email, full_name, role, created_at, updated_at),
  update (id, tenant_id, email, full_name, role, created_at, updated_at)
  on table public.users from public, anon, authenticated;

commit;
