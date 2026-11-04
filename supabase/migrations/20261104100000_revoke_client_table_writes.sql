-- SEC-01 / SEC-02: retire direct browser-JWT table writes in public.
--
-- Every ERP write runs as `postgres` (Drizzle SSR and the Nest Core API) or
-- through SECURITY DEFINER RPCs. The supabase-js `authenticated` path only
-- reads tables, uses Storage and calls the definer RPCs
-- activate_current_invited_user() and is_platform_owner(). Yet the postgres
-- default ACL in public granted INSERT/UPDATE/DELETE/TRUNCATE to
-- `authenticated` on every new table, so any tenant user could write through
-- PostgREST and skip Core API RBAC and segregation of duties.
--
-- Privilege-only and additive: no data, table, column, function or policy
-- changes. SELECT grants, service_role grants and existing RLS policies stay.
-- The tenant write policies left behind are now unreachable; dropping them is
-- deferred to a later contract release.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Table-level REVOKE also clears matching column-level grants.
revoke insert, update, delete, truncate
  on all tables in schema public from authenticated, anon;

-- Tables created later by postgres in public must not regain client DML.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from authenticated, anon;

commit;
