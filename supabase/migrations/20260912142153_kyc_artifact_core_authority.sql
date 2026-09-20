-- KYC evidence mutation is Core-owned. Preserve existing SELECT, trusted
-- server privileges, historical artifacts and all foreign-key lifecycles.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.account_kyc_artifacts enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on table public.account_kyc_artifacts from public, anon, authenticated;

-- Table REVOKE does not remove independent column-level grants.
do $$
declare
  columns_sql text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum)
    into columns_sql
    from pg_attribute
   where attrelid = 'public.account_kyc_artifacts'::regclass
     and attnum > 0 and not attisdropped;
  execute format(
    'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.account_kyc_artifacts from public, anon, authenticated',
    columns_sql
  );
end
$$;

drop policy if exists account_kyc_tenant_insert on public.account_kyc_artifacts;
drop policy if exists account_kyc_tenant_update on public.account_kyc_artifacts;
drop policy if exists account_kyc_tenant_delete on public.account_kyc_artifacts;

-- Restrictive policies defend against accidental future permissive regrants.
-- Do not use FOR ALL, which would also disable preserved tenant-scoped SELECT.
drop policy if exists account_kyc_deny_client_insert on public.account_kyc_artifacts;
create policy account_kyc_deny_client_insert
  on public.account_kyc_artifacts as restrictive
  for insert to anon, authenticated with check (false);

drop policy if exists account_kyc_deny_client_update on public.account_kyc_artifacts;
create policy account_kyc_deny_client_update
  on public.account_kyc_artifacts as restrictive
  for update to anon, authenticated using (false) with check (false);

drop policy if exists account_kyc_deny_client_delete on public.account_kyc_artifacts;
create policy account_kyc_deny_client_delete
  on public.account_kyc_artifacts as restrictive
  for delete to anon, authenticated using (false);

-- Account deletion cascades artifacts; opportunity deletion cascades documents
-- and would null their artifact links. Other account/opportunity writes remain.
revoke delete, truncate on table public.accounts, public.opportunities
  from public, anon, authenticated;

drop policy if exists accounts_deny_client_delete on public.accounts;
create policy accounts_deny_client_delete
  on public.accounts as restrictive
  for delete to anon, authenticated using (false);

drop policy if exists opportunities_deny_client_delete on public.opportunities;
create policy opportunities_deny_client_delete
  on public.opportunities as restrictive
  for delete to anon, authenticated using (false);

-- Preserve controlled privileged user deletion and uploaded_by SET NULL.
-- Only the remaining direct-client maintenance privilege is removed.
revoke truncate on table public.users from public, anon, authenticated;

create index if not exists idx_account_kyc_tenant_document
  on public.account_kyc_artifacts (tenant_id, document_id);

commit;

-- Recovery retains privilege denials and the additive index. Roll forward or
-- disable submission; never automatically restore unsafe client mutation grants.
-- No rows, foreign keys or historical audit entries require reversal.
