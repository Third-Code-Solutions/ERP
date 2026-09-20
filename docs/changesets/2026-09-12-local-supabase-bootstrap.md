# Local Supabase bootstrap compatibility

## Change

The test-only WSL1 PostgreSQL bootstrap now includes nullable `storage.buckets.allowed_mime_types text[]` and `auth.users.email_confirmed_at timestamptz`. Existing September migrations require these managed Supabase fields. Their types were verified through read-only hosted catalog inspection; no hosted schema or data was changed.

## Verification

- RED: fresh isolated replay failed at `20260901141949_allow_cad_octet_stream_uploads.sql` because `allowed_mime_types` was absent, then at `20260904020000_platform_owner_administration_boundary.sql` because `email_confirmed_at` was absent.
- PASSED: corrected bootstrap and all 169 repository migrations replayed into a new empty PostgreSQL 17.10 database.
- PASSED: read-only release planner reported `current`, 169/169 applied, zero missing/unexpected versions, head `20260910200000`.
- Existing purchase-order reconciliation SQL emitted two `SET LOCAL can only be used in transaction blocks` warnings under the existing script's per-file psql execution. No errors were suppressed or historical migrations changed.

## Boundary

This is a minimal test-owned managed-schema substitute, not a complete Supabase service emulator or a production recovery rehearsal. Application migration files, production grants, provider targets and the protected release workflow are unchanged. Claim workflow implementation and its release gates remain separate.
