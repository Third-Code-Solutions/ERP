-- RFQ workflow writes are server-authoritative. Authenticated users retain
-- tenant-scoped reads through RLS, but browser roles cannot create, mutate, or
-- delete official RFQs or supplier quotes through the Data API.

drop policy if exists rfqs_tenant_insert on public.rfqs;
drop policy if exists rfqs_tenant_update on public.rfqs;
drop policy if exists rfqs_tenant_delete on public.rfqs;

drop policy if exists rfq_quotes_tenant_insert on public.rfq_quotes;
drop policy if exists rfq_quotes_tenant_update on public.rfq_quotes;
drop policy if exists rfq_quotes_tenant_delete on public.rfq_quotes;

revoke all privileges on table public.rfqs, public.rfq_quotes
  from public, anon, authenticated;

grant select on table public.rfqs, public.rfq_quotes
  to authenticated;

grant all privileges on table public.rfqs, public.rfq_quotes
  to service_role;
