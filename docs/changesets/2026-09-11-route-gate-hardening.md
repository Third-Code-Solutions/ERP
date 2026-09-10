# Route and release-gate hardening

## Change

- Added UUID route-parameter validation to the new tender, site diary,
  quality, RFI, schedule, and submittal pages.
- Registered the new workflow routes in the dashboard inventory and preserved
  the capability-gated vendor-performance route policy.
- Updated route QA fixtures to cover the process-task queue bridge and isolated
  cost-page query-planning tests from the optional material-actuals reader.

## Verification

- Focused route, page, and inventory tests: PASS (37 tests).
- Full web test suite: PASS (1,958 passed; 2 skipped).
- `git diff --check`: PASS.

## Boundary

The protected production workflow remains the only authorized deployment path;
hosted migrations, provider deploys, health checks, and authenticated
production E2E must still pass in GitHub Actions before production is considered
deployed.
