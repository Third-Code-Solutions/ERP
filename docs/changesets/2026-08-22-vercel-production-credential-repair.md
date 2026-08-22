# Vercel production credential repair

## Summary

- Corrected the production Vercel team scope to the linked project team ID.
- Synchronize Vercel's `DATABASE_URL` from the protected production release
  secret immediately before each production deployment. This ensures every
  production deployment snapshot has the approved Supabase runtime connection.
- Rotated the protected Vercel deployment credential and verified authenticated
  project access before re-running the release gate.
- Re-verified the release preview, its database readiness probes, and trusted
  authenticated E2E checks. The temporary branch-only preview verifier was
  removed before merge.

## Operational note

The protected `VERCEL_TOKEN` is time-limited and must be rotated before its
provider expiry. No credential values are stored in the repository.
