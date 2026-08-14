# CI fixture: remove anonymous project privileges

## Change

The disposable Supabase/Postgres CI fixture no longer grants `anon` direct
privileges on `public.projects`. The fixture now matches the repository's
security invariant: authenticated access is evaluated through tenant RLS and
anonymous clients have no direct ERP-table grants.

## Verification

- `scripts/verify-database-repro.mjs` caught the contradictory `anon` grant in
  the Postgres 17 replay.
- The corrected fixture must pass the full `Database Reproducibility`
  workflow job before this increment is considered green.

## Safety

No hosted database or production data was changed. This is a CI-only privilege
fixture correction.
