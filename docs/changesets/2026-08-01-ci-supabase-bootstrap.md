# CI Supabase bootstrap parity

The GitHub Postgres 17 reproducibility job now applies the repository's
test-only `scripts/ci/supabase-system-bootstrap.sql` after `supabase db start`
and before the zero-state reset. This matches the proven WSL lane by creating
the minimal Supabase roles, auth/storage helpers, and default grants needed by
the RLS tests. Production migrations and hosted privileges are unchanged.
