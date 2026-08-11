# M3.281 - Bank-reconciliation auto-match Core authority

Date: 2026-08-12
Status: source-only, locally verified and pushed; no production cutover

## Scope

Moved the existing reconciliation auto-match action behind the already-tested
Nest workflow for an exact tenant canary. The compatibility Server Action now
requires an opaque browser retry key when that selector is enabled and never
falls back to the direct database function after a selected Core failure.

## Evidence

- Core client and Server Action tests cover exact-tenant selection, strict
  retry-token validation, terminal Core failures, exact counts, and no Web
  database fallback.
- The disposable Playwright loopback proves the authenticated detail page
  renders the auto-match result and records the POST path, bearer, UUID request
  ID, idempotency key, and strict `{}` body.
- Local API build, Web typecheck/lint, focused Web tests, the disposable
  PostgreSQL/Nest HTTP canary, and the authenticated browser canary passed.
- Full `pnpm test` passed (shared 332, API 764, Web 787; database package
  passed); root typecheck, lint, production build, policy/planner checks,
  Actionlint, Gitleaks, provider-spend guard, and `git diff --check` passed.

## Safety boundary

The API and Web auto-match selectors remain false/empty outside the disposable
browser tenant. No hosted Supabase SQL/data, Storage, Vercel/Railway
deployment, provider setting, credential, or paid action changed.

## Release evidence and next action

Source/docs commit `293ad6f963524d0c47bd9ff44e0505a509a2ae34` is pushed under
`kurtgav` and matches the remote branch SHA. Keep selectors closed and make
manual line match/unmatch the next separately verified authority slice.
