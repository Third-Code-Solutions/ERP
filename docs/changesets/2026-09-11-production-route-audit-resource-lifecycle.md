# Production route-audit resource lifecycle

## Change

- Reused one authenticated and one anonymous Playwright page across the
  complete route audit instead of creating and closing a page for every route.
- Kept full navigation, render, guard, console-error, and page-error assertions
  intact while attaching and detaching route-local listeners for each check.
- Bound the browser and Supabase Realtime client count during the long
  production audit so later routes are not affected by accumulated page
  teardown or connection pressure.

## Verification

- Production route audit reproduced the vendor-performance failure on the
  merged revision while manual fresh-page navigation rendered successfully.
- Web typecheck/lint could not be completed locally because this workstation's
  shared dependency links are incomplete and Node 24 differs from the CI
  Node 22 runtime; GitHub Actions remains authoritative for this test-only
  change.
- The complete route audit must pass in the protected production workflow
  before promotion is considered complete.

## Boundary

No application route, database, authorization, or production data behavior was
changed. The protected production workflow remains the only deployment path.
