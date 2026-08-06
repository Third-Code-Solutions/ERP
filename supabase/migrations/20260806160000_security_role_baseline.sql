-- Third Code ERP security baseline.
--
-- RLS remains the tenant predicate, but it is not a substitute for least
-- privilege. The anonymous PostgREST role must not hold direct authority over
-- ERP tables or sequences. Public-portal flows are server-mediated and use
-- the Nest/service boundary; they do not require anonymous table grants.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;

-- Historical migrations created tenant policies without an explicit role,
-- which PostgreSQL records as the public role. Normalize only those policies;
-- policies already scoped to authenticated or service_role remain unchanged.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = ARRAY['public']::name[]
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END
$$;
