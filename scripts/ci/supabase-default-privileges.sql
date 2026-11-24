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

-- Production's post-migration table default: service_role full, authenticated
-- and anon nothing (20260806160000 + 20261104055626 + 20261124200000 S12A).
-- Grant only that, so this script never revokes on the migration's behalf and
-- cannot mask it.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

-- The legacy Project table predates the repository's explicit privilege
-- hardening migrations. Project mutations are Core-owned (ADR-025) and S12A
-- retired the browser read, so the browser role holds nothing on it even in the
-- disposable CI DB. Keep this fixture aligned with production so CI cannot
-- re-introduce a browser read or write path.
revoke all privileges
  on table public.projects
  from public, anon, authenticated;

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
-- Model only preserved server access, never restore client access: S12A
-- retired the browser reads on these tables.
grant select, insert, update, delete, truncate on table public.documents,
  public.progress_claims, public.tenants, public.progress_claim_documents,
  public.projects to service_role;
-- KYC uses the same pre-existing table boundary. Preserve the one browser read
-- S12A keeps (opportunities) and trusted-server access; artifact mutation and
-- parent deletion denials stay put.
grant select on table public.opportunities to authenticated;
-- The legacy account/opportunity INSERT/UPDATE grants were retired by
-- 20261104055626_revoke_client_table_writes; do not restore them here.
grant select, insert, update, delete, truncate on table
  public.account_kyc_artifacts, public.accounts, public.opportunities
  to service_role;
-- Audit access is already granted by the Cortex security migration; trigger
-- writes retain their existing SECURITY DEFINER authority. No audit grant here.

-- Scheduling preserves the hosted service-role read grant, but CLI reset
-- creates this table before the default grants above. Match that read access
-- without restoring any client privilege or granting server mutations.
grant select on table public.project_schedule_tasks to service_role;

commit;
