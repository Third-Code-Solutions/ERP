-- RFI resolution is a Core command with capability, concurrency and audit checks.
-- Legacy inspection/photo writes and open RFI creation remain available.
begin;

alter table public.site_inspection_rfis enable row level security;
alter table public.site_inspection_rfis force row level security;

revoke update on table public.site_inspection_rfis
  from public, anon, authenticated;

-- Table revocation alone does not remove separately granted column privileges.
revoke update (
  id, tenant_id, inspection_id, description, priority,
  resolved_at, resolved_by, created_at
) on public.site_inspection_rfis
  from public, anon, authenticated;

-- Restrictive policies also reject writes if a later migration restores grants.
-- Match database roles, never JWT claims: Core stamps authenticated audit claims.
create policy site_inspection_rfis_deny_client_update
  on public.site_inspection_rfis
  as restrictive
  for update
  to anon, authenticated
  using (false)
  with check (false);

-- Retain the existing permissive tenant INSERT policy; this adds an AND gate.
create policy site_inspection_rfis_client_insert_open
  on public.site_inspection_rfis
  as restrictive
  for insert
  to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and resolved_at is null
    and resolved_by is null
  );

commit;
