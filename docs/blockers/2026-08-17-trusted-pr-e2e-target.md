# Blocker — trusted-PR authenticated E2E target

**Status:** BLOCKED

The source workflow now fails closed for same-repository PRs when its
authenticated browser target is not configured. This repository does not
contain evidence that the following values identify an isolated, non-customer
test tenant:

- `E2E_BASE_URL`
- `E2E_SUPABASE_URL`
- `E2E_SUPABASE_ANON_KEY`
- `E2E_USER_EMAIL`
- `E2E_USER_PASSWORD`
- `E2E_PROJECT_ID`

Required owner action: authorize a disposable tenant/origin, create a dedicated
non-human test user and project fixture, store secrets/variables in GitHub, and
confirm the target contains no customer finance, procurement, or document data.

No provider settings, tenant records, credentials, or deployment were modified
while recording this blocker. Local source, type, and workflow checks do not
constitute authenticated browser evidence.
