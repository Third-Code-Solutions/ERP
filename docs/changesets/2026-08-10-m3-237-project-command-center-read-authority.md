# M3.237 project command-center read authority

Status: source-only complete; Web cutover closed

## Scope

- Add shared strict command-center query/result types.
- Add Nest `GET /v1/projects/:projectId/command-center` with exact
  tenant/project authorization and six bounded aggregates.
- Add a Web Core adapter with exact-tenant response validation and a
  disabled-by-default allowlist selector.
- Preserve the existing direct six-query project-detail read as the rollback
  and mixed-version compatibility path.
- Prove the protected HTTP route with disposable PostgreSQL/Redis evidence.

## Changed files

- `packages/shared-types/src/erp-api/project-command-center.ts`
- `packages/shared-types/src/erp-api/project-command-center.test.ts`
- `packages/shared-types/src/index.ts`
- `apps/api/src/projects/project-command-center.pipe.ts`
- `apps/api/src/projects/project-command-center.service.ts`
- `apps/api/src/projects/projects.controller.ts`
- `apps/api/src/projects/projects.module.ts`
- `apps/api/integration/projects.database.integration.spec.ts`
- `apps/api/test/projects.e2e.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/project-queries.ts`
- `apps/web/src/lib/project-queries.test.ts`
- `apps/web/src/lib/project-command-center-core-client.test.ts`

## Verification

- PASS: shared contract 2/2.
- PASS: Web Core client 3/3 and project-query tests 11/11.
- PASS: protected API HTTP canary 1/1.
- PASS: root `pnpm test`, 173 files / 750 tests.
- PASS: root typecheck, lint, and production build.
- PASS: disposable PostgreSQL 17 / Redis 7.4.9 lane; 116 migrations;
  database 149/149 suites and 370/370 tests; API integration 33/33 files and
  49/49 tests with zero skips.
- PASS: schema-before/after SHA-256 unchanged:
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.

## Rollout and rollback

`ERP_PROJECT_COMMAND_CENTER_READS_VIA_API` remains `false` and
`ERP_PROJECT_COMMAND_CENTER_READS_VIA_API_TENANT_IDS` remains empty. No hosted
Supabase write, Vercel/Railway deployment, provider setting, credential, or
paid action occurred. A future canary must first verify hosted parity, exact
Core deployment identity, readiness, protected browser behavior, and rollback;
removing the allowlisted tenant or setting the flag to `false` returns the Web
surface to the direct compatibility read.
