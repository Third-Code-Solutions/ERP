# CI Supabase bootstrap parity

The GitHub Postgres 17 reproducibility job now applies the repository's
test-only `scripts/ci/supabase-default-privileges.sql` after the Supabase CLI
zero-state reset. This creates only missing roles,
schema usage, and default grants needed by the RLS tests; Supabase-managed
auth/storage objects are left untouched. After reset it grants only the
legacy `public.projects` client-role surface required by the RLS proof.
Production migrations and hosted privileges are unchanged.
