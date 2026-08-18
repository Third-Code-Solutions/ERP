# Trusted preview E2E gate — 2026-08-18

## Status

**PRE-CI.** This changeset prepares the same-repository pull-request gate to
test the isolated preview deployment without making that deployment public.
It does not claim that the GitHub E2E job has passed; a fresh run is required
after this commit is pushed.

## Changes

- Added optional Playwright support for Vercel's automation-bypass request
  header. The header is absent outside the dedicated E2E job.
- Made the trusted-PR workflow require
  `E2E_VERCEL_PROTECTION_BYPASS_SECRET`, so a protected target cannot silently
  fall back to an SSO page or an unprotected deployment.
- Updated the authenticated-E2E runbook with the secret's storage, scope, and
  non-bypass-of-public-protection boundary.
- Created a disposable preview-only Supabase user, tenant membership, and
  project for the branch deployment. No customer, production, finance, or
  procurement data was used.
- Bound the preview deployment to the PR branch's Supabase URL and database
  URL, while overriding its generic Preview service-role setting with a
  nonfunctional placeholder and disabling project writes through the legacy
  Web path.

## Verification before push

- PASS — the isolated preview database accepted the user-supplied current
  password; `/api/health` and `/api/ready` returned `ok: true` from the
  immutable preview deployment.
- PASS — a provider-managed preview Auth user completed password sign-in and
  has exactly one active tenant membership.
- PASS — Vercel reports the preview deployment ready and its server functions
  in `icn1`.
- PASS — Node 22.23.2 Web typecheck, pinned actionlint, and `git diff --check`.
- NOT RUN locally — the full browser smoke after the header change. The local
  wrapper deliberately did not extract the Vercel bypass value into a local
  file; the configured GitHub secret and fresh trusted-PR job are the
  authoritative execution path.

## Next gate

Push this changeset, rerun the same-repository PR workflow, and require the
trusted authenticated E2E report to pass before merging or dispatching the
canonical production promotion workflow.
