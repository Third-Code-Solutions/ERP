# Schedule labour PostgreSQL evidence

Added `apps/api/integration/project-labour-reconciliation.database.integration.spec.ts`, using the actual Core service, shared reconciliation builder and PostgreSQL query results. `ERP_API_INTEGRATION_EXPECTED=1` requires an explicit loopback database URL; without the integration lane opt-in the suite is skipped, matching existing API integration conventions. No service, schema or migration changes were made.

## Proven cases

- Tenant and project filtering excludes another project in the same tenant, a foreign tenant's tasks and cancelled tasks. Exact captured totals are 90 planned/93 actual minutes (variance 3), with reported/not-due evidence and 15,246 basis-point utilization on the 61/93-minute task.
- Active, blocked and completed zero-actual tasks produce three missing-evidence rows and partial status; totals remain 51 planned/7 actual (variance -44). Zero planned minutes with actual evidence produces null utilization, not an invented estimate.
- Empty and cancelled-only projects return unavailable with empty rows and zero totals.
- Foreign/retired projects are rejected, as are missing users and current database memberships belonging to another tenant despite a caller-supplied tenant claim.
- Real catalog assertions verify enabled and forced RLS plus denied anon/authenticated SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER privileges. Actual client-role SELECT/INSERT/UPDATE/DELETE attempts return SQLSTATE 42501. A real service-role SELECT retrieves the exact synthetic tenant/project task. Read reconciliation leaves ordered audit snapshots unchanged.

## Verification

Executed against `postgresql://postgres:postgres@127.0.0.1:54322/erp_claim_authority_20260912`, the explicitly authorized synthetic local PostgreSQL database with 172 applied migrations. No hosted writes or real business data were used.

- With that `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1`: `pnpm --config.engine-strict=false --filter @third-code-erp/api exec vitest run integration/project-labour-reconciliation.database.integration.spec.ts` — 7/7 passed, no skips; final run after deterministic audit ordering also passed 7/7.
- `pnpm --config.engine-strict=false --filter @third-code-erp/api exec tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --experimentalDecorators --emitDecoratorMetadata --strict integration/project-labour-reconciliation.database.integration.spec.ts` — passed.
- `git diff --check` — passed.
- Main independently passed the new labour and existing schedule PostgreSQL suites together (18/18, JSON no-skips checked), then the final ordered labour spec (7/7, JSON no-skips checked). Main also passed the dedicated strict TypeScript command above. The existing CI integration glob includes this spec; fresh CI results are still pending.

These are additive evidence tests for existing correct behavior, not a RED/GREEN service fix. No query-result mocks, destructive cleanup or append-only audit changes were used. UUID-isolated committed fixtures remain in the disposable database because the actual service uses its readonly pool client; no database was dropped or reset. Role changes are transaction-local.

## Limits and handoff

### CI role-grant correction

CI run 34701882122 failed the service-role read assertion while 508 database tests passed. Reproduced on the separate CLI-equivalent synthetic database `erp_claim_ci_grants_20260912`: catalog SELECT privilege was false and an actual service-role SELECT returned permission denied. Read-only hosted catalog inspection confirmed SELECT is present for service_role, absent for authenticated, with enabled/FORCE RLS. The post-reset CI fixture now grants only SELECT on `project_schedule_tasks` to service_role. No client grant, production migration, policy change or test relaxation was made. The unchanged seven-test labour suite passed on that formerly failing database after fixture application; independent JSON no-skips verification passed. Fresh CI remains required. This database has replayed SQL but no migration ledger and is not production restore evidence.

This proves the scoped read and database authority contracts, not JWT issuance/session revocation, browser role coverage, production performance, or candidate deployment. The service's membership query validates current tenant/role; active-account/tenant HTTP enforcement belongs to the JWT guard and is not claimed by these direct-service tests. Hosted state and inherited migration recovery holds remain unchanged. Local Node 24/pnpm 10 uses the engine override; CI Node 22 remains authoritative.

→ Handoff to Agent 12/13 (main): independently run the focused PostgreSQL suite and types, then verify inclusion through the existing required integration CI glob. No commit, push or deployment performed by this agent.
