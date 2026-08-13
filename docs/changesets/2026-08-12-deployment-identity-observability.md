# Deployment identity observability

## Outcome

VERIFIED IN LIVE PRODUCTION. Health/readiness endpoints retain traceability
for manual Vercel deployments that lack Git metadata.

## Changes

- `deploymentRevision()` now falls back to `VERCEL_DEPLOYMENT_ID`, then
  `VERCEL_URL`, after provider-neutral and Git revision values.
- Added unit coverage for the fallback.
- Updated deployment runbook requirements.

## Verification

- PASS — `pnpm --filter @third-code-erp/web test -- deployment-revision.test.ts --run` (5/5).
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — live `/api/health` returns 200 with revision `8268bbf93fae`.
- PASS — live `/api/ready` returns 200 with `database: up` and revision
  `8268bbf93fae`.
- PASS — exact production deployment
  `dpl_DgYiznS1Y4bpHnbS5i8XFdaYU34b` is Ready and aliased to
  `https://thirdcode-erp.vercel.app`.
