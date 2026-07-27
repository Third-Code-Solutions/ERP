begin;

-- jsonb_diff is an internal audit helper. Fix name resolution and prevent
-- direct browser-role invocation while retaining service diagnostics.
alter function public.jsonb_diff(jsonb, jsonb)
  set search_path = '';

revoke execute on function public.jsonb_diff(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.jsonb_diff(jsonb, jsonb)
  to service_role;

-- Some projects install the optional RLS auto-enable event trigger from the
-- Supabase hardening guide. Fresh databases do not contain its callback.
-- Revoke API execution when present without making clean migration replay
-- depend on out-of-band database state.
do $hardening$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute
      'revoke execute on function public.rls_auto_enable() '
      'from public, anon, authenticated, service_role';
  end if;
end
$hardening$;

commit;
