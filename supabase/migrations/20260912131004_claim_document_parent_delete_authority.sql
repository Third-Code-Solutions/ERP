-- Close direct client deletion paths that can cascade into retained claim
-- attachments. Privileged Core/Web writers remain responsible for business
-- retention checks; database-owner/admin lifecycle operations remain explicit.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

revoke delete, truncate
  on table public.documents, public.progress_claims, public.tenants
  from public, anon, authenticated;

-- Project DELETE was already revoked by its authority migration. Close the
-- remaining maintenance grant without changing reads or commercial writes.
revoke truncate on table public.projects from public, anon, authenticated;

-- These policies affect DELETE only, preserving all existing SELECT,
-- INSERT and UPDATE semantics. They also defend against accidental regrants.
drop policy if exists documents_deny_client_delete on public.documents;
create policy documents_deny_client_delete
  on public.documents as restrictive
  for delete to anon, authenticated using (false);

drop policy if exists progress_claims_deny_client_delete on public.progress_claims;
create policy progress_claims_deny_client_delete
  on public.progress_claims as restrictive
  for delete to anon, authenticated using (false);

drop policy if exists tenants_deny_client_delete on public.tenants;
create policy tenants_deny_client_delete
  on public.tenants as restrictive
  for delete to anon, authenticated using (false);

commit;

-- Recovery retains these denials. Roll forward or temporarily disable the
-- affected client workflow; do not automatically restore historical unsafe
-- grants. No rows, columns, foreign keys or audit records need reversal.
