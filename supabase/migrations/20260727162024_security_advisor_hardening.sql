begin;

-- jsonb_diff is an internal audit helper. Fix name resolution and prevent
-- direct browser-role invocation while retaining service diagnostics.
alter function public.jsonb_diff(jsonb, jsonb)
  set search_path = '';

revoke execute on function public.jsonb_diff(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.jsonb_diff(jsonb, jsonb)
  to service_role;

-- Supabase installs this SECURITY DEFINER function as an event-trigger
-- callback. PostgreSQL invokes it through the event trigger; API roles must
-- never call it directly.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

commit;
