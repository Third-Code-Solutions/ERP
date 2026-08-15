# Production data-boundary guard

## Implemented

- Added a read-only production database scanner that requires an explicit
  `PRODUCTION_DATABASE_URL` and exact demo-tenant allowlist for promotion.
- The scanner detects E2E-prefixed values outside the allowlist and seeded test
  identities (`@abi-ops.test`, `@buildops.local`, E2E/Demo names) outside it.
- Reports are redacted to table, column, tenant, and row identity metadata; no
  matching business values are printed.
- Production promotion now fails before migrations or provider deployment when
  the boundary is not clear.
- Demo role-account seeding now requires both `--apply` and
  `DEMO_SEED_ALLOW_MUTATION=1`.

## Verification

- PASS — pure boundary evaluator and workflow contract tests.
- PASS — read-only scan against the configured hosted database completed.
- BLOCKED — production promotion: two E2E-prefixed rows remain in the
  `e2e-qa-20260513-foreign` tenant. No data was changed.
