# Production release unblock

## Changes

- Replace the unavailable Supabase management-PAT link path in the canonical
  promotion workflow with an exact-project, port-5432 session-pooler migration
  URL, while keeping the read-only boundary URL separate.
- Add target validation before migration preview/apply and document the new
  protected GitHub environment secret.
- Record the guarded cleanup of the two foreign synthetic production rows and
  their append-only audit events.

## Verification

- Production boundary verifier: `clear`; 70 E2E field matches; zero seeded
  identities outside the allowlist; zero promotion violations.
- Supabase CLI 2.109.1 against the production session pooler: migration
  dry-run reported the remote database up to date.
- Railway project API token created and stored in the protected GitHub
  `production` environment as `RAILWAY_TOKEN`.

## Remaining release condition

The canonical promotion still requires a durable classic Vercel personal token
for future CI runs. An OAuth access token must not be recorded as a permanent
credential because it expires.
