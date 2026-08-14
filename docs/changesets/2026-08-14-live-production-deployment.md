# Live production deployment — 2026-08-14

## Completion state

PARTIALLY VERIFIED. The current Web and Core working-tree changes are live.
Deployment, health, browser, migration-head, schema, RLS and work-order gates
passed. The release is not fully green because production audit-hash integrity
fails and the BUILD OPS data scan lacks its required demo-tenant configuration.

## Deployed

- Web: Vercel deployment `dpl_Ve91H9uLJQ7MqmDRPoyPo5osnvDC`, state `READY`,
  production alias `https://thirdcode-erp.vercel.app`.
- Core API: Railway deployment `190d69df-8efd-41cf-b7a1-de86c9977aff`, state
  `SUCCESS`, readiness check passed, image digest recorded by Railway.
- CAD worker: not redeployed; no worker source changes were present. Existing
  health endpoint returned HTTP 200 with DWG support enabled.
- Database: no migration was written because the production database already
  reports all 142 source migrations through `20260814130000`.

## Verification

- PASS — Vercel production build and promotion.
- PASS — Railway Core build, deployment and runtime startup.
- PASS — live Web browser smoke at desktop, tablet and mobile sizes.
- PASS — Web and Core health/readiness probes; CAD health probe.
- PASS — production PostgreSQL 17 and migration head `20260814130000`.
- PASS — production audit coverage `170/170` tenant-scoped tables.
- PASS — production `verify:wo-02-database`.
- PASS — production `verify:wo-04-database`.
- PASS — production `verify:wo-05-database`.
- PASS — production `verify:wo-06-database`.
- FAIL — production audit-hash integrity: 46 legacy-JSON profiles, 147
  unknown profiles and 2 predecessor-chain gaps in the canonical-UUID tenant
  checked; one additional tenant has a non-canonical recovery identifier.
- BLOCKED — `verify:build-ops-data --database`: no
  `BUILD_OPS_DEMO_TENANT_IDS` or `BUILD_OPS_DEMO_TENANT_SLUGS` production
  configuration.

## Operational notes

- Deployment used the dirty working tree requested by the user; no commit,
  push, branch change or destructive Git operation was performed.
- No production business rows, migrations, secrets or provider environment
  values were changed.
- Railway metadata still contains stale Web build-command configuration beside
  the active Dockerfile deployment. This is configuration drift to clean up in
  a separate controlled change.
- Build logs reported ignored dependency build scripts as warnings; builds and
  readiness checks still passed.
