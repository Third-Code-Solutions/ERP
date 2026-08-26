# ADR-030 invitation intent database hardening

## Scope

- Add an additive, hash-only `tenant_invitation_intents` migration and Drizzle schema.
- Make the Auth trigger require the exact `self_signup_v1` or
  `tenant_invitation_v1` raw-user-metadata provisioning mode.
- Claim invitation intents under row lock, scrub opaque tokens even when GoTrue
  applies user metadata in a later statement, and reject all legacy authority.
- Add forced RLS, immutable intent transitions, token-free audit evidence, and
  an append-only audit-log guard.

## Evidence

- Clean disposable Supabase replay on ports 55321/55322 applied the additive
  migration successfully.
- Database typecheck passed.
- Focused Auth Admin API proof passed 16/16 tests, including all 13 canonical
  invitation roles, token scrubbing, no orphan tenant, fail-closed provisioning
  modes, replay prevention, RLS denial, and audit immutability.

## Handoff

Agent 05 must create the intent before calling Auth Admin create-user, retain
only the plaintext token long enough to deliver it to the invitee, and supply
`user_metadata` with `provisioning_mode: 'tenant_invitation_v1'` plus
`tenant_invitation_token_v1`. The API must never log, persist, or return the
token or its hash.
