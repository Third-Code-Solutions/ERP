# RBAC route hardening

## Summary

- Added explicit `bom.read`, `delivery.schedule`, and
  `dashboard.analytics.read` capabilities without expanding the pre-existing
  effective audiences.
- Made dashboard route authorization fail closed and covered every current
  dashboard page with a route-policy regression test.
- Bound sensitive project Billing, Cost, BOM, Audit, and Access routes and
  navigation tabs to their relevant capabilities.
- Removed the Estimator-to-Commercial navigation alias; Estimator retains its
  explicit BOM route but no longer receives Commercial-only navigation.
- Hid delivery scheduling from Viewer and enforced the same central capability
  in the page and server action.
- Expanded the production role-matrix harness definition from 11 to 13 roles.

## Verification

- `apps/web` typecheck, lint, production build, and 965 unit tests passed.
- `packages/shared-types` unit suite passed: 397 tests.
- Authenticated production role E2E remains environment-gated and was skipped
  locally because `E2E_ROLE_MATRIX_AUTH` is not enabled.

## Follow-up

See `docs/blockers/2026-08-23-rbac-entitlement-matrix.md` for the approved
role-matrix decision still required before narrowing the currently broad CRM,
pipeline, and analytics grants.
