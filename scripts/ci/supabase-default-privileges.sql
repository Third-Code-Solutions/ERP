-- CI-only role/default-privilege parity for Supabase CLI's managed local DB.
-- Do not recreate auth/storage objects here; the CLI owns those schemas.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

-- The legacy Project table predates the repository's explicit privilege
-- hardening migrations. Project mutations are Core-owned (ADR-025); the
-- browser role is intentionally read-only even in the disposable CI DB.
-- Keep this fixture aligned with the production revoke in the controlled
-- project-retirement migration so CI cannot re-introduce a browser write path.
revoke all privileges
  on table public.projects
  from public, anon, authenticated;
grant select
  on table public.projects
  to authenticated;

-- User role changes are Core-owned. Authenticated users retain tenant-scoped
-- reads through RLS; anonymous users must not receive a direct ERP-table grant.
grant select
  on table public.users
  to authenticated;
revoke all privileges
  on table public.users
  from public, anon;

-- These legacy tables were created before explicit role grants. The CLI reset
-- does not inherit the manual system bootstrap's pre-creation default grants;
-- ALTER DEFAULT PRIVILEGES above cannot repair already-created relations.
-- Model only preserved read/server access, never restore client mutations.
grant select on table public.documents, public.progress_claims,
  public.tenants, public.progress_claim_documents to authenticated;
grant select, insert, update, delete, truncate on table public.documents,
  public.progress_claims, public.tenants, public.progress_claim_documents,
  public.projects to service_role;
-- KYC uses the same pre-existing table boundary. Preserve known reader and
-- trusted-server access; artifact mutation and parent deletion denials stay put.
grant select on table public.account_kyc_artifacts, public.accounts,
  public.opportunities to authenticated;
-- Account/opportunity INSERT and UPDATE were observed in the legacy baseline
-- and are explicitly outside this migration's deletion-only parent boundary.
grant insert, update on table public.accounts, public.opportunities
  to authenticated;
grant select, insert, update, delete, truncate on table
  public.account_kyc_artifacts, public.accounts, public.opportunities
  to service_role;
-- Audit access is already granted by the Cortex security migration; trigger
-- writes retain their existing SECURITY DEFINER authority. No audit grant here.

commit;
