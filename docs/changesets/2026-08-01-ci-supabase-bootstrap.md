# CI Supabase bootstrap parity

The GitHub Postgres 17 reproducibility job now applies the repository's
test-only `scripts/ci/supabase-default-privileges.sql` after `supabase db
start` and before the zero-state reset. This creates only missing roles,
schema usage, and default grants needed by the RLS tests; Supabase-managed
auth/storage objects are left untouched. Production migrations and hosted
privileges are unchanged.
