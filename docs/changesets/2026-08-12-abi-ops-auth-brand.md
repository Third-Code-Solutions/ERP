# ABI OPS authentication branding

## Outcome

Implemented the requested ABI OPS lockup on authentication and signed-in
application navigation surfaces.

## Changes

- Replaced the desktop and mobile auth marks with the ABI `A` mark treatment.
- Replaced `Third Code ERP` with `ABI OPS`.
- Updated dashboard sidebar and breadcrumb branding to `ABI OPS`.
- Kept legal identity separate as `Actuate Builders Inc.` on the signed-in
  sidebar lockup.
- Added an opt-in authenticated Playwright regression covering the signed-in
  shell.
- Replaced the old company subtitle with `Actuate Builders Inc.`.
- Updated the login account-creation prompt to use ABI OPS.
- Added a render regression test covering both responsive lockups and removal of
  the old visible branding.

## Verification

- PASS - focused auth branding render test.
- PASS - `pnpm --filter @third-code-erp/web typecheck`.
- PASS - `pnpm --filter @third-code-erp/web build`.
- PASS - local production `/auth/login` returned HTTP 200 with ABI OPS, the A
  mark, and Actuate Builders Inc. rendered in the response.
- PASS - Playwright auth suite: 3/3 tests using installed Chrome.
- PASS - authenticated Chromium E2E 1/1 against current configured
  Supabase-backed app: `/dashboard` rendered ABI OPS sidebar and breadcrumb,
  Actuate Builders Inc. legal label, and zero console/page errors.
- NOT RUN - production deployment; no deployment was requested for this
  branding-only change.
