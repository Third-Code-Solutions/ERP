begin;

-- auth_tenant_id is an internal RLS helper. Authenticated policies need
-- EXECUTE, but anonymous callers do not: public portal flows are mediated by
-- trusted server boundaries and anon has no direct ERP table privileges.
-- Keep the helper in public for current policy compatibility while removing
-- the externally callable anonymous RPC surface reported by the DB advisor.
revoke execute on function public.auth_tenant_id()
  from public, anon;

grant execute on function public.auth_tenant_id()
  to authenticated, service_role;

commit;
