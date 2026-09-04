# Route release: registry audit blocks production promotion

Status: BLOCKED, 2026-09-04 08:11 +08:00.

The user selected a safer, schema-compatible route-only release to Vercel and
Railway. PR #33 is merged as `3564ebe8fac7a5d9559cb6269f6e3194dd6e365c`.
The broader platform feature remains excluded in draft PR #32.

## Verified evidence

- PR CI [33818119612](https://github.com/Third-Code-Solutions/ERP/actions/runs/33818119612): all nine jobs PASSED, including dependency/secret scanning, build and trusted-preview browser tests.
- Main CI [33819088752](https://github.com/Third-Code-Solutions/ERP/actions/runs/33819088752): lint, types, invariants, unit tests, build and database reproducibility PASSED. The dedicated Postgres 17 lane passed 427 database and 80 API integration tests without skips and rebuilt the unchanged 157-migration schema.
- Main security audit FAILED in all three attempts because npm's `/-/npm/v1/security/audits/quick` endpoint returned `ERR_SOCKET_TIMEOUT` after retries. No vulnerability report was returned; this is not a passed audit or a confirmed vulnerability finding.
- Independent local audit also FAILED with the same endpoint timeout. A second diagnostic used `npm_config_fetch_timeout=180000`, `npm_config_fetch_retries=0`, and `pnpm audit --prod --audit-level low`; it produced no result and was terminated. No repository configuration or security threshold was changed.
- Read-only production migration preflight PASSED: 157/157 current, no pending migration. No schema change or database restoration is part of this release.
- Production workflow [33819088866](https://github.com/Third-Code-Solutions/ERP/actions/runs/33819088866) was approved normally, then deliberately CANCELLED during pre-deployment release gates when the main audit timed out. All three provider deployment steps were SKIPPED.
- Post-cancellation live Web health still reports `0a248bc08c37`; Railway Core API and CAD health both return HTTP 200. No provider deployment or configuration change occurred.

The production-only expanded route smoke, role matrix, CAD journeys, recovery
request and profile-password rotation checks are NOT RUN for this release,
because promotion did not occur. Preview tests are not proof of new live routes.

## Safe continuation

1. Retry the unchanged failed main CI security job when the registry responds.
   Do not ignore registry errors, suppress advisories, change dependencies or
   bypass a gate merely to obtain green status.
2. Confirm the intended `main` SHA and all applicable checks, then dispatch the
   existing `deploy-production.yml` workflow and use its normal environment review.
3. Require current migration parity; deploy the existing Railway Core/CAD and
   Vercel targets; verify exact release identity and all production browser gates.
4. Retain the previous provider artifacts for rollback. No database restoration,
   PITR purchase, recovery copy or migration is authorized by this route release.

No implementation redo is needed for this blocker. No automatic background
continuation is scheduled. Production remains on the previous healthy release.
