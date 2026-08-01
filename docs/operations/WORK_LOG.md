# Work Log

## 2026-07-27 — M0 audit and M1 transaction foundation

Completed:

- Audited frameworks, business-logic locations, actions/routes, Python,
  database/RLS, auth/tenant isolation, module quality, tests, and deployment.
- Added NestJS modular-monolith foundation under `apps/api`.
- Added database-backed identity/tenant membership and explicit Project update
  capability enforcement.
- Added PostgreSQL transaction ownership, row lock, tenant predicate,
  optimistic concurrency, and transactional audit actor attribution.
- Added Redis/BullMQ connection foundation and health/readiness endpoints.
- Added a strict shared Project update contract.
- Added a server-only Next compatibility adapter behind
  `ERP_PROJECT_WRITES_VIA_API=false`.
- Added service and HTTP contract/security tests.
- Added production container definition and bundled internal workspace code.
- Added bounded Redis connection diagnostics after built-artifact smoke testing
  exposed repeated unhandled connection-error output.

Changed files for this milestone:

- `apps/api/**`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.ts`
- `packages/shared-types/src/erp-api/projects.ts`
- `packages/shared-types/src/index.ts`
- `.env.example`
- `apps/web/.env.example`
- `pnpm-lock.yaml`
- the six architecture/operations memory files
- `README.md`

Scoped validation:

- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api test` — pass, 5 tests.
- `pnpm --filter @third-code-erp/api test:e2e` — pass, 2 tests.
- `pnpm --filter @third-code-erp/api build` — pass.
- `pnpm --filter @third-code-erp/web typecheck` — pass.

Workspace and operational validation:

- `pnpm lint` — pass; current lint scripts are TypeScript-only checks.
- `pnpm typecheck` — pass.
- `pnpm test` — pass: 254 executed tests; 102 existing database tests skipped
  by environment/migration conditions.
- `pnpm build` — pass: Nest production bundle and 77 Next.js static pages.
- `node scripts/verify-database-repro.mjs --files-only` — pass: 43-file
  migration ledger and seed checks.
- `pnpm verify:workflow-action-refs` — pass for all five pinned public action
  tags.
- `git diff --check` — pass; line-ending warnings only.
- Forbidden source trace scan — no external ERP or former-product branding
  terms in application, packages, migrations, scripts, docs, or README.
- Built API smoke — `/health` 200; missing-bearer Project write 401; `/ready`
  503 with deliberately absent PostgreSQL/Redis; Redis emits one bounded
  diagnostic instead of unhandled repeated errors.

Unresolved:

- No real database/Auth/Redis integration or API preview deployment yet.
- The Docker engine probe was unresponsive; container build and clean-Supabase
  reproduction could not run locally.
- The full database catalog verifier was not run. Static migration-ledger
  verification passed, but 102 database tests remain skipped.
- Python direct writes and inconsistent legacy authorization/audit remain.
- ESLint is not configured; the current lint gate performs TypeScript checks.
- The feature flag remains off; no production behavior changed.

## 2026-07-27 — M1 integration-gate hardening

Completed:

- Extracted Supabase token verification behind an injectable identity service
  while retaining Supabase as the production verifier.
- Added seven local guard tests for missing/invalid tokens, database-derived
  principal membership, explicit capabilities, denial, and public routes.
- Added a disposable PostgreSQL integration test for real Nest guards and
  Project SQL behavior: 401, 403, tenant 404, stale 409, success, audit actor,
  and outer transaction rollback.
- Added Redis 7.4.9 to the clean PostgreSQL 17 CI job.
- Added the Nest database integration command to that job.
- Added production-container build and `/health`, `/ready`, and 401 smoke
  checks against disposable PostgreSQL and Redis.
- Ran the configured remote database verifier read-only. PostgreSQL 17 passed,
  but 23 migrations and their dependent objects are missing. No write or
  migration was performed.

Validation:

- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api test` — pass, 12 tests.
- `pnpm --filter @third-code-erp/api test:integration` — correctly skipped
  locally because the explicit disposable-database flag is absent.
- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — pass.
- `pnpm build` — pass for Nest and 77 Next pages.
- Local official `actionlint` — pass.
- Remote configured catalog verifier — expected stop-ship failure: 23 missing
  migrations and 25 failed invariant groups.

Unresolved:

- The new CI integration/container lane has not executed on GitHub.
- Local Docker remains unavailable.
- Supabase Auth token verification still requires preview evidence.
- The configured database requires a separately reviewed migration rollout.
- `ERP_PROJECT_WRITES_VIA_API` remains false.

## 2026-07-27 — Hosted database release preflight

Completed:

- Added `scripts/plan-database-release.mjs`, a read-only target/repository
  ledger comparator.
- Added SHA-256 evidence for every missing migration.
- Added conservative warnings for object drops, truncation, data deletion,
  data rewrites, explicit transaction control, and commands unsafe inside a
  transaction.
- Added seven Node tests covering ledger, SQL-risk, hash, and release-gate
  classification.
- Made `--require-current` reject every reported release blocker, including a
  non-PostgreSQL-17 target, even when the migration ledger itself is current.
- Added the planner tests to CI and a `--require-current` check to the clean
  PostgreSQL 17 job.
- Added `docs/runbooks/database-release.md` with backup/PITR, logical export,
  Storage recovery, restored-clone rehearsal, release, abort, and recovery
  requirements.
- Corrected `docs/DEPLOYMENT.md`: the migration ledger has no reliable paired
  down scripts, and hosted `db reset` is prohibited.
- Verified pinned Supabase CLI 2.109.1 help for `db dump`, `db push`, and
  `migration list`.

Read-only configured-target result:

- Status: `blocked_non_linear_history`.
- PostgreSQL: 17.
- Applied: 20 of 43.
- Missing: 23.
- Unexpected: 0.
- Later repository versions after the first gap: 13.
- No migration SQL executed.

Validation:

- `pnpm test:database-release-plan` — pass, 7 tests.
- Local official `actionlint` — pass.
- `pnpm verify:workflow-action-refs` — pass for all five pinned action refs.
- `pnpm lint` — pass; current lint remains TypeScript-only.
- `pnpm typecheck` — pass.
- `pnpm test` — pass: 261 executed tests; 102 database tests skipped outside
  the disposable integration environment.
- `pnpm build` — pass: Nest production bundle and 77 Next.js pages.
- Fresh uncached `pnpm turbo test --force` — pass after adding an explicit
  15-second timeout to the Nest HTTP harness; 261 tests executed and 102
  environment-gated database tests skipped.
- Fresh uncached `pnpm turbo build --force` — pass for Nest and all 77 Next.js
  pages.
- Scoped `git diff --check` — pass; line-ending warnings only.
- Forbidden source-trace scan — no external ERP or former-product names.

Unresolved:

- Rehearsal requires an isolated restore/clone and explicit release authority.
- Current Docker remains unavailable locally.
- New CI planner, Nest integration, Redis, and container lanes have not run on
  GitHub.
- No production migration, history repair, feature flag, or deployment was
  performed.

## 2026-07-28 — pnpm dependency-policy reproducibility

Completed:

- Verified against current official pnpm documentation that pnpm 10 no longer
  reads settings from `package.json#pnpm`.
- Moved the existing `drizzle-orm` override and peer-warning policy to
  `pnpm-workspace.yaml`.
- Removed only the ignored root `package.json#pnpm` block.
- Preserved the existing resolved dependency graph.

Changed files:

- `pnpm-workspace.yaml`
- `package.json`
- the six architecture/operations memory files

Validation:

- `pnpm install --frozen-lockfile` — pass; ignored-setting warning removed.
- Lockfile SHA-256 before/after —
  `A95947EAAF1B9D3801A27D5F551EF29239E1CF930BBD1FF8AAD0DF925E41A2C3`;
  no lockfile mutation.
- Recursive dependency listing — API, web, and database all resolve
  `drizzle-orm@0.40.1`.
- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — pass by valid Turbo cache replay from the prior fresh
  uncached 261-test run; 102 database cases remain environment-gated.
- `pnpm build` — pass; Nest rebuilt, 77-page Next build replayed from valid
  cache.
- `pnpm test:database-release-plan` — pass, 7 tests.
- `pnpm verify:workflow-action-refs` — pass, 5 refs.

Unresolved:

- Read-only API probes with all three locally configured GitHub CLI identities
  receive repository 404, so the uncommitted CI lane cannot be dispatched.
- `git ls-remote --heads origin` independently fails with
  `Repository not found`; the configured remote is
  `https://github.com/Third-Code-Solutions/ERP.git`.
- No account switch, commit, push, CI run, database write, feature-flag change,
  or deployment was performed.

## 2026-07-28 — Supabase reconciliation and release hardening

Completed:

- Verified the authorized Supabase project ref
  `aqqrtkmtcsfkbyyqxowv` is active PostgreSQL 17.
- Captured pre-release row, money, audit, and Storage baselines.
- Dry-ran all 23 missing migration versions before execution.
- Confirmed transaction-mode port 6543 failed before SQL execution because
  prepared statements are unsupported there.
- Applied the reviewed migration set using session-mode port 5432.
- Added and applied
  `20260727162024_security_advisor_hardening.sql`.
- Reached a current 44/44 migration ledger with no unexpected versions.
- Verified 86 public tables, 315 RLS policies, 30 protected-table groups,
  finance/inventory controls, privileges, helper hardening, and tenant
  isolation invariants.
- Preserved all captured business baselines: 2 tenants, 13 users, 25 projects,
  13 purchase orders, 4 invoices, 660 audit rows, 37 Storage objects,
  378,642,000 purchase-order cents, and 118,200,654 invoice-net cents.
- Did not apply `supabase/seed.sql`; it is explicitly a local/CI reset fixture.
- Replaced deprecated `[inbucket]` local configuration with `[local_smtp]`.
- Removed remaining former-product labels from source comments and planning
  text.
- Prevented database test harnesses from discovering hosted application URLs
  in `.env.local`. Database tests now require explicit disposable
  configuration.

Changed files for this release-hardening increment:

- `supabase/migrations/20260727162024_security_advisor_hardening.sql`
- `supabase/config.toml`
- `packages/database/src/sql/audit-triggers.sql`
- `packages/database/src/__tests__/_db-harness.ts`
- `packages/database/src/__tests__/rls-isolation.test.ts`
- `scripts/verify-database-repro.mjs`
- the six architecture/operations memory files
- former-brand comments/planning references

Validation:

- `pnpm install --frozen-lockfile` — pass.
- `pnpm lint` — pass; current lint remains TypeScript-only.
- `pnpm typecheck` — pass.
- Fresh `pnpm turbo test --force` — pass: 235 executed, 128 explicitly
  disposable-database-gated.
- Fresh `pnpm turbo build --force` — pass: Nest production bundle and all
  77 Next.js pages.
- `pnpm test:database-release-plan` — pass, 7 tests.
- Hosted release planner with `--require-current` — pass, 44/44.
- Hosted catalog verifier — pass, 44 migrations and 30 protected tables.
- `pnpm verify:workflow-action-refs` — pass, 5 refs.
- Official `actionlint` binary — pass.
- `git diff --check` — pass; line-ending warnings only.
- Gitleaks 8.30.1 staged scan — pass, zero findings.
- Former-brand/external-source trace scan — pass, zero findings.

Deployment blockers:

- GitHub origin still returns `Repository not found`.
- Vercel CLI 54.7.1 cannot access scope `pavi-2e9809a4`; the connected Vercel
  app can inspect the exact project but its no-argument deploy operation cannot
  safely select this out-of-workspace source tree.
- Railway CLI identity is unauthorized for project
  `a21fd382-80b2-4218-8025-11f420a062e3`.
- No application deployment or feature-flag enablement was claimed.

## 2026-07-28 — M1 source publication and Railway deployment

Completed:

- Switched the active GitHub CLI identity to `kurtgav`.
- Published the reviewed source to private repository
  `Third-Code-Solutions/ERP`; `origin/main` reached
  `f28af8098de29e8f5627cd383261ef8d1c456df2`.
- Added reviewed Railway Docker deployment configuration and a bounded build
  context.
- Renamed Railway service `c45b3d01-036a-4663-a524-0713d782fce3` to
  `Third Code ERP API`.
- Added managed Redis service
  `55639597-de49-4825-9073-eafad0332efe`.
- Configured NestJS database, Supabase, Redis, CORS, runtime, start, health,
  restart, and watch-path settings without exposing values in source or logs.
- Deployed Railway release `8ccba547-8dde-4c37-8bcb-3f3834c18358`.
- Corrected the public domain target to injected runtime port 8080.
- Verified live API `/health` and `/ready`; PostgreSQL and Redis both report
  ready.
- Added Vercel `ERP_CORE_API_URL`, reconnected the project from the stale
  transferred-repository redirect to `Third-Code-Solutions/ERP`, and created a
  main-branch deploy hook.
- Returned `ERP_PROJECT_WRITES_VIA_API` to disabled for Production and Preview
  before any current frontend release.

Changed files:

- `railway.toml`
- `.dockerignore`
- `.gitignore`
- the six architecture/operations memory files

Validation:

- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api test` — pass, 12 tests.
- `pnpm --filter @third-code-erp/api build` — pass.
- `git diff --check` — pass.
- Railway remote Docker build — pass.
- Railway `/health` — 200, service `third-code-erp-api`.
- Railway `/ready` — 200, database `ok`, Redis `ok`.
- Local Docker build — not run; Docker Desktop engine unavailable.

External blockers and rollback:

- GitHub Actions run `30288549139` failed before any step because the
  organization account has failed payments or an insufficient spending limit.
  Every dependent job was skipped.
- Vercel deployment `dpl_5Sdged8VSEc1if2UTAxWgPxYQ43P` was blocked before
  build because its historical commit mapped to non-team GitHub user
  `thirdcodekurt`. The production alias remained on the prior READY release.
- Rollback remains immediate: keep the Vercel write flag disabled, leave the
  prior frontend alias untouched, and redeploy the prior Railway release if
  API health regresses.

## 2026-07-28 — M1 Vercel production release

Completed:

- Pushed commit `e0060b40097fed9733eea8149e09f92460807f7d` as
  `kurtgav <kurtgavin.design@gmail.com>`.
- Vercel accepted the GitHub identity, built the Next.js application, and
  promoted production deployment `dpl_GctXj21P7kEQM4xbsfPU5rmUEC7t`.
- Enabled Vercel Web Analytics after browser QA found its script returning
  404.
- Redeployed the same reviewed SHA as
  `dpl_EUTTu6My37zSWEzt57XvPTa3MdhZ`; state is READY and the canonical alias
  points to it.
- Kept `ERP_PROJECT_WRITES_VIA_API=false` for Production and Preview.

Validation:

- Production `/` — 200.
- Production `/auth/login` — 200 with correct email/password autocomplete.
- Unauthenticated `/dashboard` — 307 to `/auth/login`.
- `/robots.txt` — 200 with private application routes disallowed.
- `/sitemap.xml` — 200 with the canonical landing URL.
- Canonical metadata, index/follow metadata, title, and description — pass.
- Desktop 1280×720 — no horizontal overflow; required images load.
- Mobile 390×844 — no horizontal overflow; navigation and CTAs remain usable.
- Final browser console — zero errors and zero warnings.
- Web Analytics script — 200 JavaScript.
- Runtime script metadata — exact production deployment
  `dpl_EUTTu6My37zSWEzt57XvPTa3MdhZ`.
- Former-product/prohibited-source live text scan — zero findings.
- Railway `/health` and `/ready` remained 200 after frontend release.

Remaining:

- GitHub Actions cannot start runners until the organization billing/spending
  issue is resolved.
- Live Supabase Auth and denial-path evidence for the Nest guard remains
  pending.
- The migrated Project-write flag remains disabled.

## 2026-07-28 — M1 live authorization and UUID compatibility

Completed:

- Inspected production authorization fixtures read-only: 13 active Auth-backed
  users across all canonical roles, two tenants, 24 Projects in the populated
  tenant, and one Project in a tenant with no users.
- Generated and immediately consumed one-time Supabase magic links for an
  allowed role and a Viewer. No passwords were read, printed, or reset.
- Exercised the deployed Nest guard only through guaranteed no-write paths.
- Found a real compatibility defect: a valid production Project uses a
  non-v4 UUID, while the route required UUID v4 and returned 400 before tenant
  lookup.
- Added a failing regression test, changed the route to accept all valid UUID
  forms, retained malformed-ID rejection, and deployed the fix.
- Published commit `bf3ca842b46fa832c4bd40a0f7f8bc27014ce43b`
  as `kurtgav <kurtgavin.design@gmail.com>`.
- Railway Git deployment `dd6d0098-c9b9-4825-ab2a-3da3131a09db` and explicit
  follow-up deployment `6b2a49aa-a7fa-4d4b-8b0a-51a06e6bdfae` both succeeded
  with `apps/api/Dockerfile`, `/ready`, and the reviewed start command.
- Vercel production deployment `dpl_FJjskHKyz1TztVwpNdoNR2TUhs7B` is READY on
  the same Git commit.

Changed files:

- `apps/api/src/projects/projects.controller.ts`
- `apps/api/test/projects.e2e.spec.ts`
- the six architecture/operations memory files

Validation:

- Regression red phase — expected 200, received 400.
- `pnpm --filter @third-code-erp/api test:e2e` — pass, 3 tests.
- `pnpm --filter @third-code-erp/api test` — pass, 13 tests.
- `pnpm --filter @third-code-erp/api lint` — pass.
- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api build` — pass.
- Railway `/health` and `/ready` — 200.
- Missing bearer — 401.
- Invalid bearer — 401.
- Malformed Project UUID — 400.
- Viewer without `project.update` — 403.
- Allowed user targeting another tenant — 404.
- Allowed user with stale timestamp — 409.
- Before/after target Project snapshots — equal.
- Before/after audit count/latest timestamp — equal, 660 rows.

Rollback and unresolved:

- Rollback: redeploy Railway deployment
  `8ccba547-8dde-4c37-8bcb-3f3834c18358` or revert the one-line UUID parser
  change. Project-write feature flag remains false.
- GitHub Actions still cannot start runners because of organization
  billing/spending limits.
- Successful hosted mutation/audit attribution, observability, reconciliation,
  and rollback drill remain required before enabling the migrated write path.

## 2026-07-28 — M1 command observability and rollback selection

Completed:

- Added UUID correlation from the Next Project adapter through Nest and back
  in the `x-request-id` response header.
- Added Project-route middleware that records one JSON command outcome after
  response completion.
- Restricted log content to event, request ID, operation, method, status,
  outcome, and duration. Tests prove bearer tokens, payload contents, query
  values, and Project IDs are absent.
- Added exact feature-flag tests and Server Action branch tests. Empty,
  `false`, and `TRUE` retain the legacy database/audit path; only exact `true`
  selects Nest.
- Added an inert Vitest-only alias for Next's `server-only` boundary marker.
- Published commit `4fd1451e756ccb578ed013016d644e5048af6f92`
  as `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `83849120-b063-4275-8727-0f6b13f0cd4e` succeeded from
  the reviewed Dockerfile with `/ready` and
  `node apps/api/dist/main.js`.
- Vercel production deployment `dpl_9X7Vwgjj22R7WxyhJte8aTLBYiSd` is READY
  on the same commit.

Changed files:

- `apps/api/src/observability/request-observability.middleware.ts`
- `apps/api/src/observability/request-observability.middleware.spec.ts`
- `apps/api/src/projects/projects.module.ts`
- `apps/api/test/projects.e2e.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.test.ts`
- `apps/web/vitest.config.ts`
- `apps/web/test/server-only.ts`
- the six architecture/operations memory files

Validation:

- TDD red phase: missing API observability module and missing Web
  `x-request-id`.
- API tests — 17/17 pass; HTTP tests — 4/4 pass.
- Web tests — 67/67 pass.
- Root lint, typecheck, test, and production build — pass.
- Total root tests — 244 pass; 128 database cases skipped without the
  disposable `DATABASE_URL`.
- Forbidden external-ERP/legacy-brand trace scan — zero findings.
- Staged secret-pattern scan — zero findings.
- Railway `/health` and `/ready` — 200.
- Production frontend and Analytics script — 200.
- Live no-write PATCH — 401 with caller UUID echoed.
- Railway application log — same UUID, `project.update`, 401, `rejected`;
  safe fields only.

Rollback and unresolved:

- No database, schema, storage, provider-environment, or feature-flag write
  occurred.
- Local branch rehearsal proves `false` selects the existing Server Action
  database/audit path and `true` selects Nest only.
- Provider-level enable/rollback was intentionally not run; the hosted flag
  remains disabled.
- GitHub Actions run `30293798902` failed before any step because recent
  account payments failed or the spending limit must be increased. Actionlint
  had zero steps; seven dependent jobs were skipped.
- Successful hosted mutation/audit attribution, reconciliation, clean CI, and
  provider-level enable/rollback remain required before activation.

## 2026-07-28 — M1 controlled hosted transaction and restoration

Completed:

- Verified the selected record was designated demo data and captured its full
  mutable-field baseline plus the same-tenant audit tail before writing.
- Confirmed the requested `kurtgav` identity remains the Git/provider release
  identity. No matching application Auth user exists, so no membership was
  fabricated; the transaction used an existing authorized demo-tenant owner.
- Generated and consumed a one-time Supabase magic link without reading or
  changing a password. The resulting one-hour authenticated session resolved
  to the expected existing owner.
- Sent one direct PATCH to the deployed Nest Project command. Only the nullable
  notes field received a unique temporary marker; the optimistic timestamp
  matched the captured baseline.
- Verified the 200 response, caller UUID echo, same-tenant result, committed
  value, actor attribution, exact `notes` plus `updated_at` audit diff, and
  predecessor hash.
- Restored every original business value through a second authorized Nest
  PATCH using the first result's optimistic timestamp.
- Independently reconciled the final hosted state through the connected
  Supabase project: business fields equal the baseline, exactly two Project
  audit rows were added, both actors/actions/diff keys are correct, marker
  transitions round-trip, and the tenant hash chain is continuous.
- Revoked the temporary refresh session, cleared the one-hour access JWT and
  all credentials from the in-memory execution kernel, and kept
  `ERP_PROJECT_WRITES_VIA_API=false`.

Changed files:

- the six architecture/operations memory files only

Validation:

- Railway `/health` and `/ready` before the transaction — 200.
- Controlled update — 200; UUID
  `a51faa1d-87d7-4274-9d8c-ab36d5019cbb` echoed.
- Exact-value restoration — 200; UUID
  `95e83e6a-7fe3-4059-84e7-c0dba0431c65` echoed.
- Railway application logs — both UUIDs, `project.update`, 200,
  `succeeded`; safe fields only.
- Supabase reconciliation — original notes restored; two new Project audit
  rows; actor, action, diff, round trip, predecessor hashes, and full tenant
  chain valid.
- Root lint and typecheck — pass.
- Root tests — 244 pass; 128 database cases remain skipped without the
  explicitly disposable `DATABASE_URL`.
- Root production build — pass; Nest compiled and Next generated all 77 pages.
- Post-proof frontend, Web Analytics, Railway `/health`, and Railway `/ready`
  checks — 200.
- Evidence commit `9a43e2308018cb2e1be28efbd7f2c7924de1aef4`
  published to both `main` and `agent-02/third-code-erp-landing` as
  `kurtgav <kurtgavin.design@gmail.com>`.
- Vercel production deployment `dpl_FKBxqFQgZP2KmLr8eoJfjY5LmQsJ` — READY
  on that commit, canonical alias attached, creator `kurtgav`.
- Railway correctly retained code deployment
  `83849120-b063-4275-8727-0f6b13f0cd4e`; documentation-only paths are
  outside the API service watch set.

Rollback and unresolved:

- Business rollback is complete. The intended append-only audit evidence and
  expected `updated_at` advances remain.
- No schema, storage, source-runtime, provider-environment, or feature-flag
  mutation occurred.
- GitHub Actions still cannot start runners because of organization
  billing/spending limits. Run `30295276528` failed with zero Actionlint
  steps and seven skipped dependent jobs.
- Clean disposable PostgreSQL/Redis CI and the provider-level
  enable/rollback drill remain required before activation.

## 2026-07-28 — M1 tenant-scoped Project canary control

Completed:

- Rechecked clean source and provider identities before editing. Git, GitHub
  CLI, Vercel, and Railway remain associated with `kurtgav`.
- Tried to start the pinned disposable PostgreSQL 17/Redis lane locally.
  Docker Desktop is installed, and `pnpm dlx supabase@2.109.1 --version`
  returns the CI-pinned version.
- Diagnosed the local runtime failure from Docker and Windows evidence:
  firmware virtualization is disabled, no hypervisor is present, and Docker
  reports `HCS_E_HYPERV_NOT_INSTALLED`. No Windows feature, BIOS, production
  database, or hosted environment was changed.
- Inspected the Vercel project environment UI read-only. The Project-write
  flag exists for Production and Preview under `kurtgav`; the sensitive value
  is not disclosed by the dashboard. The editor was cancelled without saving.
- Found that the existing single global Boolean could not perform the required
  controlled-tenant canary: exact `true` would route every tenant at once.
- Added a second server-side gate,
  `ERP_PROJECT_WRITES_VIA_API_TENANT_IDS`, evaluated against the authenticated
  user's database-derived tenant.
- Made missing, empty, invalid, non-matching, and mixed-wildcard allowlists
  fail closed to the legacy path. `*` works only as the sole explicit entry.
- Passed the tenant ID from the authorized membership lookup into the selector.
  No browser-controlled tenant value is accepted.
- Added a Project cutover runbook covering entry gates, read-only baselines,
  tenant canary order, audit/hash reconciliation, rollback, and abort recovery.
- Kept `ERP_PROJECT_WRITES_VIA_API=false`. No tenant allowlist or provider
  environment value was added or changed.

Changed files:

- `apps/web/.env.example`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.test.ts`
- `docs/runbooks/project-write-cutover.md`
- `docs/DEPLOYMENT.md`
- the six architecture/operations memory files

Validation:

- TDD red phase — three expected failures proved the global selector ignored
  tenant scope.
- Targeted Web tests — 4/4 pass.
- Root lint and typecheck — pass.
- Root tests — 244 pass; 128 database cases remain skipped without a
  disposable PostgreSQL instance.
- Root production build — pass; Nest compiled and Next generated all 77 pages.
- Source commit `79f32b7f24ade6d8902115db7e8b282af7e6f892` published to
  both `main` and `agent-02/third-code-erp-landing` as
  `kurtgav <kurtgavin.design@gmail.com>`.
- Vercel production deployment `dpl_7knv7FjxiYZ9Wj6DgvkC6cHVSjer` — READY
  on the source commit, canonical alias attached, creator `kurtgav`.
- Vercel working-branch preview `dpl_JCBnrVAeyoRuZbn6JsaehFTUHQm1` — READY
  on the same source commit, creator `kurtgav`.
- Railway deployment event `505b161b-2826-4b18-afc2-41504cf3fb80` — SKIPPED
  with `No changes to watched files`; the API correctly retained successful
  code deployment `83849120-b063-4275-8727-0f6b13f0cd4e`.
- Live canonical frontend, Railway `/health`, and Railway `/ready` — 200.
- Live landing output contains `Third Code ERP` and no
  external-ERP/legacy-brand trace.

Rollback and unresolved:

- Source rollback: revert the tenant-canary commit. With the production flag
  still exact false, deployment of this source does not route Project writes.
- GitHub Actions run `30296861757` remains blocked before runner startup by
  organization billing/spending limits. Actionlint had zero steps; seven
  dependent jobs were skipped.
- Local disposable parity requires enabling firmware virtualization and
  Windows Virtual Machine Platform, then restarting Windows.
- Clean zero-skip PostgreSQL/Redis CI remains required before configuring a
  tenant allowlist or changing the production flag.

## 2026-07-28 — M1 native zero-skip database evidence

Completed:

- Kept Docker Desktop and existing WSL distributions untouched after confirming
  firmware virtualization is unavailable.
- Imported a dedicated Alpine WSL1 test distribution and installed PostgreSQL
  17.10, pgvector 0.6.2, and Redis 8.0.4.
- Rebuilt the disposable database from zero through all 47 migrations and seed
  data. No hosted application database was used as a fixture.
- Made the security-advisor hardening migration portable when the optional
  `public.rls_auto_enable()` guide helper is absent.
- Added forward fixes for the receivable mirror trigger return, cash-posting
  PL/pgSQL alias resolution, bank-reversal ordering/concurrency, and Project
  Budget revision handoff.
- Updated payables/cash fixtures to satisfy current three-way-match and Cost
  Code evidence requirements.
- Corrected deterministic Stock Movement enum-order expectations and preserved
  exact transfer quantity/value assertions.

Changed files:

- `supabase/migrations/20260727162024_security_advisor_hardening.sql`
- `supabase/migrations/20260727194749_fix_receivable_mirror_return.sql`
- `supabase/migrations/20260727194757_fix_cash_posting_alias_resolution.sql`
- `supabase/migrations/20260727194805_fix_finance_workflow_guards.sql`
- `scripts/verify-database-repro.mjs`
- four database runtime test files
- the six architecture/operations memory files

Validation:

- Clean migration replay and seed — pass, 47/47.
- Catalog, RLS, function ACL, trigger, index, and ledger verifier — pass.
- Optional `rls_auto_enable()` verifier paths — absent pass; present and locked
  pass.
- Database release planner — current, 47/47, no gaps or unexpected versions.
- Dedicated database tests — 212/212 pass, zero skipped.
- Nest PostgreSQL/Redis integration — 1/1 pass.
- Supabase connected project check — `ERP`,
  `aqqrtkmtcsfkbyyqxowv`, ACTIVE_HEALTHY, PostgreSQL 17.
- Hosted migration release — pass, 47/47 with canonical head
  `20260727194805`; no gaps or unexpected versions.
- Hosted/local function parity — five repaired function MD5 fingerprints are
  identical.
- Hosted ACL verification — repaired privileged functions deny anon and
  authenticated execution and retain service-role execution.
- Hosted affected-row baseline — unchanged before/after: audit 662, invoices
  4, and zero rows in bank lines, cash transactions, journal lines, Project
  Budgets, and Supplier Bill lines.
- Supabase advisors after DDL — zero ERROR findings. Existing extension,
  intentional RLS-helper execution, leaked-password protection, duplicate
  index, and informational performance findings remain separately scoped.
- Root lint and typecheck — pass.
- Root tests — 244 pass; Turbo's filtered database task reports its normal 128
  skips, separately superseded by the fail-closed zero-skip lane above.
- Root production build — pass; Nest compiled and Next generated all 77 pages.

Rollback and unresolved:

- Source rollback: revert the forward-fix commit. After hosted application,
  database rollback is a reviewed compensating forward migration; never delete
  migration history or reset the linked project.
- Hosted Supabase is current at 47 migrations. Repository source publication
  and exact release-SHA/provider verification remain.
- GitHub Actions remains blocked before runner startup by organization
  billing/spending limits. Exact pinned Supabase PostgreSQL and Redis parity
  remains required before Project-write activation.
- `ERP_PROJECT_WRITES_VIA_API=false`; no tenant allowlist or provider
  environment changed.

Release evidence:

- Source commit `42010b9adce6ae89286449edfc1e27c9ffe1eda7`
  authored by `kurtgav <kurtgavin.design@gmail.com>`.
- GitHub refs `main` and `agent-02/third-code-erp-landing` both resolve to the
  exact source commit.
- Vercel production deployment `dpl_Hc4nUrodLQy98fextJvaowQLMU6J` — READY,
  canonical aliases attached, creator `kurtgav`, exact source commit.
- Vercel preview deployment `dpl_Cei1wPguAotpuJLaE4YoJUiFzxoR` — READY,
  creator `kurtgav`, exact source commit.
- Vercel canonical landing, `/api/health`, and `/api/ready` — 200. Build error
  filter and 15-minute runtime error scan — clean.
- Railway deployment `9e72f2c2-4e55-4878-ab4e-ace21b3fb0b7` — SUCCESS,
  running, exact source commit, commit author `kurtgav`. CLI session is
  `Kurt Gavin <kurtgavin.design@gmail.com>`.
- Railway `/health` and `/ready` — 200; database and Redis both `ok`.
- GitHub Actions run `30300165903` — billing/spending-limit failure before
  runner steps; Actionlint has zero steps and seven dependent jobs were
  skipped.

## 2026-07-28 — M1 release-tool reproducibility

Completed:

- Reran GitHub Actions run `30300434327`. Actionlint check
  `90092637986` again failed before runner startup with the exact
  account-payment/spending-limit annotation; it produced zero steps and no
  job log. Seven dependent jobs were skipped.
- Reproduced the Actionlint job in the isolated Linux lane. Upstream resolved
  the mutable bootstrap to Actionlint 1.7.12 and the workflow passed.
- Replaced the mutable `main` bootstrap with an explicit Actionlint 1.7.12
  release download and SHA-256 verification.
- Kept application code, database state, provider environments, tenant
  allowlist, and production write routing unchanged.

Changed files:

- `.github/scripts/run-actionlint.sh`
- `.github/workflows/ci.yml`
- the six architecture/operations memory files

Validation:

- Actionlint 1.7.12 on Linux — pass.
- Actionlint Linux release SHA-256 — pass.
- Pinned GitHub Action tag-to-commit checks — 5/5 pass.
- Frozen pnpm 10.33.0 install — pass; lockfile unchanged.
- Root lint and typecheck — pass.
- Root tests — 244 pass; the normal non-database lane reports 128 database
  skips, already superseded for source parity by the dedicated 212/212
  zero-skip lane.
- Root production build — pass; Nest compiles and Next generates 77 pages.
- Gitleaks 8.30.1 exact staged scan — zero findings.
- Repository identity — `kurtgav <kurtgavin.design@gmail.com>`.

Rollback and unresolved:

- Source rollback: revert the release-tool commit. No runtime or data rollback
  is required.
- Hosted CI remains blocked by GitHub account billing/spending limits. Local
  workflow validation cannot replace the missing hosted runner execution.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

Release evidence:

- Commit `d4ef08151fa60e62e239c0f049b08b1f83820789`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`, is synchronized to GitHub `main` and
  `agent-02/third-code-erp-landing`.
- GitHub Actions run `30301208797`, Actionlint check `90094308552` — failed
  before runner startup with the account-payment/spending-limit annotation;
  zero steps, no job log, seven dependent jobs skipped.
- Vercel production `dpl_Ch8gGs6VZgN1kKWM2RdWuPkrNdhV` — READY on the exact
  commit, canonical alias attached, creator `kurtgav`.
- Vercel preview `dpl_By2dCRLkMR6vKEntDGc2HVechvV4` — READY on the exact
  commit, creator `kurtgav`.
- Vercel production build error-only scan — clean; runtime error clusters in
  the 15-minute release window — none.
- Canonical landing, `/api/health`, and `/api/ready` — 200.
- Railway event `6091af41-a567-4edb-8d56-5c2067dbe3f0` — SKIPPED with
  `No changes to watched files`; commit author `kurtgav`. Healthy API
  deployment `9e72f2c2-4e55-4878-ab4e-ace21b3fb0b7` remains RUNNING on
  `42010b9adce6ae89286449edfc1e27c9ffe1eda7`.
- Railway CLI identity — `Kurt Gavin <kurtgavin.design@gmail.com>`.
- Railway `/health` — 200; `/ready` — 200 with database and Redis both `ok`.

## 2026-07-29 -- Vercel cost-control course correction

Completed:

- Inspected the connected Vercel project and the last 24 hours of deployments.
- Confirmed four CI-only source commits each triggered one production build
  from `main` and one preview build from the synchronized feature ref: eight
  READY deployments total.
- Confirmed latest production deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` is READY on
  `f24e5603a35571f8dcadd43fc09c64d12646a7d0`.
- Stopped further Git pushes and explicit Vercel deployment calls.
- Prepared LF enforcement for SQL and a value/path-specific Gitleaks allowlist
  locally; neither change has been pushed.
- Added the local Vercel fail-closed configuration
  `git.deploymentEnabled=false`; it remains unpushed until provider Git
  disconnection is approved and verified.
- Hardened transient-runner cleanup, removed stale runner credentials and work
  directories, and confirmed GitHub reports zero registered runners.
- Recorded decision D-034: source pushes do not authorize Vercel releases.

Validation:

- GitHub self-hosted run `30419757852` passed workflow validation, lint,
  typecheck, unit tests, all 48 migrations, 212/212 database tests, Nest
  integration, production build, and native Nest smoke.
- The only failure was Gitleaks rule `generic-api-key` on the deterministic
  `--restrict-key=0123456789abcdef0123456789abcdef` schema delimiter.
- The workflow contains no Vercel deploy command.
- Vercel deployment inventory showed no active build after the audit.
- Vercel JSON parse, PowerShell parse, Actionlint 1.7.12, Gitleaks 8.30.1
  across 90 commits, and `git diff --check` all pass for the local remediation.
- Root lint, typecheck, unit suites, Nest/Next production build, and all 77
  generated Next pages pass locally without cloud compute.
- The isolated database lane replays all 48 migrations on PostgreSQL 17, runs
  212/212 database tests with zero skips, passes Nest database integration, and
  reproduces schema SHA-256
  `963464C47A8C3B2F771ABB940A0DC106C103FD5DF2410707884B736110A58D26`.
- Disposable PostgreSQL/Redis services stopped cleanly after validation.

Provider and CI evidence:

- Vercel Git was disconnected with user authorization. Existing production
  stayed READY; landing, health, and readiness remained HTTP 200.
- Guard commit `ae373ce6f399e0d4bc5c7ef23537cc4f9b842837` was pushed to both
  release refs as `kurtgav`; Vercel created zero deployments.
- Self-hosted run `30421480977` passed every substantive gate, including the
  48-migration/212-test database lane, production build, native Nest smoke, and
  Gitleaks. It was cancelled only after setup-node's post-job pnpm cache upload
  remained stuck.
- Remote dependency-cache upload is removed from the self-hosted workflow.
  Follow-up run `30422175962` passed every step on exact SHA
  `277e03484c00b6c9c6e27bae7d708302bb6d2e88` in 5m33s.
- GitHub reports zero registered runners and Windows reports zero runner
  processes. Credential files are erased from all retained runner directories.
  Windows still holds non-secret work files open; physical deletion will be
  retried separately.
- Vercel still reports zero deployments after both source pushes. Production
  deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` remains READY; landing,
  health, and readiness return HTTP 200.

## 2026-07-28 -- Production dashboard enum-catalog repair

Completed:

- Reproduced production digest `862076041` in an isolated PostgreSQL 17
  database. Exact failure: `invalid input value for enum
  purchase_order_status: "partial_delivered"` (`22P02`).
- Traced the crash to the dashboard committed-purchase-order query. The
  canonical application schema includes `partial_delivered`; migration
  `20260512130000_third_code_erp_po_approval.sql` omitted it.
- Added forward migration
  `20260728005112_fix_purchase_order_status_catalog.sql`.
- Applied the same migration to Supabase project
  `aqqrtkmtcsfkbyyqxowv`.
- Extended the fail-closed database verifier with the exact ordered
  purchase-order status catalog.

Changed files:

- `supabase/migrations/20260728005112_fix_purchase_order_status_catalog.sql`
- `scripts/verify-database-repro.mjs`
- the six architecture/operations memory files

Validation:

- Isolated PostgreSQL 17 direct enum cast -- pass.
- Database replay/catalog verifier -- pass, 48 migrations and 30 protected
  tables.
- Read-only database release planner -- current, 48/48, no gaps or unexpected
  history.
- Dedicated database suite -- 212/212 pass, zero skips.
- Root lint and typecheck -- pass.
- Root test lane -- pass; dedicated database lane supersedes its intentional
  database skips.
- Nest and Next production builds -- pass; Next generated 77 pages.
- Hosted enum catalog -- exact 12 canonical labels; direct
  `partial_delivered` cast passes.
- Hosted pre/post reconciliation -- 13 purchase orders, `378642000` total
  cents, 662 audit rows, and identical status counts.

Rollback and unresolved:

- The safe rollback is forward compensation only. Removing a PostgreSQL enum
  label is destructive and is not an emergency rollback.
- No business or audit rows changed.
- Anonymous production `/dashboard` correctly redirects to sign-in after the
  repair.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

## 2026-07-29 -- Authenticated dashboard incident closure

Completed:

- Reused the user's authenticated in-app session without copying credentials,
  cookies, local storage, or tokens.
- Hard-reloaded `https://thirdcode-erp.vercel.app/dashboard` on production
  deployment `dpl_5a132nUPMyqNHUMT4JwA8EpBqgHr`.
- Verified production title `Dashboard | Third Code ERP`, authorized Admin
  identity, Key performance indicators, and Risk Signals content.
- Browser console error scan returned zero errors.
- Vercel runtime records authenticated `/dashboard` requests on the repaired
  deployment and zero `/dashboard` runtime-error clusters in the proof window.
- Confirmed GitHub CLI and connected GitHub app both use `kurtgav`; local Git
  author remains `kurtgav <kurtgavin.design@gmail.com>`.
- Reran CI run `30318929116` under `kurtgav`. Actionlint check
  `90343298615` again failed before runner startup with zero steps because
  GitHub reports failed account payments or an insufficient spending limit.

Changed files:

- the six architecture/operations memory files only

Validation:

- Authenticated production dashboard hard reload -- pass.
- Critical dashboard-region render -- pass.
- Browser console -- zero errors.
- Vercel `/dashboard` runtime errors -- zero in proof window.
- Repository worktree before documentation update -- clean at
  `cf6c8e2ce1ee331f0b0b4d5428ab4ea88d540518`.

Rollback and unresolved:

- Documentation-only rollback: revert this evidence commit.
- GitHub-hosted CI remains externally blocked before runner execution.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

## 2026-07-29 -- No-cost short-lived CI alternative

Completed:

- Confirmed GitHub-hosted run `30379589707`, attempt 3, check `90353729857`
  was rejected with zero executed steps by the organization billing/spending
  limit.
- Added a manual `kurtgav`-only workflow for a short-lived repository runner.
- Added checksum-pinned cross-platform Actionlint 1.7.12 and Gitleaks 8.30.1
  launchers.
- Added a test-only Supabase system fixture and an isolated WSL1 database lane
  using PostgreSQL 17, exact Redis 7.4.9, and database
  `erp_self_hosted_ci`.
- Added native Nest production smoke and fail-safe cleanup scripts.
- Added a pinned GitHub Actions Runner 2.336.0 bootstrap that verifies the
  archive digest, refuses public repositories or non-`kurtgav` identities,
  dispatches one job, deregisters the runner, and deletes its work directory.
- Recorded and cancelled diagnostic run `30418930049`. GitHub accepted the
  workflow dispatch but deleted `--ephemeral` registrations before the runner
  listener could open a session. The replacement uses one short-lived standard
  registration with explicit process stop, deregistration, and erasure.
- Added the operator runbook and recorded decision D-033.

Changed files:

- `.github/actionlint.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/ci-self-hosted.yml`
- `package.json`
- `scripts/lib/run-pinned-release-tool.mjs`
- `scripts/run-actionlint.mjs`
- `scripts/run-gitleaks.mjs`
- `scripts/ci/run-transient-github-runner.ps1`
- `scripts/ci/run-wsl1-database-lane.ps1`
- `scripts/ci/smoke-api.ps1`
- `scripts/ci/stop-wsl1-database-lane.ps1`
- `scripts/ci/supabase-system-bootstrap.sql`
- `docs/runbooks/self-hosted-ci.md`
- the six architecture/operations memory files

Validation:

- PowerShell parser -- pass for all four runner/database/smoke scripts.
- Actionlint 1.7.12 and pinned action-reference validation -- pass.
- Root lint and typecheck -- pass.
- Root unit tests and seven database release-planner tests -- pass.
- Fresh Next/Nest production build -- pass; 77 Next pages.
- Clean PostgreSQL 17 replay -- pass, 48 migrations.
- Database suite -- 212/212 pass, zero skips.
- Nest database integration -- pass.
- Before/after schema SHA-256 -- identical,
  `963464C47A8C3B2F771ABB940A0DC106C103FD5DF2410707884B736110A58D26`.
- Native Nest production smoke -- health, database/Redis readiness, and
  unauthenticated Project PATCH 401 all pass.
- Gitleaks 8.30.1 -- 86 commits, zero findings.

Rollback and unresolved:

- No production runtime, database, feature flag, or tenant allowlist changed.
- Remove the manual workflow and runner scripts to roll back this alternative.
- Remote GitHub self-hosted workflow proof is still required after push.
- Redis reports the WSL1 host `vm.overcommit_memory` warning; persistence and
  background saves are disabled in this disposable test-only process.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

## 2026-07-29 -- M1 read-only Project cutover preflight

Outcome:

- Verified the connected Supabase ERP project is healthy on PostgreSQL 17.6.
- Inspected tenant, Project, user, Auth, audit-trigger, function-hardening, and
  audit-chain state with read-only SQL only.
- Identified a reversible E2E Project and an authorized Admin in the main demo
  tenant without recording raw identifiers or business values in Git.
- Blocked that target: its full append-only tenant history has two predecessor
  discontinuities and 151 hashes that do not verify under the current formula.
- Rejected the alternate QA tenant: its one-row chain is clean, but it has no
  application user or Supabase Auth identity.
- Added a redacted Project cutover planner using a repeatable-read, read-only
  transaction. It fails closed on target scope, capability, Auth, PostgreSQL
  version, audit controls, predecessor continuity, hash verification, and
  Project history.
- Kept Vercel Git disconnected; Vercel recorded zero new deployments.
- Publishing the root `package.json` planner aliases matched Railway's API
  watch patterns and created one deployment,
  `dffa3105-7db3-4bd2-8ba9-505bf2248aee`, on exact commit `62d9106f`. No API
  source changed. The deployment completed successfully; `/health` and
  `/ready` remain HTTP 200.
- No database write, Auth mutation, feature-flag change, or allowlist change
  occurred.

Changed files:

- `.github/workflows/ci.yml`
- `.github/workflows/ci-self-hosted.yml`
- `package.json`
- `scripts/lib/project-cutover-plan.mjs`
- `scripts/plan-project-cutover.mjs`
- `scripts/plan-project-cutover.test.mjs`
- `docs/runbooks/project-write-cutover.md`
- the six architecture/operations memory files

Validation:

- Project cutover planner unit tests -- 6/6 pass.
- Planner syntax check -- pass.
- Hosted read-only planner against the selected demo target -- expected
  `blocked`; PostgreSQL 17, target/actor/Auth/control checks pass, full-chain
  integrity checks fail with the recorded historical mismatch counts.
- No secret, UUID, email, or business value appears in planner output.
- Root lint, typecheck, unit suites, and production build -- pass; the root
  database suite intentionally skips runtime cases without `DATABASE_URL`.
- Authoritative self-hosted database lane remains 212/212 with zero skips.
- Hosted migration ledger -- current, 48/48, no gaps or unexpected versions.
- Actionlint 1.7.12 and pinned action-reference validation -- pass.
- Gitleaks 8.30.1 -- 93 commits, zero findings.
- GitHub hosted run `30423405464` -- blocked by the existing account
  billing/spending limit before any step; self-hosted proof remains the
  authoritative green lane.
- Vercel deployment count after source publication -- zero; canonical landing,
  `/api/health`, and `/api/ready` remain HTTP 200.

Rollback and unresolved:

- Source rollback: revert this planner/documentation milestone; no production
  data requires rollback. If the operational-tooling Railway rebuild proves
  defective, redeploy last-known-good API deployment
  `2b77cc8e-3c5a-44df-8c4d-58926aced3bb`.
- Do not enable the provider flag for either current tenant.
- Next: inspect and execute the supported dedicated-canary onboarding path,
  then require a zero-blocker planner result before requesting one paid Vercel
  production release.

## 2026-07-29 -- Dedicated canary onboarding inspection

Outcome:

- Traced the deployed customer onboarding path without mutation.
- Confirmed canonical `/auth/signup` returns HTTP 200 and renders the account
  form.
- Confirmed the hosted `on_auth_user_created` trigger exists.
- Confirmed its non-public `SECURITY DEFINER` function creates one tenant and
  same-ID application profile; direct execution is revoked from `anon` and
  `authenticated`.
- Confirmed new profiles receive Admin role and `/projects/new` creates a
  tenant-scoped Project with the authenticated actor.
- Determined no implementation change is needed for canary provisioning.

Validation:

- Repository source trace -- signup, Auth trigger, profile resolution, and
  Project creation paths verified.
- Hosted function and trigger inspection -- pass, read-only.
- Live signup page -- HTTP 200.
- No Auth user, tenant, profile, Project, audit row, email, provider variable,
  or deployment changed.

Rollback and unresolved:

- No state or source change requires rollback.
- Execution requires explicit approval for an unused user-controlled email and
  completion of its confirmation step.
- After confirmation, the exact next gate is the redacted read-only Project
  cutover planner; production routing remains disabled.

## 2026-07-29 -- Signup provisioning hardening

Outcome:

- Added and applied forward migration
  `20260729051205_harden_signup_provisioning.sql`.
- Hardened `public.handle_new_user()` with an empty `search_path`, fully
  qualified relations and built-ins, bounded display metadata, a deterministic
  bounded tenant slug, and safe missing-email fallbacks.
- Kept atomic tenant plus same-ID Admin provisioning and the existing Auth
  trigger contract.
- Revoked direct execution from `PUBLIC`, `anon`, and `authenticated`; retained
  `service_role`.
- Reconciled the connector-assigned hosted migration version into repository
  history without executing the SQL twice.

Validation:

- Hosted release plan -- current, PostgreSQL 17, 49/49 migrations.
- Hosted function -- `SECURITY DEFINER`, `search_path=""`, qualified
  `public.tenants`/`public.users`, trigger enabled, client execution denied.
- Hosted row counts before/after -- 13 Auth users, 13 application profiles,
  2 tenants; unchanged.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 49 migrations, verifier pass,
  218/218 database tests with zero skips, Nest database integration pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` -- pass.
- Database release/cutover planner tests, Actionlint, pinned action references,
  Gitleaks, and `git diff --check` -- pass.
- Supabase security/performance advisors -- no finding on
  `handle_new_user`; pre-existing function, extension, Auth configuration,
  foreign-key, duplicate-index, and unused-index findings remain backlog.
- Source commit `72afd93bbd09925d7de9a839b7dd8259db519eac` -- pushed to
  `main` and `agent-02/third-code-erp-landing` as `kurtgav`.
- Railway deployment `1a0cd374-7bd1-449c-9083-ecf4598ccd04` -- success;
  `/health` and `/ready` HTTP 200 with PostgreSQL and Redis ready.
- Vercel deployment count after publication -- zero; Git remains disconnected.
- GitHub hosted run `30424816981` -- failed before any Actionlint step and
  skipped all dependent jobs because of the existing account billing block;
  local and no-cost disposable validation remains authoritative.

Rollback and unresolved:

- No data rollback is required; the migration changed only a function
  definition and privileges.
- If signup regression appears, disable public signup operationally and apply a
  reviewed forward compensation restoring the prior function body and
  privileges. Never edit applied migration history or delete provisioned rows.
- Canary creation still requires explicit approval for an unused
  user-controlled email and completion of its confirmation step.
- Project routing remains disabled and the tenant allowlist remains empty.

## 2026-07-29 -- Signup organization classification persistence

Outcome:

- Added a canonical six-value organization-type domain catalog and reused it
  in the signup form options and client validation.
- Added `public.tenants.organization_type` as constrained, non-null tenant
  profile data with safe default `other`.
- Updated the hardened Auth provisioning trigger to whitelist signup metadata;
  tampered values cannot grant authority and fall back to `other`.
- Applied hosted migration
  `20260729054456_persist_signup_organization_type.sql` and reconciled the
  connector-assigned version into the repository ledger.
- Existing tenants were backfilled to `other`. No Auth user, email, Project,
  provider variable, or deployment was created.

Changed files:

- `packages/shared-types/src/organization-types.ts`
- `packages/shared-types/src/index.ts`
- `apps/web/src/app/(auth)/auth/signup/signup-options.ts`
- `apps/web/src/app/(auth)/auth/signup/signup-options.test.ts`
- `apps/web/src/app/(auth)/auth/signup/signup-form.tsx`
- `packages/database/package.json`
- `packages/database/src/schema/tenants.ts`
- `packages/database/src/sql/handle-new-user.sql`
- `packages/database/src/__tests__/signup-provisioning.test.ts`
- `scripts/verify-database-repro.mjs`
- `supabase/migrations/20260729054456_persist_signup_organization_type.sql`
- `pnpm-lock.yaml`
- the six architecture/operations memory files
- `docs/runbooks/project-write-cutover.md`

Validation:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` -- pass.
- Root suites: shared types 76, Web 69, API 17; database 88 pass and 132
  expected skips without a disposable `DATABASE_URL`.
- Release planner tests 7/7; cutover planner tests 6/6; Actionlint 1.7.12;
  pinned action references; Gitleaks 8.30.1; `git diff --check` -- pass.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 50 migrations, verifier pass,
  220/220 database tests with zero skips, Nest integration 1/1, schema
  fingerprint
  `D9225C443A3B88EC62F777B3C8983992ADC4991C060594671832483903650D37`.
- Hosted release ledger -- current, 50/50, head `20260729054456`.
- Hosted row counts before/after -- 13 Auth users, 13 application profiles,
  2 tenants; unchanged.
- Hosted organization contract -- `NOT NULL`, default `other`, validated
  catalog constraint; both existing tenants equal `other`.
- Hosted signup authority -- `search_path=""`, trigger enabled, client
  execution denied, `service_role` execution retained.
- Supabase advisors -- 12 security and 284 performance notices; zero finding
  tied to the new organization field, constraint, or signup function. Existing
  advisor backlog remains unresolved.
- Source commit `828b63f90f13f6ff735a2b972781a69fa7ffcf2f` -- pushed
  atomically to `main` and `agent-02/third-code-erp-landing` as `kurtgav`.
- Railway deployment `f480586e-fe8d-4214-a33e-7bfdaaa5f38c` -- success from
  exact source commit; `/health` and `/ready` HTTP 200 with PostgreSQL and
  Redis `ok`.
- Vercel deployment count after source publication -- zero; Git remains
  disconnected.

Rollback and unresolved:

- Applied migration history is immutable. If signup regresses, disable public
  signup and apply a reviewed forward compensation restoring the prior trigger
  while retaining or safely deprecating the additive profile column.
- Canary creation still requires explicit approval for an unused
  user-controlled email plus confirmation.
- Project routing remains disabled; tenant allowlist remains empty.
- Exact next action: complete approved normal signup, email confirmation, and
  one non-critical Project; then run the redacted cutover planner with
  `--require-ready`.

## 2026-07-29 -- Architecture memory reconciliation

Outcome:

- Recounted the repository at 50 Supabase migrations and 45 Drizzle schema
  files; confirmed migration head `20260729054456`.
- Reconciled current M1 documentation from stale 44/49/218 values to the
  verified 50-migration, 220/220 zero-skip database baseline.
- Updated current Railway source/deployment evidence to source
  `828b63f90f13f6ff735a2b972781a69fa7ffcf2f` and deployment
  `f480586e-fe8d-4214-a33e-7bfdaaa5f38c`.
- Recorded that `AGENTS.md` references a missing PRD and obsolete pnpm 9,
  PostgreSQL 16, tRPC, and Inngest target rules. No unapproved rewrite of that
  owner-controlled file was performed.
- Kept M1 canary routing disabled. No Auth, database, provider, or runtime state
  changed.

Changed files:

- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`
- `docs/blockers/2026-07-29-stale-repository-governance.md`
- `docs/changesets/2026-07-29-architecture-memory-reconciliation.md`

Validation:

- Repository recount and dependency-manifest inspection -- pass.
- Current drift search -- no stale 44/49/218 claim remains in current-state or
  current M1 status; chronological work-log evidence remains unchanged.
- Markdown/diff hygiene -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 250 pass; 132 disposable-database-gated cases skip as designed.
- Release planner 7/7; cutover planner 6/6; Actionlint 1.7.12; pinned action
  references; Gitleaks 8.30.1 over 100 commits -- pass.

Rollback and unresolved:

- Revert the documentation commit; runtime and provider state are unaffected.
- M1 still requires explicit approval for one unused canary email.
- `AGENTS.md` reconciliation requires separate owner sign-off.
- Exact next action remains approved normal signup, email confirmation, one
  reversible non-critical Project, and a zero-blocker cutover planner.

## 2026-07-29 -- Public landing mobile QA correction

Outcome:

- Audited live landing at 1440px, 768px, and 390px with full-page screenshots,
  accessibility snapshots, computed line boxes, interaction sweeps, console,
  network, metadata, and structured data.
- Preserved the accepted landing architecture. Corrected the mobile hero from
  six measured lines to exactly three and reduced the mobile action headline.
- Removed decorative capability, operation, workflow, and FAQ ordinals while
  retaining the functional carousel position.
- Enforced at least 44px for every visible mobile link, button, and summary.
- Scoped Vercel Analytics to `VERCEL=1`; self-hosted production no longer
  requests the unavailable insights script.
- Replaced duplicate image preload hints with one eager, high-priority,
  responsive hero image. Decorative and below-fold copies remain lazy.
- Added final desktop, tablet, and mobile evidence under
  `docs/design-references/`.
- No database, Auth, Nest, Redis, queue, tenant-routing, provider variable, or
  deployment state changed.

Changed files:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/marketing/third-code-landing.tsx`
- `apps/web/src/components/marketing/third-code-landing.module.css`
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`
- `docs/research/PAGE_TOPOLOGY.md`
- `docs/research/BEHAVIORS.md`
- `docs/research/components/third-code-landing.spec.md`
- `docs/changesets/2026-07-29-public-landing-mobile-qa.md`
- three `docs/design-references/third-code-landing-*-2026-07-29.png` files

Validation:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 250 pass; 132 disposable-database-gated cases skip as designed.
- Optimized Web build -- 77/77 routes generated.
- Browser widths 1440/768/390 -- no horizontal overflow; H1 line counts 3/3/3.
- Mobile visible targets below 44px -- zero.
- Decorative ordinal labels -- zero.
- Accordion, hover expansion, carousel, and FAQ interactions -- pass.
- JSON-LD -- valid Organization, SoftwareApplication, and FAQPage graph.
- Local production console -- zero errors and zero warnings.
- Live canonical, robots, sitemap, manifest, health, and readiness -- HTTP 200.
- Provenance scan -- no prohibited external ERP source or brand terms.
- Source commit `f40b2472d070085ef114143b65cfd822bda30f0d` -- pushed
  atomically to `main` and `agent-02/third-code-erp-landing` as `kurtgav`.
- Vercel deployment count after source publication -- zero; Git remains
  disconnected.

Rollback and unresolved:

- Revert feature commit `f40b2472d070085ef114143b65cfd822bda30f0d`
  and this evidence update. Runtime/database/provider rollback is unnecessary.
- Live Vercel remains on deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`;
  corrected source is intentionally not deployed.
- M1 still requires explicit approval for one unused canary email, normal
  signup and confirmation, one reversible non-critical Project, and a
  zero-blocker cutover planner.
- Any paid frontend build still requires exact charge disclosure and explicit
  user approval.

## 2026-07-29 -- M2 document-processing evidence design

Outcome:

- Traced complete upload path through browser, Next.js upload handlers, inline
  DXF extraction, visual/AI extraction, Inngest retry, Python CAD parsing,
  scope replacement, and draft-BOM creation.
- Verified Python directly deletes/inserts `scope_items`, commits with
  `DATABASE_URL`, and downloads files using a Storage service-role key.
- Verified BullMQ/Redis foundation exists in NestJS but has no registered
  business queue or processor.
- Read hosted PostgreSQL 17.6 catalog without business-data writes.
  `documents` and `scope_items` have RLS but no composite tenant/Project
  foreign keys and no audit triggers.
- Defined an original evidence-only Python contract, explicit Nest
  capabilities, durable job state machine, immutable evidence, opaque BullMQ
  payload, transaction/idempotency rules, compatibility adapter, test matrix,
  staged rollout, and rollback.
- Kept M1 routing disabled and Vercel Git disconnected. No application code,
  schema, business data, Auth, Storage, queue, provider setting, or deployment
  changed.

Changed files:

- `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`
- `docs/changesets/2026-07-29-m2-document-processing-design.md`

Validation:

- Repository source trace and Nest/Python symbol inspection -- pass.
- Hosted catalog inspection -- read-only, PostgreSQL 17.6.
- Vercel deployments since disconnect baseline -- zero.
- Documentation path, prohibited-term, Markdown, and diff checks -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 250 pass; 132 disposable-database-gated cases skip as
  designed because this documentation-only milestone did not inject a database
  target.
- Optimized Web build -- 77/77 routes generated.

Rollback and unresolved:

- Revert this documentation-only milestone; runtime and provider state are
  unchanged.
- M1 still requires explicit canary-email approval, normal signup and
  confirmation, one reversible Project, and a zero-blocker cutover plan.
- M2 application code still requires separate owner-approved `AGENTS.md`
  reconciliation.

## 2026-07-29 -- Upload tenant-Project access hardening

Outcome:

- Found shared `getProject` queried only tenant, loaded one arbitrary Project,
  then compared requested ID in application code.
- Found upload sign and complete routes did not first prove requested Project
  belongs to authenticated tenant.
- Fixed shared lookup to query tenant and Project ID together.
- Added same-tenant Project guard to both upload routes before quota, Storage,
  document insert, parsing, AI, or queue work.
- Preserved same-tenant signed-upload and document-recording response behavior.
- Changed no UI, copy, schema, business data, Auth, Storage, queue, provider
  setting, or deployment.

Changed files:

- `apps/web/src/lib/project-queries.ts`
- `apps/web/src/lib/project-queries.test.ts`
- `apps/web/src/app/api/upload/sign/route.ts`
- `apps/web/src/app/api/upload/sign/route.test.ts`
- `apps/web/src/app/api/upload/complete/route.ts`
- `apps/web/src/app/api/upload/complete/route.test.ts`
- `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-upload-project-access-hardening.md`

Validation:

- Focused Project-query and upload-route tests -- 6/6 pass.
- Cross-tenant/missing Project -- 404 before quota, Storage, document insert,
  parsing, AI, or queue calls.
- Valid same-tenant sign and complete compatibility paths -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 256 pass; 132 disposable-database-gated cases skip as designed.
- Optimized Web build -- 77/77 routes generated.
- Prohibited provenance and diff-hygiene checks -- pass.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live protection requires one explicitly approved Vercel production build.
  Bundle it with existing landing candidate; create no duplicate preview.
- Composite database constraints remain required in M2.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-30 -- RFQ terminal NestJS adapter

Completed:

- Added strict shared complete/cancel command and success contracts.
- Added the capability-guarded Nest transition route and parser.
- Moved tenant lock, terminal state checks, completion coverage validation,
  guarded update, actor stamp, and semantic audit into one Nest transaction.
- Added a separate fail-closed Next-to-Nest adapter gate. Existing Server
  Action results, route revalidation, and post-commit notification behavior
  remain compatible.
- Extended real PostgreSQL integration proof through completion,
  cross-tenant denial, repeat conflict, cancellation, and reason audit.
- Kept all cutover flags disabled. No UI, database migration, provider
  configuration, or live data changed.

Changed files:

- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `apps/api/src/procurement/transition-rfq.pipe.ts`
- `apps/api/src/procurement/procurement.controller.ts`
- `apps/api/src/procurement/procurement.controller.spec.ts`
- `apps/api/src/procurement/procurement.service.ts`
- `apps/api/src/procurement/procurement.service.spec.ts`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `docs/research/components/rfq-terminal-nest-adapter.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared, API, and Web contracts: 61/61 pass.
- Root lint and typecheck: pass.
- Root application tests: 397/397 pass.
- Local database tests: 99 pass and 137 credential-dependent checks skip as
  designed.
- Production build: pass; 77/77 pages generated.
- Disposable PostgreSQL 17/Redis 7.4.9 lane: 54/54 migrations, 236/236
  database tests with zero skips, stable schema fingerprint, and 2/2 Nest
  database integration tests.
- Actionlint 1.7.12, pinned action-reference checks, both release planners,
  Gitleaks 8.30.1, diff check, and product-path ERPNext/Frappe scan: pass.

Rollback and unresolved:

- Source rollback is one revert. Existing RFQ integrity migrations remain
  forward-only and unchanged.
- Production flags remain disabled. A provider canary still requires an
  approved clean tenant and exact environment/monitoring/rollback review.
- Vercel remains disconnected and no frontend deployment is authorized.

## 2026-07-30 — Inert NestJS RFQ quote adapter

Completed:

- Added ProcurementModule, strict quote endpoint, shared contracts, capability
  policy, tenant-scoped transaction, idempotency lock, state checks, and
  semantic audit writer.
- Added disabled Next.js cutover with exact tenant allowlist and fail-closed
  behavior. No provider flag enabled; no Vercel deployment requested.
- Added unit, HTTP contract, action/client, authorization, and disposable
  PostgreSQL integration coverage.

Validation:

- Lint and full typecheck passed.
- Shared 79/79, web 265/265, API rerun 26/26.
- Disposable lane: 54/54 migrations, database 236/236 zero skips, API
  integration 2/2, stable schema hash
  `36B8999F16B825D89D8F782CBF28180D074AD677A9E8B2C16B713C79BB931BB6`.
- Nest and Next production builds passed; Next generated 77/77 pages.
- Gitleaks, Actionlint, workflow action refs, and diff checks passed.
- Full parallel test run exposed local CPU timeout only; all affected API
  tests passed immediately API-only after the bounded timeout adjustment.

Unresolved:

- Adapter is intentionally disabled. M1 canary/provider approval remains the
  activation gate.
- Complete/cancel remain Next.js authority.

## 2026-07-30 — RFQ adapter provider and canary verification

Completed:

- Confirmed Railway deployed exact commit `cdb246a` as deployment
  `f51c7aba-d5d9-4ccd-9cbe-46fa508117af` under `kurtgav`.
- Confirmed live health/readiness, PostgreSQL, Redis, anonymous 401, and no
  deployment error logs.
- Confirmed Vercel created zero deployments after the retained baseline.
- Queried hosted Supabase read-only. Neither existing tenant is a valid M1
  canary: QA has no application/Auth user; demo audit integrity remains
  invalid.
- Confirmed all Project and RFQ cutover variables are absent from Railway.
- Confirmed GitHub run `30475864702` was blocked before any job step by the
  existing account billing/spending condition.

Changed state:

- Documentation only. No database, Auth, tenant, record, provider variable,
  Vercel deployment, Railway deployment, or live data changed.

Unresolved:

- Dedicated canary requires explicit approval for one unused user-controlled
  email and its confirmation step.
- Root `AGENTS.md` still conflicts with the approved architecture and requires
  explicit owner sign-off before reconciliation.

## 2026-07-30 -- Atomic RFQ quote and terminal workflow

Outcome:

- Replaced independent quote, RFQ-status, and audit writes with one
  server-only transaction service that locks and tenant-scopes the RFQ.
- Added stable BOM-line identity and tenant-scoped UUID submission
  idempotency. Exact retry returns the durable quote; conflicting key reuse
  fails without mutation.
- Removed browser-supplied material authority. Material identity is derived
  from the locked RFQ line and validated against the same tenant.
- Fixed RFQ creation so uncontracted catalog lines retain their material ID
  and every new line persists its canonical BOM-line ID.
- Completion now requires `quotes_received` plus full locked line coverage.
  Cancellation and completion use explicit allowed source states.
- Quote creation, first-quote status change, terminal transition, and their
  audits are atomic. Completion notification is post-commit and cannot
  misreport transaction failure.
- Added four validated tenant-composite quote references, restrictive evidence
  parents, durable submission uniqueness, and a PostgreSQL RFQ state trigger.
- Applied migration `20260729162944_rfq_quote_workflow_integrity.sql` through
  the connected Supabase project `aqqrtkmtcsfkbyyqxowv`.
- Hosted Supabase is healthy and current at 54/54. RFQ and quote counts remain
  zero; four constraints are validated; the state trigger is enabled; browser
  quote mutation privileges remain denied.
- No Vercel deployment was created. Git remains disconnected and the retained
  production deployment remains unchanged.

Changed files:

- `apps/web/src/app/(dashboard)/procurement/rfqs/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `apps/web/src/components/rfq/log-quote-form.tsx`
- `apps/web/src/components/rfq/price-comparison-table.tsx`
- `apps/web/src/lib/procurement/rfq-service.ts`
- `apps/web/src/lib/procurement/rfq-service.test.ts`
- `apps/web/src/lib/procurement/rfq-workflow-service.ts`
- `apps/web/src/lib/procurement/rfq-workflow-service.test.ts`
- `packages/database/src/schema/bom-extras.ts`
- `packages/database/src/__tests__/rfq-quote-workflow-integrity.test.ts`
- `supabase/migrations/20260729162944_rfq_quote_workflow_integrity.sql`
- `docs/research/components/rfq-quote-workflow-integrity.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused RFQ Web suites -- 26/26 pass.
- RFQ database contract/runtime suites -- 12/12 pass in the zero-skip lane.
- Root lint and full workspace typecheck -- pass.
- Root tests -- 453 application tests pass.
- Nest/Next production build -- pass; Next generated 77/77 static pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 54/54 migrations, 236/236
  database tests, 1/1 Nest integration, no skips, stable schema fingerprint
  `36B8999F16B825D89D8F782CBF28180D074AD677A9E8B2C16B713C79BB931BB6`.
- Hosted Supabase -- 54/54; head `20260729162944`; no missing/unexpected
  migration; no RFQ/quote row mutation.
- gitleaks 8.30.1, actionlint 1.7.12, pinned action-reference checks,
  `git diff --check`, and prohibited external ERP source/brand scan -- pass.
- Source commit `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59` is authored
  by `kurtgav <kurtgavin.design@gmail.com>` and is contained in docs head
  `cc5733fa98136c500aa2602b9232a6f9ae34df78`; both GitHub refs match.
- Vercel deployments after retained baseline `1785295180454` -- zero.
- Railway deployment `733f1197-344a-41d9-ad95-af4fda876242` -- SUCCESS on
  docs head `cc5733f`; live `/health` is `ok` and `/ready` reports PostgreSQL
  and Redis `ok`.
- GitHub Actions run `30471712383` -- failed before any step started because
  of the account payment/spending-limit restriction; every dependent job has
  zero executed steps.

Rollback and unresolved:

- Revert application source commit `20d276c` only if necessary.
- Do not remove migration `20260729162944`; correct defects with a reviewed
  forward migration because reversal reopens tenant, replay, evidence, and
  state-machine risks.
- RFQ workflow authority remains transitional Next.js code. Next safe slice is
  an inert, disabled NestJS procurement adapter preserving the same contract.
- Frontend activation still requires one explicitly approved consolidated
  queued Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-30 -- Portable self-hosted Web runtime

Outcome:

- Rejected static-only hosting because the application requires dynamic SSR,
  Middleware, Server Actions, route handlers, and request-specific CSP nonces.
- Added opt-in Next standalone output while preserving the default local and
  Vercel-compatible build.
- Added a non-root Node 22 Alpine Dockerfile and provider-neutral release
  revision reporting.
- Added a free self-hosted CI smoke that builds an isolated standalone
  artifact and verifies process health, SSR landing, nonce CSP, robots,
  sitemap, and manifest.
- Kept Vercel Git disconnected. No deployment, DNS, redirect, database,
  Supabase, Railway, or live-traffic change was made.

Changed files:

- `.github/workflows/ci-self-hosted.yml`
- `apps/web/Dockerfile`
- `apps/web/next.config.ts`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/src/app/api/ready/route.ts`
- `apps/web/src/lib/deployment-revision.ts`
- `apps/web/src/lib/deployment-revision.test.ts`
- `scripts/ci/smoke-web-standalone.ps1`
- `docs/DEPLOYMENT.md`
- the six architecture/operations memory files

Validation and constraints:

- Default Next production build passes with 77/77 generated pages.
- Isolated standalone build and runtime smoke pass: health, real SSR landing,
  nonce CSP, robots, sitemap, and manifest.
- Transient self-hosted run `30484376284` passed install, workflow checks,
  lint, typecheck, unit tests, the clean PostgreSQL 17/Redis lane, and the
  production build. Its standalone step built 77/77 pages, then hit a
  Windows deep-path cleanup failure.
- Moved the isolated standalone worktree to the repository drive root, kept
  the verified containment guard, and added bounded cleanup retries. Local
  rerun passes all runtime assertions, removes its worktree, and leaves port
  3090 closed.
- Root lint and typecheck pass.
- Application suites pass: Shared 79/79, API 26/26, Web 276/276; total 381.
- Local database suite remains 99 passed and 137 skipped because this
  source-only slice did not inject disposable database credentials.
- Default production build passes with Nest compilation and Next 77/77 page
  generation.
- Frontend release browser test passes 1/1 in installed Chrome at
  1440/768/390 with interactions, canonical discovery output, no horizontal
  overflow, and zero console/page errors.
- Gitleaks 8.30.1, Actionlint 1.7.12, workflow action-reference checks,
  database release planner 7/7, Project cutover planner 6/6, and diff checks
  pass.
- Vercel deployment inventory remains zero after retained baseline timestamp
  `1785295180454`; Git integration remains disconnected.
- Direct Windows standalone build with pnpm's linked layout reaches 77/77 but
  fails while tracing symlinks with `EPERM`; the committed Windows smoke uses
  an isolated hoisted layout and passes.
- Alpine WSL1 cannot directly execute its current PIE Node binary on the old
  WSL1 kernel. Docker Desktop also cannot start because WSL2 virtualization is
  disabled. No system feature, firmware setting, or reboot was changed.
- The Docker image source is reviewed but not locally image-built. A
  Docker-capable Linux build and image scan remain a pre-cutover gate.
- Rollback is one application commit. No database or provider rollback exists
  because nothing live changed.

## 2026-07-30 -- Host-portable public origin

Outcome:

- Audited current landing source, retained live Vercel output, generated
  desktop/mobile evidence, metadata, structured data, sitemap, robots,
  manifest, interactions, responsive behavior, and console state.
- Confirmed production is older than current source: retained live output
  still exposes decorative ordinals already removed from the source candidate.
- Added one strict public-origin resolver for canonical metadata,
  structured-data IDs, robots, and sitemap output.
- Added alternative-host configuration to both environment examples.
- Removed synthetic sitemap `lastModified`.
- Extended the release browser test across `robots.txt`, `sitemap.xml`, and
  `manifest.webmanifest`.
- No visible UI, database, Railway, Supabase, Vercel setting, or deployment
  changed.

Changed files:

- `.env.example`
- `apps/web/.env.example`
- `apps/web/src/lib/public-origin.ts`
- `apps/web/src/lib/public-origin.test.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/robots.ts`
- `apps/web/src/app/sitemap.ts`
- `apps/web/e2e/frontend-release-local.spec.ts`
- the six architecture/operations memory files

Validation:

- Public-origin unit tests: 8/8 pass.
- Root lint and typecheck: pass.
- Application tests: shared 79/79, API 26/26, Web 273/273.
- Local database lane: 99 passed, 137 skipped because production credentials
  were intentionally absent; no database code or schema changed.
- NestJS and Next.js production build: pass; Next generated 77/77 pages.
- Frontend release browser test: 1/1 pass against installed Chrome at
  1440/768/390, including interactions, no overflow, no console/page errors,
  and SEO endpoint assertions.
- Built output contains the retained canonical origin, a consistent sitemap
  directive, no sitemap `lastmod`, and the expected manifest.
- gitleaks, actionlint, workflow action-reference checks, and diff checks:
  pass.

Rollback and unresolved:

- Revert the isolated source commit. No provider or database rollback exists.
- Live Vercel remains on the retained older landing artifact until an explicit
  consolidated deployment approval.
- Root layout remains dynamically rendered for CSP nonce integrity. Cost
  optimization needs a separate security review.
- M1 canary and root `AGENTS.md` reconciliation still await explicit approval.

## 2026-07-29 -- Cortex directional relationship meaning

Outcome:

- Added explicit outgoing/incoming labels for 15 canonical graph edge types
  plus a fail-safe `Connected` fallback.
- Extended the existing entity response with at most 12 relationship rows
  assembled only from role-filtered neighbors and citations.
- Kept the record authorization gate before neighbor retrieval and preserved
  existing source/type ownership checks and non-enumerating denial.
- Added canonical relationship links, static fallback, origin metadata,
  two-column desktop/tablet layout, and one-column mobile layout.
- Changed no schema, hosted data, Auth, Storage, queue, backend, provider
  setting, or deployment. Vercel Git remained disconnected.

Changed files:

- `apps/web/src/lib/cortex/entity-response.ts`
- `apps/web/src/lib/cortex/entity-response.test.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.test.ts`
- `apps/web/src/components/cortex/cortex-relationship-list.tsx`
- `apps/web/src/components/cortex/cortex-relationship-list.test.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-relationship-list.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-relationship-meaning.md`

Validation:

- Focused response, route, and render suite -- 11/11 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 341 pass; 132 writable-database-gated cases skip.
- API and Web production builds -- pass; Web generated 77/77 static steps.
- Local production entity API without session -- 401.
- Built-CSS browser proof at 1440/768/390 -- two/two/one columns, 44px
  targets, visible two-pixel focus, safe ellipsis, and zero overflow.
- Browser console -- zero errors and zero warnings after fresh local load.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Authenticated populated-record proof remains pending a controlled valid
  identity; invalid demo credentials were not bypassed.
- Live activation requires one explicitly approved consolidated Vercel build.
  Do not create a separate preview or reconnect Git.
- Database integration assertions remain pending a disposable writable target.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex operational record context

Outcome:

- Audited every UUID-backed dashboard detail page. Cortex context existed only
  on Project detail and the graph workspace.
- Added one exact route resolver for 16 CRM, finance, procurement, inventory,
  claims, variation, punchlist, and warranty detail surfaces.
- Injected one shared Cortex panel from the authenticated dashboard layout.
- Excluded Project detail and every collection, create, edit, print, portal,
  malformed, and unsupported path.
- Preserved path RBAC, tenant derivation, current-role node scope, and
  non-enumerating entity denial.
- Corrected cash-transaction citations to open exact detail records.
- Changed no schema, hosted data, Auth, Storage, queue, provider setting, or
  deployment.

Changed files:

- `apps/web/src/lib/cortex/record-route.ts`
- `apps/web/src/lib/cortex/record-route.test.ts`
- `apps/web/src/components/cortex/cortex-route-context.tsx`
- `apps/web/src/components/cortex/cortex-route-context.test.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/lib/cortex/entity-registry.ts`
- `apps/web/src/lib/cortex/entity-registry.test.ts`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-record-context.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-operational-record-context.md`

Validation:

- Focused route, render, registry, RBAC, and entity API suite -- 55/55 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 334 pass; 132 writable-database-gated cases skip.
- API and Web production builds -- pass; Web generated 77/77 static steps.
- Local production -- health 200, readiness 200, unauthenticated record route
  redirects to login, direct Cortex entity request returns 401.
- Browser proof at 1440/768/390 -- 32/32/44px targets, visible focus, 24px
  panel separation, and zero horizontal overflow.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live activation requires the one explicitly approved consolidated Vercel
  build. Do not create a separate preview or reconnect Git.
- Authenticated live role-by-role proof remains pending that approved build and
  controlled canary identities.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Document mutation authority hardening

Outcome:

- Verified upload sign, upload complete, and document delete authenticated
  users but did not enforce explicit mutation capability.
- Added `document.manage` for operational roles and kept `viewer` read-only.
- Added 403 denial before Project, quota, Storage, database, parser, AI, or
  queue work for callers without capability.
- Added actor- and tenant-scoped audit for signed URL issuance.
- Made document creation and its audit entry one PostgreSQL transaction.
- Rebuilt document deletion as one locked, tenant-and-Project-bound
  transaction covering derived scope rows, document row, and audit append.
- Moved best-effort Storage deletion after successful official transaction.
- Removed trust in caller Project ID for cache invalidation by using the
  Project loaded from the deleted record.
- Changed no React/UI design, schema, hosted data, Auth identity, Storage
  object, queue, provider setting, or deployment.

Changed files:

- `packages/auth/src/server.ts`
- `apps/web/src/lib/audit.ts`
- `apps/web/src/lib/document-capability.test.ts`
- `apps/web/src/app/api/upload/sign/route.ts`
- `apps/web/src/app/api/upload/sign/route.test.ts`
- `apps/web/src/app/api/upload/complete/route.ts`
- `apps/web/src/app/api/upload/complete/route.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/documents/actions.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/documents/actions.test.ts`
- `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-document-mutation-authority.md`

Validation:

- Focused capability, sign, complete, and delete tests -- 26/26 pass.
- Operational capability matrix and `viewer` denial -- pass.
- Missing capability denial before side effects -- pass.
- Audit-failure fail-closed and Storage-after-commit ordering -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 278 pass; 132 disposable-database-gated cases skip as
  designed because this source slice did not inject a writable database.
- Optimized Web build -- 77/77 routes generated.
- Gitleaks 8.30.1 full-history scan -- no leaks.
- Prohibited provenance and diff-hygiene checks -- pass.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live protection requires one explicitly approved consolidated Vercel build.
- M2 composite constraints, database audit triggers, durable processing
  evidence, and Nest transaction authority remain required.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex canonical entity registry

Outcome:

- Reconciled the 48-value Cortex node enum with graph RBAC, display metadata,
  entity sources, and record navigation.
- Replaced independent partial maps with one typed registry.
- Kept four reserved enum types with no UUID-backed mirror table explicitly
  non-queryable instead of inventing unsupported sources.
- Added direct record links for active and newer finance/inventory entities,
  with safe list or Project fallbacks where no detail surface exists.
- Made the entity endpoint reject unregistered sources, cross-type source
  pairing, and forbidden types before context retrieval.
- Reused canonical labels in citation chips.
- Changed no schema, hosted data, Auth, Storage, queue, provider setting, or
  deployment.

Changed files:

- `apps/web/src/lib/cortex/entity-registry.ts`
- `apps/web/src/lib/cortex/entity-registry.test.ts`
- `apps/web/src/lib/cortex/href.ts`
- `apps/web/src/lib/cortex/rbac.ts`
- `apps/web/src/lib/cortex/rbac.test.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.test.ts`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-entity-registry.md`

Validation:

- Focused registry, RBAC, and entity-route suite -- 24/24 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 296 pass; 132 disposable-database-gated cases skip because no
  writable database target was injected.
- Optimized production build -- pass; 77/77 static-generation steps.
- Local production smoke -- health 200, readiness 200, unauthenticated
  finance entity lookup 401.
- Gitleaks 8.30.1 full-history scan and prohibited-provenance scan -- clean.
- Hosted read-only inventory -- 48 enum types; 385 current nodes across 14
  active types.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live activation requires the single explicitly approved consolidated Vercel
  build. Do not create a separate preview or reconnect Git.
- Database Cortex authorization remains authoritative and must be updated with
  any future enum/mirror addition.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex grounded citation navigation

Outcome:

- Preserved the exact plain-text Cortex response body and added a bounded
  citation response header for immediate source links.
- Added one shared citation renderer using canonical registry labels and
  record routes.
- Rehydrated saved citation node IDs from current tenant-scoped graph data
  under the viewer's current role.
- Removed trust in stored titles, references, Project IDs, and routes.
- Omitted malformed, stale, superseded, cross-tenant, and forbidden records.
- Added visible focus behavior and 44px mobile citation targets.
- Changed no schema, hosted data, Auth, Storage, queue, or provider setting.
  Vercel Git remained disconnected.
- Source publication triggered one Railway API build because
  `packages/database` is in the service watch set. Deployment
  `2991586f-070e-470a-add0-56ce264b74e8` built the NestJS Dockerfile, passed
  healthcheck, and replaced the prior healthy API artifact.
- Vercel recorded zero deployments; the Next.js citation UI remains
  source-only.

Changed files:

- `packages/database/src/cortex/graph.ts`
- `packages/database/src/cortex/retrieve.ts`
- `packages/database/src/__tests__/cortex-substrate.test.ts`
- `apps/web/src/lib/cortex/citation-header.ts`
- `apps/web/src/lib/cortex/citation-header.test.ts`
- `apps/web/src/app/api/cortex/chat/route.ts`
- `apps/web/src/app/api/cortex/chat/route.test.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.test.ts`
- `apps/web/src/components/cortex/cortex-citation-list.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-citations.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-citation-navigation.md`

Validation:

- Focused citation, chat, conversation, entity, RBAC, and registry tests --
  32/32 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 303 pass; 132 database-gated cases skip because this
  source-only slice did not inject a writable database.
- Optimized production build -- pass; 77/77 static-generation steps.
- Local production smoke -- health 200, readiness 200, unauthenticated entity
  lookup 401, unauthenticated chat POST 401.
- Browser CSS proof -- visible desktop focus, exact 44px targets at 390px, no
  horizontal overflow.
- Railway deployment logs -- Nest build and startup pass; `/health` 200;
  `/ready` 200 with PostgreSQL and Redis `ok`.
- Live Vercel remained on revision `f24e5603a355`; health and readiness 200.

Rollback and unresolved:

- For backend rollback, redeploy retained Railway artifact
  `f480586e-fe8d-4214-a33e-7bfdaaa5f38c` only if the new health/readiness or
  API compatibility checks regress. Current deployment is healthy.
- Live activation requires the single explicitly approved consolidated Vercel
  build. Do not create a separate preview or reconnect Git.
- The database integration assertions remain pending a disposable writable
  target; hosted production was not mutated for this slice.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex evidence trail

Outcome:

- Verified hosted Cortex has 637 node-provenance events across every one of
  385 current nodes; each current node has one to three events.
- Added server normalization for mutation, document, AI-run, import, and
  unknown provenance origins.
- Returned at most six safe evidence events after existing tenant/source/type/
  role authorization.
- Prevented actor ID, internal origin reference, hashes, sequence, tenant ID,
  and subject ID from reaching browser response.
- Added a collapsed native evidence disclosure with safe explanations, UTC
  timestamps, 44px target, visible focus, and reduced-motion handling.
- Changed no schema, hosted data, Auth, Storage, queue, backend, provider
  setting, or deployment. Hosted Supabase inspection was aggregate read-only.

Changed files:

- `apps/web/src/lib/cortex/entity-response.ts`
- `apps/web/src/lib/cortex/entity-response.test.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.test.ts`
- `apps/web/src/components/cortex/cortex-evidence-trail.tsx`
- `apps/web/src/components/cortex/cortex-evidence-trail.test.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-evidence-trail.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-evidence-trail.md`

Validation:

- Focused evidence, response, and entity route suite -- 17/17 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 350 pass; 132 writable-database-gated cases skip.
- API and Web production builds -- pass; Web generated 77/77 static steps.
- Hosted aggregate queries -- 637 node events; 385/385 current nodes covered;
  one to three events per node.
- Local production unauthenticated entity lookup -- expected 401.
- Built-CSS browser proof at 1440/768/390 -- native disclosure, 44px target,
  visible focus, readable UTC timeline, reduced indicator geometry, and zero
  page/detail overflow.
- Browser UI console -- clean before the intentional 401 resource request.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Authenticated populated-record proof remains pending a controlled valid
  identity; authorization was not bypassed.
- Live activation requires one explicitly approved consolidated Vercel build.
  Do not create a separate preview or reconnect Git.
- GitHub-hosted CI remains externally blocked before job start by account
  payment/spending status. Local full gates are the no-cost verification path.
- Database integration assertions remain pending a disposable writable target.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex focused neighborhood

Outcome:

- Added an `Open focused graph` backlink to authorized operational record
  context.
- Preserved the existing whole-graph API when no focus is supplied.
- Added complete-pair validation for canonical source table plus UUID.
- Reauthorized authenticated tenant, source/type ownership, and current-role
  access before focused retrieval; missing, mismatched, and forbidden records
  return the same 404.
- Added a bounded database helper returning the focus plus one visible hop.
  Focus, edges, and joined neighbors all have explicit tenant and current-row
  predicates.
- Added server-derived focus identity, automatic drawer selection, persistent
  highlight, visible-canvas centering, truthful bounded-count wording, and
  clear-focus behavior.
- Browser QA found and fixed Cortex grid intrinsic-width overflow plus the
  existing tablet topbar and mobile fixed-sidebar overflow.
- Tablet/mobile now flow the drawer below the graph; narrow screens use a 64px
  icon navigation rail with accessible link names retained.
- No schema, business row, password, Storage object, queue, or provider setting
  changed. The gated E2E generated and consumed one-time test sessions and
  globally revoked them after verification.

Changed files:

- `packages/database/src/cortex/graph.ts`
- `apps/web/src/app/api/cortex/graph/route.ts`
- `apps/web/src/app/api/cortex/graph/route.test.ts`
- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/components/cortex/cortex-graph-view.tsx`
- `apps/web/src/components/cortex/cortex-graph-canvas.tsx`
- `apps/web/src/components/nav/topbar.tsx`
- `apps/web/src/components/nav/profile-menu.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-focused-neighborhood.md`

Validation:

- Focused graph route suite -- 6/6 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 356 pass; 132 writable-database-gated cases skip because no
  disposable `DATABASE_URL` was injected.
- API and Web optimized production build -- pass; Web generated 77/77 static
  steps.
- Hosted Supabase read-only evidence -- selected current Project has 78 direct
  graph edges; no schema or business row changed.
- Authenticated production-build E2E -- real Project backlink, invalid focus
  400, authorized focused response 200, exact focus present, at most 81 nodes
  and 80 links, loaded record drawer, clear-focus compatibility, and global
  test-session revocation all pass.
- Browser screenshots at 1440/768/390 -- zero horizontal overflow; focused
  canvas, responsive drawer, topbar, and mobile icon rail visually reviewed.
- Browser console and page errors -- zero.
- Gitleaks 8.30.1, actionlint 1.7.12, diff check, and repository-wide
  prohibited external ERP source/brand scan -- clean.
- Vercel provider check -- latest deployment remains
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`; zero new deployments from this work.
- GitHub publication -- commit
  `5ed6984d789dcc62bffc6a61f2e16fe759e281b7` reached both
  `agent-02/third-code-erp-landing` and `main` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- GitHub Actions run `30447346925` -- failed before any step started. The
  annotation reports recent account payments failed or the spending limit must
  be increased. All dependent jobs skipped; no code failure was observed.
- Railway deployment `dd9f0f50-e8bd-4411-a49b-ffea0984030a` -- `SUCCESS` for
  exact commit `5ed6984d789dcc62bffc6a61f2e16fe759e281b7`; live
  `/health` 200 and `/ready` 200 with PostgreSQL and Redis `ok`.

Rollback and unresolved:

- Revert this source/documentation milestone. A revert touching
  `packages/database` will create one Railway rollback build; verify live
  health/readiness and exact revision. No schema or provider-configuration
  rollback is required.
- Live activation requires one explicitly approved consolidated Vercel build.
  Do not create a preview, reconnect Git, or spend provider credit.
- Destructive database integration remains pending a disposable writable
  target.
- Durable conversation focus metadata remains required before record-scoped
  Cortex chat can be honest across saved follow-ups.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Durable Cortex conversation record context

Outcome:

- Added one optional immutable canonical source-table and UUID pair to saved
  Cortex conversations.
- Added tenant-, source/type-, and current-role authorization before creating,
  listing, loading, or replying in a record-scoped conversation.
- Added non-enumerating denial for missing, mismatched, revoked, and forbidden
  context, plus 409 denial for client attempts to switch an existing
  conversation to another record.
- Grounded the model prompt and deterministic fallback in the authorized
  focused record.
- Preserved existing unscoped conversations and the plain-text chat response.
- Removed authenticated browser write authority from Cortex conversations and
  messages. Official writes remain server-side.
- Applied hosted migration
  `20260729115110_cortex_conversation_record_context.sql` to Supabase project
  `aqqrtkmtcsfkbyyqxowv`. Hosted ledger is 51/51; ten existing conversations
  remain and zero have an incomplete context pair.
- No UI presentation changed. Vercel Git remains disconnected; no Vercel
  deployment or spend occurred.

Changed files:

- `apps/web/src/app/api/cortex/chat/route.ts`
- `apps/web/src/app/api/cortex/chat/route.test.ts`
- `apps/web/src/app/api/cortex/conversations/route.ts`
- `apps/web/src/app/api/cortex/conversations/route.test.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.test.ts`
- `apps/web/src/lib/cortex/record-context.ts`
- `apps/web/src/lib/cortex/record-context.test.ts`
- `packages/database/src/schema/cortex-chat.ts`
- `packages/database/src/cortex/chat-store.ts`
- `packages/database/src/__tests__/cortex-conversation-context.test.ts`
- `packages/database/src/__tests__/cortex-cost-security-hardening.test.ts`
- `scripts/verify-database-repro.mjs`
- `supabase/migrations/20260729115110_cortex_conversation_record_context.sql`
- the six architecture/operations memory files

Validation:

- Focused Web API/context tests -- 16/16 pass.
- Root lint and typecheck -- pass.
- Root tests -- 369 pass; 134 writable-database cases skip unless an explicit
  disposable URL is injected.
- Root production build -- pass; Nest webpack build passes and Next generates
  77/77 static steps.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 51/51 migrations, catalog
  verifier pass, 224/224 database tests with zero skips, Nest database
  integration pass, and unchanged schema fingerprint
  `C89987BD5B4E7DAA2F53DDD0036FBE3614D385844078453B052E992516935260`.
- Runtime database assertions -- complete context pair accepted, half pair
  rejected, and authenticated direct conversation insert rejected.
- Hosted catalog -- pair constraint validated; zero authenticated Cortex chat
  write policies, table grants, or column grants.
- Supabase advisors -- no new Cortex security finding. Existing security and
  performance findings remain separately tracked.
- Gitleaks 8.30.1, Actionlint 1.7.12, diff check, and prohibited external ERP
  source/brand scan -- clean.
- GitHub publication -- source commit
  `e948223b261b7c335ceaad85e359fec68888e84a` reached both
  `agent-02/third-code-erp-landing` and `main` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` -- `SUCCESS`
  for that exact commit; live `/health` and `/ready` return 200 with PostgreSQL
  and Redis `ok`.
- GitHub Actions run `30449560735` -- failed before any step started. The
  annotation reports recent account payments failed or the spending limit must
  be increased; all dependent jobs skipped.
- Vercel provider check -- zero deployments after retained production
  deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.

Rollback and unresolved:

- Application rollback is a source revert. The nullable hosted columns and
  server-only write privileges remain backward compatible with the retained
  frontend.
- Database rollback requires a reviewed compensating forward migration; never
  edit or delete applied migration history.
- `CortexAgent` does not yet send or display durable record context. That UI
  wiring is the exact next product slice.
- A missing leading index for the pre-existing
  `cortex_conversations.user_id` foreign key and other advisor findings remain
  outside this milestone.
- GitHub Actions remains blocked before runner start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex conversation-context presentation

Outcome:

- Authorized URL focus now reaches Cortex chat through a server-derived record
  context rather than raw browser trust.
- Added persistent `Focused on`, `Company-wide`, and fail-closed
  `Record unavailable` states.
- Added record-specific suggestions and included the canonical pair in chat
  requests.
- Added scope labels to saved conversations. Exact matching context restores
  in place; other scopes navigate explicitly instead of switching silently.
- Added 44px mobile targets for Cortex header, suggestions, and composer.
- No database, hosted row, Auth user, Storage object, queue, provider setting,
  or deployment changed.

Changed files:

- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/components/cortex/cortex-agent.test.tsx`
- `apps/web/src/lib/cortex/agent-context.ts`
- `apps/web/src/lib/cortex/agent-context.test.ts`
- `apps/web/src/app/globals.css`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files

Validation:

- TDD red -- missing context helper and absent focus presentation.
- Focused context/component/API suites -- 22/22 pass.
- Root lint and typecheck -- pass.
- Root tests -- 375 pass; 134 disposable-database cases skip in the ordinary
  no-URL lane and remain covered by the preceding 224/224 zero-skip database
  release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated local production-browser E2E -- pass using installed Chrome;
  exact Project focus, record-specific suggestions, company-wide restoration,
  1440/768/390 screenshots, zero overflow, zero console/page errors, and
  global one-time-session revocation.

Rollback and unresolved:

- Revert this source/documentation slice. The database/API context boundary
  remains compatible; no hosted or provider rollback is required.
- Live activation still requires one explicitly approved consolidated Vercel
  production build. Do not reconnect Git or create a preview.
- GitHub-hosted CI remains blocked before step start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex saved-conversation deep links

Outcome:

- Added optional UUID `conversationId` parsing to the Cortex page.
- Added automatic saved-thread restore through the existing authorized detail
  API.
- Added URL synchronization after conversation create, history load, direct
  restore, and new-chat reset.
- Added latest-request-wins restore handling so a stale response cannot
  overwrite a newer selection or a cleared chat.
- Preserved canonical `refTable`/`refId` focus while adding or removing
  conversation identity.
- Added target conversation IDs to cross-context history links, reducing
  restore to one explicit navigation.
- No hosted write, AI request, schema, Auth identity, Storage object, queue,
  provider setting, or deployment changed.

Changed files:

- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/lib/cortex/agent-context.ts`
- `apps/web/src/lib/cortex/agent-context.test.ts`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files

Validation:

- TDD red -- context URL omitted conversation identity and URL synchronization
  helper did not exist.
- Context helper/component tests -- 7/7 pass.
- Root lint and typecheck -- pass.
- Root tests -- 376 pass; 134 disposable-database cases skip in the ordinary
  no-URL lane and remain covered by the 224/224 zero-skip release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated local production E2E -- real Project focus authorization,
  deterministic intercepted company-wide conversation restore, two restored
  messages, stable deep-link URL, new-chat URL cleanup, responsive screenshots,
  zero overflow, zero console/page errors, and global test-session revocation.
- Hosted database writes and AI calls during deep-link proof -- zero.

Rollback and unresolved:

- Revert this source/documentation slice. Existing durable context and history
  remain functional; no hosted or provider rollback is required.
- Live activation still requires one explicitly approved consolidated Vercel
  production build. Do not reconnect Git or create a preview.
- GitHub-hosted CI remains blocked before step start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex recent-conversation search

Outcome:

- Added keyboard-first search to the existing bounded list of 30 authorized
  recent chats; no API or database history expansion.
- Added case- and diacritic-insensitive all-term matching across conversation
  title and human record-scope label while preserving server order.
- Added an honest recent-count label, accessible clear control, and bounded
  no-results state.
- Kept tenant, user, record UUID, and graph-node identifiers out of searchable
  and visible text.
- No hosted write, AI request, schema, Auth identity, Storage object, queue,
  provider setting, or deployment changed.

Changed files:

- `apps/web/src/lib/cortex/agent-context.ts`
- `apps/web/src/lib/cortex/agent-context.test.ts`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files

Validation:

- Focused helper/component tests -- 8/8 pass.
- Root lint and typecheck -- pass.
- Root tests -- 377 pass; 134 disposable-database cases skip in the ordinary
  no-URL lane and remain covered by the 224/224 zero-skip release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated local production E2E -- title-plus-record filter, clear/reset,
  company-wide deep-link restore, mobile panel screenshot, 1440/768/390
  responsive proof, zero overflow, zero console/page errors, and global
  one-time-session revocation.
- Vercel provider check -- zero deployments after retained READY production
  baseline `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Railway provider check -- active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Source commit `b15c24201326a51db021c4cfd6e57c14923c71e9` -- pushed to
  both `main` and `agent-02/third-code-erp-landing` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment event `4b8183fe-bbdb-471f-9e68-c08a0d7e401f` --
  `SKIPPED`, exact source SHA, `No changes to watched files`.
- GitHub Actions run `30453629029` -- failed before any step started because
  the account reports failed payments or an exceeded spending limit; all
  dependent jobs skipped.

Rollback and unresolved:

- Revert this source/documentation slice. Existing API, context, deep links,
  database, and provider state remain functional.
- Live activation still requires one explicitly approved consolidated Vercel
  production build. Do not reconnect Git or create a preview.
- GitHub-hosted CI remains blocked before step start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cost-controlled frontend release candidate

Outcome:

- Disconnected Vercel Git remained verified.
- Disabled on-demand concurrent builds and selected Standard 4 vCPU/8 GB.
- Inventoried the complete frontend delta against retained production:
  31 commits, 64 Web files, 39 runtime files, and 25 test/E2E files.
- Found a cross-auth-state rate-limit defect through combined browser QA.
- Isolated anonymous IP buckets from authenticated user buckets.
- Added a reusable release E2E covering landing response, SEO/GEO metadata,
  JSON-LD, interactions, responsive layout, mobile targets, and errors.
- Prepared one-build production validation and instant-rollback instructions.
- Did not create a Vercel deployment, preview, Railway deployment, database
  migration, hosted row, Auth identity, Storage object, queue job, or AI call.

Changed files:

- `apps/web/src/middleware.ts`
- `apps/web/src/lib/request-rate-limit.ts`
- `apps/web/src/lib/request-rate-limit.test.ts`
- `apps/web/e2e/frontend-release-local.spec.ts`
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`
- the six architecture/operations memory files

Validation:

- Root lint and typecheck -- pass.
- Root tests -- 379 application tests pass.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Combined Cortex and public landing browser E2E -- 2/2 pass sequentially.
- Landing visual QA -- 1440, 768, and 390; zero horizontal overflow, console
  errors, and page errors.
- gitleaks 8.30.1 -- pass; no leaks.
- actionlint 1.7.12 and `git diff --check` -- pass.
- Prohibited external ERP brand/source scan -- zero matches.
- Source commit `e53f20d63eb937440c2b29c88c920a543a49a3ef` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway API -- remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at backend source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- zero deployments after retained READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30455237294` -- zero executed steps; account
  billing/spending block remains external.

Rollback and unresolved:

- Source rollback is a revert of `e53f20d`; no provider rollback is needed
  because the candidate is not deployed.
- If the candidate is later activated and fails verification, use Vercel
  Instant Rollback to `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Production activation requires explicit approval for one manual queued
  Standard build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Permission-aware dashboard

Outcome:

- Found that every role could load `/dashboard` while the page always executed
  executive pipeline, GP, forecast, rep-scorecard, and alert queries.
- Added a tested role-mode selector backed by the canonical
  `/pipeline/board` permission.
- Made loader selection occur before query invocation.
- Preserved the full executive dashboard for authorized roles.
- Added a calm Today surface for restricted roles with tenant- and
  assignee-scoped pending task counts.
- Derived quick links from the canonical navigation registry so forbidden
  workspaces cannot appear.
- Added an auditable original component specification and gated one-time-link
  browser coverage.
- No database migration, hosted row, role, password, Auth identity, Storage
  object, queue job, AI call, Railway deployment, or Vercel deployment changed.

Changed files:

- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/lib/dashboard-queries.ts`
- `apps/web/src/lib/dashboard-access.ts`
- `apps/web/src/lib/dashboard-access.test.ts`
- `apps/web/src/components/dashboard/role-work-dashboard.tsx`
- `apps/web/src/components/dashboard/role-work-dashboard.module.css`
- `apps/web/src/components/dashboard/role-work-dashboard.test.tsx`
- `apps/web/e2e/dashboard-role-local.spec.ts`
- `docs/research/components/role-work-dashboard.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Role matrix and loader/component suites -- 17/17 pass.
- Root lint and typecheck -- pass.
- Root tests -- 396 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated viewer local production E2E -- pass at 1440, 768, and 390;
  only assignee-scoped work and permitted links, no executive metrics or
  Finance/Pipeline links, zero overflow, zero console/page errors.
- One-time viewer session -- globally revoked after QA.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `36e618274769ef49a18974dbe3bed8f0b4db7edd` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway API -- remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at backend source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- zero deployments after retained READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30456997160` -- zero executed steps; account
  billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `36e6182`; no provider rollback is needed because the
  candidate is not deployed.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Permission-safe universal search

Outcome:

- Confirmed the search API already filtered record types by canonical route
  permissions and tenant-scoped every base record.
- Closed the remaining raw-backslash `ILIKE` escape gap while preserving
  literal `%` and `_` matching.
- Added authenticated-tenant predicates to opportunity-account and BOM-project
  joins.
- Added explicit private/no-store and Cookie-vary headers to success,
  short-query, and unauthorized responses.
- Preserved viewer scope: tenant documents plus authenticated-assignee tasks
  only.
- Extended the existing one-time-link viewer browser gate with real normal
  search, literal wildcard probe, cache headers, allowed result types, and
  command-palette rendering.
- No database migration, hosted row, role, password, Auth identity, Storage
  object, queue job, AI call, Railway build, or Vercel deployment changed.

Changed files:

- `apps/web/src/app/api/search/search-policy.ts`
- `apps/web/src/app/api/search/route.ts`
- `apps/web/src/app/api/search/route.test.ts`
- `apps/web/e2e/dashboard-role-local.spec.ts`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused universal-search suite -- 11/11 pass.
- Root lint and typecheck -- pass.
- Root tests -- 399 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated viewer local E2E -- pass with a real tenant document, only
  document/task result types, a zero-hit literal `%`, `_`, and backslash probe,
  private/no-store headers, Cookie variation, command-palette result, 1440,
  768, and 390 dashboard layouts, zero overflow, and zero console/page errors.
- One-time viewer session -- globally revoked after every completed QA run.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `8dc051e70d56cf3f0cde9c2f409c4f97928d337d` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway correctly skipped deployment
  `37ee8021-9037-4f4c-b0d9-cf9219699c25` because no watched backend file
  changed. Active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- zero deployments after retained READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30460436767` -- zero executed steps; account
  billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `8dc051e`; no provider rollback is needed because the
  candidate is not deployed.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Private Search-to-Cortex handoff

Outcome:

- Added explicit `Search records` and `Ask Cortex` command-palette modes while
  preserving record search as the default.
- Prevented Ask mode from issuing `/api/search` requests.
- Added opaque UUID handoff state in same-tab `sessionStorage`, bounded to 100
  normalized characters, five minutes, and one consume.
- Restricted server acceptance to company-wide Cortex without record focus or
  saved-conversation identity.
- Prefilled and focused the Cortex composer, removed the draft and temporary
  route marker, and proved no automatic AI request occurs.
- Added original component specification, selection/draft unit coverage, and
  authenticated responsive browser coverage.
- No database migration, hosted row, role, password, Auth identity, Storage
  object, queue job, AI call, Railway build, or Vercel deployment changed.

Changed files:

- `apps/web/src/components/nav/command-palette.tsx`
- `apps/web/src/components/nav/command-palette-selection.ts`
- `apps/web/src/components/nav/command-palette-selection.test.ts`
- `apps/web/src/lib/cortex/draft-handoff.ts`
- `apps/web/src/lib/cortex/draft-handoff.test.ts`
- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/e2e/dashboard-role-local.spec.ts`
- `docs/research/components/search-cortex-handoff.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused draft/selection/Cortex suites -- 12/12 pass; existing search route
  suite remains 11/11.
- Root lint and typecheck -- pass.
- Root tests -- 408 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated viewer local E2E -- pass with real authorized document search,
  explicit Ask mode, zero question-bearing search request, exact composer
  prefill/focus, zero chat request, prompt-free final URL, removed draft
  storage, 1440/768/390 layouts, and zero overflow or console/page errors.
- One-time viewer session -- globally revoked after QA.
- Desktop and mobile screenshots -- visually reviewed; clean hierarchy,
  readable action, and no overflow.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `8058c8a5db18828656fc182939dce7aa06c698af` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway correctly skipped deployment
  `e2c6d6a8-82cb-4f19-996f-b67518b9d949` because no watched backend file
  changed. Active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- Git remains disconnected and zero deployments exist after retained
  READY deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30462707850` -- all jobs contain zero executed steps;
  account billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `8058c8a`; no provider rollback is needed because the
  candidate is not deployed.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Atomic public canvas signing

Outcome:

- Found that public signing used zero UUID as audit actor, ignored the audit
  foreign-key failure, and committed document/session/source writes
  independently.
- Added 512 KiB PNG bounds, base64 and PNG-signature validation, trimmed
  bounded signer identity, strict canvas-token shape, and random Storage keys.
- Added a second signed/revoked/expired check under a row lock.
- Moved document creation, tenant-scoped source transition, session stamp, and
  nullable-actor entity audit into one database transaction.
- Added compensating Storage deletion for database, audit, or concurrent-replay
  failure.
- Preserved public URL, visible form, token-hash model, invalid-token state, and
  successful `{ ok: true }` response.
- No database migration, hosted row, role, password, Auth identity, durable
  business row, Storage object, queue job, AI call, Railway build, or Vercel
  deployment changed during validation.

Changed files:

- `apps/web/src/app/portal/sign/[token]/actions.ts`
- `apps/web/src/app/portal/sign/[token]/actions.test.ts`
- `docs/research/components/public-canvas-signing.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused public-signing integrity suite -- 5/5 pass.
- Root lint and typecheck -- pass.
- Root tests -- 413 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Connected local browser -- unauthenticated `/portal/sign/dummy` rendered
  `Link not found`, returned bounded invalid-link copy, and emitted zero
  console warnings/errors.
- Packaged Playwright CLI did not start because its updated bundled Chromium
  binary is absent locally; no application assertion ran in that attempt.
  Connected-browser evidence completed the same non-mutating route proof.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `e99b88fd232957ec8a224968ecb63441a2eab9d9` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway correctly skipped deployment
  `ebe99b8c-886e-478e-b3bc-30620fbf11cf` because no watched backend file
  changed. Active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- Git remains disconnected and zero deployments exist after retained
  READY deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30464538827` -- all jobs contain zero executed steps;
  account billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `e99b88f`; no provider rollback is needed because the
  candidate is not deployed.
- Production success-path proof requires a newly created controlled signing
  session because it writes official signature, document, source, and audit
  state. Do not use historical demo records.
- RFQ auto-dispatch integrity is recorded in the following milestone.
- Public signing authority remains in Next.js pending incremental NestJS
  migration.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Atomic RFQ auto-dispatch integrity

Outcome:

- Found a browser-callable RFQ creation path that accepted caller-supplied
  system tenant authority, used a fabricated zero-UUID actor, and committed
  RFQ and audit independently.
- Found that BOM approval emitted `bom/approved` while the consumer listened
  only for `bom/internal_approved`; automatic RFQ creation was not wired.
- Replaced both paths with a server-only, tenant-scoped transaction service.
- Added BOM row locking, actor revalidation, one-result retry semantics,
  transactional audit, and post-commit notification.
- Added a unique tenant/BOM RFQ key and validated tenant-composite BOM foreign
  key.
- Removed direct browser insert, update, and delete privileges from RFQs and
  quotes while preserving authenticated tenant-scoped reads.
- Applied forward migrations `20260729152059` and `20260729153620` to Supabase
  project `aqqrtkmtcsfkbyyqxowv`. Hosted state is current at 53/53; RFQ count,
  quote count, and duplicate count remain zero.
- No Vercel deployment was created. Visible UI and copy are unchanged.

Changed files:

- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts`
- `apps/web/src/lib/inngest-rfq.ts`
- `apps/web/src/lib/inngest-rfq.test.ts`
- `apps/web/src/lib/procurement/rfq-service.ts`
- `apps/web/src/lib/procurement/rfq-service.test.ts`
- `packages/database/src/schema/bom-extras.ts`
- `packages/database/src/schema/boms.ts`
- `packages/database/src/__tests__/rfq-transaction-integrity.test.ts`
- `supabase/migrations/20260729152059_rfq_transaction_integrity.sql`
- `supabase/migrations/20260729153620_close_rfq_browser_writes.sql`
- `docs/research/components/rfq-auto-dispatch-integrity.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused RFQ Web suites -- 15/15 pass.
- RFQ Drizzle contract suite -- 5/5 pass.
- Root lint, typecheck, test, and production build -- pass.
- Root tests -- 433 application tests pass.
- Next production build -- 77/77 static-generation steps.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 53/53 migrations and 228/228
  database assertions with zero skips; schema fingerprint stable.
- Hosted migration plan -- current at 53/53 with no missing or unexpected
  versions.
- gitleaks 8.30.1, actionlint 1.7.12, action-reference checks, diff checks, and
  prohibited external ERP source/brand scan -- pass.
- Source commit `f173957559a93eb724daf9eeed3fbbb1c4576baf` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `94c78bd2-327a-4f6a-a49e-1d77195d850d` -- SUCCESS for
  the exact source SHA; live `/health` and `/ready` pass with database and
  Redis `ok`.
- Vercel -- Git remains disconnected and zero deployments exist after retained
  READY deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30467875222` -- Actionlint failed before any step started
  because of the account payment/spending-limit restriction; all dependent
  jobs skipped with zero executed steps.

Rollback and unresolved:

- Revert application source commit `20d276c` only if necessary. Do not undo
  the live integrity migrations; correct them with a reviewed forward
  migration.
- RFQ quote logging, completion, and cancellation are now row-locked,
  tenant-scoped, idempotent, state-machine guarded, and atomic with audit in
  source commit `20d276c`; hosted migration `20260729162944` is current.
- RFQ transaction authority remains transitional Next.js code. The next safe
  slice is an inert disabled NestJS procurement adapter preserving the same
  contract.
- Frontend activation still requires one explicitly approved consolidated
  queued Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.
## 2026-07-30 -- Manual BOM-to-RFQ NestJS adapter

Outcome:

- Added strict shared request/result contracts for manual RFQ creation.
- Added capability-guarded NestJS `POST /v1/procurement/rfqs`.
- Added tenant-derived authority, BOM row locking, exact replay, contracted
  rate filtering, pending RFQ insertion, and one atomic semantic audit.
- Added an independent fail-closed Next.js tenant gate while preserving the
  existing Server Action contract and post-commit notification.
- Kept the automatic Inngest path unchanged.
- Left both creation cutover variables unset.
- No UI, schema, hosted data, Python, queue, Storage, or Vercel deployment
  changed.

Changed files:

- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `apps/api/src/procurement/create-rfq.pipe.ts`
- `apps/api/src/procurement/procurement.controller.ts`
- `apps/api/src/procurement/procurement.controller.spec.ts`
- `apps/api/src/procurement/procurement.service.ts`
- `apps/api/src/procurement/procurement.service.spec.ts`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `docs/research/components/rfq-create-nest-adapter.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared, API, Web client, and Server Action suites -- pass.
- Root lint and typecheck -- pass.
- Root application tests -- 412 pass.
- Ordinary database lane -- 99 pass and 137 expected disposable-only skips.
- Nest and Next production builds -- pass; Next 77/77 static steps.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 54/54 migrations, stable schema
  fingerprint, 236/236 database assertions with zero skips, and 2/2 Nest
  database integration tests.
- Actionlint 1.7.12, pinned action references, release-planner tests, gitleaks
  8.30.1, diff checks, and prohibited external ERP runtime scan -- pass.

Rollback and unresolved:

- Keep `ERP_RFQ_CREATE_WRITES_VIA_API` unset or exact `false`; tenant allowlist
  stays empty.
- Revert this source milestone if needed. No migration or data rollback exists.
- Production provider evidence will be appended after reviewed publication.
- Automatic BOM-approved RFQ dispatch remains in Next.js/Inngest. Next safe
  slice moves it to NestJS/BullMQ behind another disabled tenant gate.
- Frontend release remains one explicitly approved queued Standard build.

Provider evidence:

- Source commit `b8d1e518e63d0fcf9802efe30b2f1569ad6c6de4` is published on
  `main` and `agent-02/third-code-erp-landing`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `5ebaca8a-e1cb-4d25-afb3-a98930046ebc` is SUCCESS for
  the exact source SHA. It uses `apps/api/Dockerfile`; image digest is
  `sha256:341680353751a36c4fdc61c330b31a98c32b0be77aea983b702e7c0bbf1329b2`.
- Live API `/health` and `/ready` return 200; readiness reports database and
  Redis `ok`. Anonymous `POST /v1/procurement/rfqs` returns 401. The deployment
  error-log query returned no entries.
- Vercel Git remains disconnected. The retained production deployment is
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`; no frontend deployment was created.
- Hosted GitHub Actions run `30494823225` executed zero steps because the
  account payment/spending-limit restriction prevented the job from starting.
- Free transient self-hosted run `30495135107` passed the exact source SHA in
  15m22s: workflow validation, lint, typecheck, tests, clean PostgreSQL
  17/Redis verification, production builds, Web and Nest runtime smoke checks,
  and secret scanning.
- The transient runner is deregistered; GitHub reports zero registered runners
  and no runner process remains. Two Windows-locked, credential-free runner
  work directories retain only non-secret `.runner` metadata and require
  manual cleanup.

## 2026-07-30 -- Approved-BOM RFQ BullMQ dispatch

Outcome:

- Wrote an original clean-room dispatch specification before code.
- Added strict shared dispatch result, versioned job, and dead-letter
  contracts.
- Added protected NestJS `POST /v1/procurement/rfqs/dispatch`, deriving all
  authority and queue policy from the authenticated server context.
- Added deterministic tenant/BOM job identity, five exponential attempts, and
  one deterministic final dead-letter record.
- Added execution-time membership and `rfq.dispatch` reauthorization,
  approved-BOM enforcement, and reuse of the existing atomic RFQ transaction.
- Added an independent exact Next.js flag and strict tenant allowlist while
  preserving Inngest as the disabled-path authority. Selected Nest failure
  never falls back to Inngest.
- Kept both automatic dispatch environment variables unset. Notification
  parity remains the explicit blocker before any tenant cutover.
- Changed no React/UI, schema, migration, hosted data, Supabase, Python,
  Storage, provider configuration, or Vercel deployment.

Changed files:

- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `apps/api/src/auth/capability.guard.ts`
- `apps/api/src/procurement/**`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/api/integration/rfq-dispatch.redis.integration.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.test.ts`
- `scripts/ci/run-wsl1-database-lane.ps1`
- `docs/research/components/rfq-auto-dispatch-nest-bullmq.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared/API/Web suites -- 60/60 pass.
- `pnpm lint` -- pass.
- `pnpm typecheck` -- pass.
- `pnpm test` -- pass: 430 application tests; ordinary database lane 99 pass
  with 137 intentional disposable-only skips.
- `pnpm build` -- pass: Nest production bundle and 77/77 Next generated pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 54/54 migrations, 236/236
  zero-skip database assertions, 5/5 Nest integration tests, and stable schema
  SHA-256
  `36B8999F16B825D89D8F782CBF28180D074AD677A9E8B2C16B713C79BB931BB6`.
- Real Redis evidence -- duplicate suppression, three-attempt bounded failure
  exercising the production processor, one dead letter, shutdown/restart,
  reconnect, and post-restart processing pass. Unit tests separately assert
  the production five-attempt policy.
- Actionlint, immutable workflow-action reference checks, database and Project
  release-planner tests, Gitleaks, `git diff --check`, and prohibited
  ERPNext/Frappe runtime scan -- pass.

Failures found and fixed:

- The first database assertion counted both the database trigger audit and the
  intended semantic audit; the assertion now filters the exact semantic action
  and source.
- The first dead-letter test waited for a worker that intentionally does not
  exist; it now verifies durable job presence.
- The first WSL restart helper used unsafe shell expansion and the long
  database run could leave Redis stopped before API integration. The helper now
  uses pinned absolute Redis paths and recreates the disposable process
  immediately before integration tests.

Rollback and unresolved:

- Keep `ERP_RFQ_AUTO_DISPATCH_VIA_API` absent/false and its allowlist empty, or
  revert the source commit. Existing Inngest behavior remains authoritative.
- Do not enable the BullMQ path until an idempotent NestJS notification
  outbox/delivery slice passes equivalent evidence and a controlled hosted
  canary is explicitly approved.
- Vercel Git remains disconnected. No frontend build is authorized.

Provider evidence:

- Source commit `dffb6052dde794a80abd8bbb24acc59adcd6fd10` is published on
  `main` and `agent-02/third-code-erp-landing` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `5e717900-d78a-4472-846f-df5784167354` is SUCCESS for the
  exact source SHA. Image digest is
  `sha256:13a83447269e7588cf4141ca02491122e0a5101b24678d1657e69034d4717864`.
- Live API `/health` and `/ready` return 200; readiness reports PostgreSQL and
  Redis `ok`. Anonymous dispatch returns 401. Deployment error logs are empty.
- Railway reports zero `ERP_RFQ_AUTO_DISPATCH*` environment variables.
- Vercel reports zero deployments after retained baseline timestamp
  `1785295180454`; Git remains disconnected and no paid frontend build ran.
- Hosted GitHub Actions run `30498025937` completed with zero executed steps:
  Actionlint could not start and all dependent jobs were skipped. GitHub
  reports zero registered self-hosted runners. The complete local and
  disposable PostgreSQL/Redis evidence above remains the release gate.

## 2026-07-30 -- RFQ notification outbox and BullMQ delivery

Outcome:

- Wrote an original clean-room notification outbox specification before code.
- Added atomic RFQ, semantic-audit, outbox-intent, and recipient-snapshot
  persistence in NestJS/PostgreSQL.
- Added UUID-only BullMQ jobs, deterministic job identity, five-attempt
  database and queue ceilings, active-claim suppression, stale recovery, and
  durable dead-letter state.
- Added idempotent in-app delivery and server-built Resend delivery with one
  provider idempotency key per delivery.
- Removed browser write authority from notifications and exposed no browser
  privileges on outbox/delivery tables.
- Made the one-minute recovery sweep opt-in and false by default to avoid
  continuous Redis work while automatic routing is disabled.
- Applied hosted migration
  `20260729233017_notification_outbox_foundation.sql` to Supabase project
  `aqqrtkmtcsfkbyyqxowv`.
- Kept all production cutover flags disabled. Existing Inngest behavior
  remains authoritative.

Changed files:

- `apps/api/src/config/environment.ts`
- `apps/api/src/config/environment.spec.ts`
- `apps/api/src/procurement/notification-*`
- `apps/api/src/procurement/procurement.service.ts`
- `apps/api/src/procurement/procurement.service.spec.ts`
- `apps/api/src/procurement/rfq-dispatch.processor.ts`
- `apps/api/src/procurement/rfq-dispatch.processor.spec.ts`
- `apps/api/src/procurement/procurement.module.ts`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/api/integration/rfq-dispatch.redis.integration.spec.ts`
- `packages/database/src/schema/notifications.ts`
- `packages/database/src/__tests__/notification-outbox.test.ts`
- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `scripts/verify-database-repro.mjs`
- `supabase/migrations/20260729233017_notification_outbox_foundation.sql`
- `docs/research/components/rfq-notification-outbox-nest-bullmq.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared, database, and API tests pass.
- Root tests pass: 444 application tests; ordinary database run passes 103
  tests with 137 intentional disposable-only skips.
- Sequential root lint and typecheck pass after the production build. The
  first parallel run only raced Next's generated `.next/types` replacement.
- Production build passes: Nest bundle and 77/77 Next generated pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane passes 55/55 migrations, 240/240
  zero-skip database assertions, and 7/7 Nest integration tests.
- Real integration proves atomic replay, one in-app notification, one provider
  call, active-claim suppression, database attempt ceiling, final dead letter,
  Redis restart/reconnect, and database-pending recovery after Redis loss.
- Stable schema SHA-256 is
  `5429BBD50089170BFCA7E624C928DB6EBEA30E3D2585E26439CEF592710B6E8C`.
- Actionlint 1.7.12, immutable action-reference checks, both release planners,
  Gitleaks 8.30.1, and `git diff --check` pass.

Hosted database evidence:

- Project `ERP` is `ACTIVE_HEALTHY` on PostgreSQL 17.6.
- Ledger is 55/55 at `20260729233017`.
- New outbox and delivery tables contain zero rows.
- Three tenant-composite foreign keys are present and validated.
- `anon` and `authenticated` cannot access either server-only table.
- `authenticated` cannot insert, update, or delete notifications.
- Advisor additions are informational only: RLS-with-no-policy for two
  intentionally fail-closed tables and unused indexes on two empty tables.

Provider evidence:

- Source commit `a93da5f5025677444ca14407c98a189673c952dc` is published on
  `main` and `agent-02/third-code-erp-landing`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `50fad0aa-8506-457a-a405-152dc31d2340` is SUCCESS for
  that exact SHA. Image digest is
  `sha256:50d598e279aa8d6b3681a0f2a230ed46d682bdc80e0802ff9bd81023dbd11a55`.
- Live `/health` and `/ready` return 200; PostgreSQL and Redis report `ok`.
  Anonymous dispatch returns 401. Deployment error logs and recent HTTP 5xx
  logs are empty.
- Railway has no automatic-dispatch, notification-sweep, or email-delivery
  variables. The new path is inert and creates no scheduled provider work.
- GitHub Actions run `30499929834` failed before executing a step. Actionlint
  has zero steps and every dependent job is skipped because the hosted account
  billing restriction remains.
- Vercel project `thirdcode-erp` reports zero deployments after retained
  production deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`, baseline
  timestamp `1785295180454`. Git remains disconnected.

Rollback and unresolved:

- Keep automatic routing, its tenant allowlist, and recovery scheduling
  absent/false. Revert application source if needed; leave the forward
  migration applied and preserve delivery evidence.
- Resend configuration is intentionally absent from this disabled milestone.
- A production canary still requires explicit clean-tenant approval,
  environment diff, monitoring, reconciliation, and rollback.
- Vercel Git remains disconnected and no frontend deployment is authorized.

## 2026-07-30 -- Controlled Supabase, Vercel, and Railway production release

Scope:

- Publish the already validated ERP state to the named production providers.
- Execute no database or backend mutation when parity and release identity
  prove they are already current.
- Bound Vercel billing by creating only the builds required for one production
  release, then disconnect Git.

Repository and validation:

- Release source:
  `31c04942a93dce78f165880fb02bdf38d25eb506`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`, published on `main` and
  `agent-02/third-code-erp-landing`.
- Sequential lint and typecheck pass.
- Sequential tests pass: 88 shared, 64 API, 292 web, and 103 ordinary database
  tests with 137 intentional disposable-only skips; 444 application tests
  total.
- Production build passes: NestJS build and 77/77 Next.js generated pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane passes all 55 migrations, 240/240
  database assertions, 7/7 Nest integration tests, Redis restart/recovery, and
  schema SHA-256
  `5429BBD50089170BFCA7E624C928DB6EBEA30E3D2585E26439CEF592710B6E8C`.
- Actionlint 1.7.12, immutable action-reference verification, both release
  planners, and Gitleaks 8.30.1 pass.

Supabase:

- Project `aqqrtkmtcsfkbyyqxowv` reports PostgreSQL 17.6 and 55 migrations
  through `20260729233017_notification_outbox_foundation`.
- Repository and hosted ledgers match exactly. No migration was executed.
- `notification_outbox` contains zero rows after release.

Vercel:

- Protected preview `dpl_92JBFVyZjGozKPg2vcu5Hv4wNx9c` is `READY` on exact
  source `31c04942a93dce78f165880fb02bdf38d25eb506`.
- Production deployment `dpl_Htv5nb1A8oHbtowQpmrToYQgxDDL` is `READY` on the
  same source and aliases `https://thirdcode-erp.vercel.app`.
- Vercel required two total builds: one protected preview and one production
  rebuild using production environment variables. No retries were created.
- Root, health, readiness, robots, sitemap, and manifest return 200. Dashboard
  renders in the authenticated browser without a Server Components error.
- Web health and readiness report revision `31c04942a93d`; database readiness
  reports `up`.
- Production deployment has no runtime-error cluster and no HTTP 5xx.
- Git connection to `Third-Code-Solutions/ERP` was removed successfully after
  verification. Future source pushes cannot auto-deploy.
- Rollback reference:
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.

Railway:

- Project `a21fd382-80b2-4218-8025-11f420a062e3`, service
  `c45b3d01-036a-4663-a524-0713d782fce3`, remains online in production.
- Deployment `50fad0aa-8506-457a-a405-152dc31d2340` remains `SUCCESS` on
  application source `a93da5f5025677444ca14407c98a189673c952dc`, image
  `sha256:50d598e279aa8d6b3681a0f2a230ed46d682bdc80e0802ff9bd81023dbd11a55`.
- Current repository delta is documentation-only, so the later Railway event
  correctly skipped with `No changes to watched files`.
- `/health` and `/ready` return 200; PostgreSQL and Redis report `ok`.
  Anonymous RFQ dispatch returns 401. Last-hour HTTP 5xx query is empty.

Rollback and unresolved:

- Frontend rollback: promote retained deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Backend rollback: retain or redeploy the prior healthy Railway image only if
  backend behavior regresses; no backend change occurred in this release.
- Database rollback: none required because no SQL ran.
- Automatic RFQ routing and notification recovery remain disabled pending a
  separately approved canary.

## 2026-08-01 PO authority audit and disabled Nest adapter

Objective: close immediate PO authorization gaps and define smallest safe
NestJS migration seam without changing live UI/API behavior or consuming a
provider deployment.

Findings:

- `apps/web/src/app/(dashboard)/procurement/actions.ts` remains direct-write
  authority for PO creation, lines, cost-code edits, transitions, approval
  stamps, supplier issuance, and receiving.
- Tenant filters existed on most queries, but capability checks were missing
  on several creation/legacy/receiving entry points. BOM creation also did not
  verify supplied project/vendor belonged to caller tenant.
- Existing PO number allocation and BOM/grouped creation are not yet a single
  idempotent PostgreSQL transaction. This remains a cutover blocker.

Changes:

- Added `po.receive` to shared web permission matrix.
- Added `po.create` to Nest capability guard matrix.
- Hardened current Server Actions with profile-derived actor/tenant,
  `po.create`/`po.receive` checks, same-tenant project/vendor validation, and
  integer centavo line validation.
- Added shared strict PO command/result schemas, `CreatePurchaseOrderPipe`,
  `PurchaseOrderController`, and `PurchaseOrderCreationService`.
- Added five tests covering disabled service behavior, required idempotency
  header, rejection of caller authority fields, and validated principal
  forwarding. Adapter service always fails closed; it writes nothing.
- Added defensive runtime parsing for standalone PO line payloads: non-array,
  null, primitive, non-integer, and negative values are rejected before any
  cost-code lookup or write.

Validation:

- Shared-types: 91 tests passed.
- API: 70 tests passed.
- Web: 292 tests passed.
- Database: 103 tests passed; 137 disposable-environment tests skipped because
  this local gate had no `DATABASE_URL`.
- Root lint and typecheck passed.
- Production build passed: Nest webpack compile and Next 77/77 pages.
- `git diff --check` passed; no migration or provider deployment was run.
- No SQL, hosted Supabase migration, Vercel build, Railway deployment, or
  browser UI mutation performed.

Rollback/unresolved:

- Revert source commit; leave `ERP_PO_CREATE_WRITES_ENABLED` absent/false.
- Commit `1c41d5e2bb69fb91deb778f76e60e10521d19000` is pushed to
  `agent-02/third-code-erp-landing` on `Third-Code-Solutions/ERP` under the
  local `kurtgav` GitHub CLI account. The Codex GitHub connector remains
  separately authenticated as `jdy1000`; it was not used for the push.
- Next action: add durable tenant-composite idempotency migration, implement
  Nest standalone transaction, prove disposable PostgreSQL parity, then
  tenant-canary one command. Keep other PO workflows on current path.
## 2026-08-01 - standalone PO transaction/idempotency milestone

Objective: move the smallest official PO write behind a transaction-safe Nest
boundary without changing the existing UI or default API behavior.

Completed:

- Added migration candidate 20260801090000, Drizzle schema, tenant-composite
  idempotency checks, RLS/service-only grants, and tenant PO-number uniqueness.
- Implemented capability recheck, idempotency replay/conflict handling,
  same-tenant reference validation, advisory numbering lock, bounded exact
  centavo math, line insertion, semantic audit, and atomic result persistence.
- Added exact API/Next feature gates, UUID tenant allowlists, stable hidden
  request keys, and fail-closed delegation.

Validation:

- Database: 106 passed, 137 environment-gated skips.
- API: 70 passed.
- Web focused client: 16 passed; full web suite: 295 passed.
- Typechecks for database, API, web, and shared contracts passed.
- Root lint, typecheck, test, and production build passed (77/77 Next pages
  and Nest compile).
- Docker integration was unavailable because the local Docker engine pipe could
  not be reached. Hosted Supabase stayed at 55/55; no hosted SQL or provider
  deployment was performed.
- Read-only Supabase release planner: PostgreSQL 17, linear 55/56 ledger,
  missing only 20260801090000; no migration SQL executed. Conservative SQL
  review flags the migration's drop-constraint statements.

Unresolved: run real PostgreSQL 17/Redis replay, rollback, cross-tenant, audit,
number-concurrency, and centavo-boundary probes before enabling one tenant.

Source evidence: commit 0252937402925c88e657982b5e60ec914e851c74 pushed by
kurtgav to Third-Code-Solutions/ERP branch
agent-02/third-code-erp-landing. Changed files are the candidate Supabase
migration, database enum/table/index/schema exports and contract test, Nest
environment/service/unit tests, shared command bounds/tests, Next server
action/form/core-client/gates/tests, and the six required architecture and
operations memory files. The exact next action is the disposable
PostgreSQL 17/Redis proof described in NEXT_ACTIONS.md; no provider release is
authorized by this milestone.

## 2026-08-01 - live landing regression milestone

Objective: verify and protect the existing public landing surface while
continuing the incremental ERP authority migration.

Completed:

- Audited the live landing page at desktop and mobile widths with browser
  automation, including accordion, carousel, FAQ, metadata, and console checks.
- Added `apps/web/src/components/marketing/third-code-landing.test.ts`.
- Added durable evidence in `docs/research/LIVE_LANDING_AUDIT_20260801.md`,
  `docs/research/live-landing-snapshot.md`, and
  `docs/design-references/live-landing-desktop.png`.
- Updated landing behavior/spec and architecture/operations memory files.

Validation: focused landing test 3/3; full web suite 298 passed; web
typecheck passed; live browser checks passed with zero console errors. No
Vercel, Railway, or hosted Supabase mutation occurred. Disposable
PostgreSQL/Redis proof remains blocked by disabled local hardware
virtualization, not by a test failure.

Next action: keep the landing surface stable and run the full 56-migration
PostgreSQL 17/Redis transaction proof on an already available owned Linux or
CI runner, with no new paid provider commitment.

## 2026-08-01 - disposable PostgreSQL/Redis authority proof

Objective: replace Docker-only integration blockage with a no-cost disposable
runtime and prove the first Nest transaction boundary end to end.

Completed:

- Ran `scripts/ci/run-wsl1-database-lane.ps1` in Alpine WSL1 distro
  `ThirdCodeERP-Test`.
- Rebuilt PostgreSQL 17 database from zero and applied all 56 migrations;
  ledger exactly matched repository and schema hash remained unchanged across
  the test run.
- Executed database tests 243/243 with zero skips.
- Executed Nest integration tests 7/7: tenant/auth, idempotency, rollback,
  audit, Redis restart, and Redis data-loss recovery.

Validation: lane exited 0; schema SHA-256
`427DEBE7531E969D9142C618180FB896FFE12C55C654655256DF1BA7647F2384`. Only
known Redis memory-overcommit warning remains. No hosted Supabase SQL,
Vercel deployment, or Railway deployment occurred.

Next action: perform read-only Supabase reconciliation and obtain correct
`kurtgav` Vercel/Railway provider sessions before any controlled canary.

## 2026-08-01 - PO approval workflow authority slice

Objective: move the smallest approval state machine into NestJS without
changing current UI behavior or enabling production writes.

Completed:

- Added candidate migration `20260801100000_purchase_order_workflow_idempotency.sql`
  and Drizzle schema with tenant-composite foreign keys, RLS, and service-only
  grants.
- Added strict shared contracts and Nest route/service for submit, PM approve,
  Commercial approve, and first-two-step rejection. The service locks the
  request and PO, rechecks membership/capability, commits stamps/status/audit,
  and replays idempotently. No issuance or email side effect is included.
- Added exact disabled workflow flags, controller/pipe/unit/contract tests,
  and a real database integration test covering commit, replay, state guard,
  audit, rollback, and tenant isolation.

Validation:

- WSL1 disposable lane: 57 migrations; database 243/243 with zero skips;
  Nest/Redis integration 8/8; schema before/after hash matched.
- API focused suite 74/74; shared contract suite 17/17; API/database
  typechecks and root lint passed.
- Hosted Supabase, Vercel, and Railway were not mutated. Provider auth still
  needs `kurtgav` / `kurtgavin.design@gmail.com`.

Next action: read-only hosted Supabase reconciliation at migration 57, then
provider identity/readiness/log verification. Keep workflow flags false and
do not deploy until a single-tenant canary is explicitly reviewed.

Hosted read-only reconciliation (2026-08-01): PostgreSQL 17; applied 55;
applied head `20260729233017`; repository 57; missing exactly
`20260801090000_purchase_order_create_idempotency.sql` and
`20260801100000_purchase_order_workflow_idempotency.sql`; unexpected history
0; applied-after-gap 0; no SQL executed. SHA-256 candidates are recorded by
the planner; both carry the conservative `drop-object` review flag.

## 2026-08-01 - server-only PO workflow client seam

Added `purchaseOrderWorkflowWritesUseCoreApi` and
`transitionPurchaseOrderThroughCoreApi` to the server-only Next core client,
with strict result validation, exact keyed requests, and 18/18 focused web
tests. No visible UI or copy changed; no Server Action delegates yet because
Nest notification parity is a separate gate. The independent client flags are
absent/false by default.

Final release gates (2026-08-01): root `pnpm typecheck` and `pnpm lint` passed;
full `pnpm test` passed (shared 93, database 106 with the normal
environment-gated skips, web 300, API 74); `pnpm build` passed with Nest
compile and 77/77 Next pages generated. Worktree is clean at commit
`6c0ce47`. No hosted SQL or provider deployment was performed.

## 2026-08-01 - PO workflow notification parity milestone

Objective: make the disabled Nest Purchase Order approval boundary preserve
transactional notification intent and role routing without changing visible UI
or the current Server Action path.

Completed:

- Added candidate migration `20260801110000_purchase_order_workflow_notifications.sql`
  with strict Purchase Order workflow payload integrity.
- Added independent `ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED` and tenant
  allowlist gates, default false/empty. A workflow transition now requires
  both write and notification gates, then commits status, audit, outbox, and
  role-routed in-app/email delivery rows atomically.
- Added BullMQ delivery support with payload/aggregate/current-role checks,
  stale processing and dead-letter handling, idempotent in-app inserts, and a
  bounded Resend Purchase Order workflow email.
- Added shared contracts, recipient-routing tests, email tests, and a real
  database integration probe for commit/replay/rollback and delivery.

Validation:

- Disposable Alpine WSL1 lane: PostgreSQL 17, Redis 7.4.9, 58/58 migrations;
  database 244/244 without skips; Nest/Redis integration 8/8; schema hash
  `F7F4A6AF4ABDDCF233B207D7652382A256D102F987A1670162DAB44C911EA243`.
- Full serial `pnpm exec turbo test --concurrency=1 --force`: shared 94, API
  79, web 300, database 107 with 137
  normal environment-gated skips. Root typecheck, lint, and build passed;
  Nest compiled and Next generated 77/77 pages.
- Read-only Supabase planner: PostgreSQL 17, 55 applied, repository 58,
  missing exactly the three linear candidates 20260801090000,
  20260801100000, and 20260801110000; no SQL executed. Vercel and Railway
  were not deployed.

Unresolved: provider sessions remain Vercel unauthenticated and Railway
`joeseffdy@gmail.com`; authenticate as `kurtgav` /
`kurtgavin.design@gmail.com`, verify readiness/logs/spend controls, and review
a one-tenant canary. Keep all PO and notification flags false.

## 2026-08-01 - Read-only project canary audit gate

Ran `scripts/plan-project-cutover.mjs --json` against one existing demo
tenant/project/actor selected read-only from hosted PostgreSQL. The planner
confirmed PostgreSQL 17, target existence, Auth identity, project audit
trigger, hardened audit function, and non-public audit function permissions.

Result: `blocked`. The tenant audit chain has 2 predecessor-link mismatches
and 151 hash mismatches; the selected actor lacks `project.update`. No rows,
permissions, feature flags, migration ledger, provider session, or deployment
changed. Next action is a separate audit recovery review, then a fresh
read-only canary plan; do not enable PO/project writes.

## 2026-08-01 - Audit hash parity hardening milestone

Forensic read-only evidence showed the database trigger and server audit
writers used different hash inputs. Added `computeDatabaseAuditHash` with
PostgreSQL UTC timestamp rendering; API `AuditService`, Next `writeAuditLog`,
and shared `verifyHashChain` now use it. Existing rows remain immutable.

Validation: shared audit 17/17; serial full suite shared 95, database 107 plus
137 normal skips, web 300, API 79; WSL1 PostgreSQL 17/Redis 7.4.9 58/58
migrations, 244/244 DB assertions, 8/8 integration; root typecheck/lint/build
passed and Next generated 77/77 pages. No hosted SQL, audit repair, or
provider deployment occurred.

## 2026-08-01 - Read-only audit recovery planner milestone

Added `scripts/plan-audit-recovery.mjs`, `scripts/lib/audit-recovery-plan.mjs`,
and `scripts/plan-audit-recovery.test.mjs`. The planner uses an explicit
tenant selector, read-only repeatable-read isolation, opaque refs, bounded
system event buckets, hardened-function checks, and `--require-clear`.

Validation: planner contract 4/4, existing release/cutover contracts 7/7 and
6/6, actionlint passed. Hosted read-only run: PostgreSQL 17/UTC, 661 audit
rows, 2 predecessor-link mismatches, 151 hash mismatches, status
`review_required`. No audit rows, permissions, flags, migrations, or provider
deployments changed.

## 2026-08-01 - Audit hash profile verification milestone

Added `scripts/verify-audit-hash-profiles.mjs` and its pure profile contract
tests. Hosted read-only verification classified 661 rows as: database formula
510, legacy JSON formula 40, unknown 111, with 2 predecessor-link breaks.
`--require-current` remains blocked. No row rewrite, permission change,
migration, flag enablement, or provider deployment occurred.

## 2026-08-01 - Controlled hosted release gate

Pushed the reviewed branch under `kurtgav` at `ca9ff6d`. A single Vercel
preview reached `Ready`; Preview Protection prevented anonymous endpoint
verification, so no production promotion was made. Railway production stayed
on its active deployment and `/health` plus `/ready` remained 200.

Validation and release attempt:

- Read-only planner: PostgreSQL 17, hosted 55/58, linear missing suffix of
  exactly three migrations, no unexpected versions or later-after-gap rows.
- Preflight: one duplicate tenant/PO-number group containing 12 demo records;
  target idempotency tables and notification constraint absent.
- Applied all three reviewed SQL files inside one PostgreSQL transaction. The
  first migration's explicit uniqueness guard rejected the duplicate group;
  PostgreSQL rolled back. The hosted ledger still reports 55/58 and no schema,
  data, audit, permission, flag, or deployment mutation followed.

Changed files for this milestone: architecture and operations release notes
only. No business record was renamed or deleted. Exact next action is an
owner-approved reversible remediation plan for the duplicate group, followed
by a fresh read-only audit/release gate.

## 2026-08-01 - Purchase Order duplicate-remediation planner

Implemented a read-only release-evidence tool for the hosted migration blocker:

- `scripts/plan-purchase-order-duplicates.mjs` runs in a repeatable-read,
  read-only transaction and reports bounded duplicate groups.
- `scripts/lib/purchase-order-duplicate-plan.mjs` provides stable opaque refs,
  positive-limit parsing, status counts, and release blockers.
- `scripts/plan-purchase-order-duplicates.test.mjs` covers clear, blocked,
  truncated, and deterministic output paths.
- Root scripts and both CI workflows now run the contract test.

Hosted evidence: one duplicate group, 12 records, no truncation; status
`review_required`. No PO number, UUID, money, note, schema, data, audit row,
flag, provider setting, or deployment was changed.

Validation: planner contract 4/4, existing release/cutover/audit contracts,
actionlint, typecheck, serial full tests (95 shared, 107 database with normal
137 environment skips, 79 API, 300 web), lint, and production build (77/77
Next pages) passed. Exact next action remains owner-approved reversible data
remediation, then a fresh DB release planner.

## 2026-08-01 - Clean-room runtime branding guard

Scanned `apps/web/src` and text assets under `apps/web/public` for residual
ABI Ops, ERPNext, and Frappe markers. No runtime occurrences were found. Added
`apps/web/src/lib/branding-clean-room.test.ts`, which recursively checks future
runtime text while constructing forbidden tokens without embedding them
contiguously in the test source.

Validation: the new Vitest contract passed; no visible UI copy, database,
provider setting, feature flag, or deployment changed.

## 2026-08-01 - Controlled release gate aggregator

Added `scripts/plan-controlled-release.mjs` plus the pure
`scripts/lib/controlled-release-plan.mjs` helper and contract tests. The gate
composes the existing read-only database and duplicate planners, an explicit
audit planner selector, and live Railway/Vercel readiness probes. It prints a
bounded decision and never applies SQL, changes flags, changes provider
settings, or creates a deployment.

Hosted execution: `review_required`; database 55/58, one duplicate group with
12 demo records, and no `AUDIT_RECOVERY_TENANT_ID` in the current shell. Both
readiness endpoints returned HTTP 200. No hosted data or provider state
changed.

Validation: controlled gate 4/4, release/cutover/audit/hash/duplicate
contracts, actionlint, gitleaks, typecheck, lint, full package tests (95
shared, 107 database plus 137 normal skips, 79 API, 301 web), and production
build (77/77 pages). The first parallel run was invalidated because build and
typecheck raced on generated `.next/types`; ordered build then typecheck is
the recorded result.

Exact next action: obtain owner-approved reversible remediation for the 12
duplicate demo records and an explicit audit tenant selector, then rerun the
controlled gate. Keep provider deployment and all write flags disabled.

## 2026-08-01 - Stock Receipt draft authority slice

Added the disabled inventory command seam:

- `supabase/migrations/20260801120000_stock_receipt_create_idempotency.sql`;
- `packages/database/src/schema/stock-receipt-create-requests.ts` plus enum/
  index exports;
- `packages/shared-types/src/erp-api/inventory.ts` and exact-arithmetic tests;
- `apps/api/src/inventory/*`, capability policy, environment flags, HTTP/service
  tests, and `apps/api/integration/inventory.database.integration.spec.ts`.

The service derives the actor from tenant membership, validates active
project/global warehouses and accepted same-PO deliveries, maps tracked PO
lines, computes integer micro-unit/centavo values, and commits the request,
draft receipt, lines, result, and semantic audit atomically. Conflicting
idempotency keys are rejected; retries replay the original result. Existing
browser receiving writes were not rerouted.

Validation: production build (API webpack and Next 77/77 pages), root
typecheck, serial lint, full package tests (shared 104, database 110 plus 137
normal skips, API 85, web 301), Actionlint, Gitleaks, migration contract, and
the disposable PostgreSQL 17/Redis 7.4.9 lane (59 migrations, database suite
without skips, API integration including the new Stock Receipt proof) passed.
The first focused integration assertion counted the database trigger audit
row alongside the semantic row; it was corrected to assert the semantic diff,
then passed. No hosted SQL, data, provider setting, flag, or deployment
changed.

## 2026-08-01 - CAD parser authority boundary

Removed the Python worker's direct PostgreSQL/`scope_items` write path and
deleted its database helper/dependency. Added a bounded worker response
contract; the Next application now validates the document belongs to the
tenant/project, replaces only derived rows for that document, computes exact
integer line totals, and records audit evidence transactionally. The upload
route passes the authenticated actor; Inngest uses the same commit function
with a null system actor.

Changed files: `apps/workers/dxf-parser/{src/main.py,src/config.py,src/db.py,
pyproject.toml,Dockerfile,README.md,run-local.sh,.env.example}`;
`apps/web/src/lib/cad/{parse-and-store.ts,worker-contract.ts,
worker-contract.test.ts}`; `apps/web/src/lib/inngest.ts`; and the upload
completion route.

Validation: worker-contract 4/4; web 50 files/305 tests; web typecheck, lint,
ordered Next build 77/77 pages, and Python compileall passed. Python pytest was
not available. No Supabase SQL, Railway deploy, Vercel deploy, flag, or hosted
data mutation occurred.

## 2026-08-01 - NestJS CAD evidence-commit adapter

Added shared CAD evidence schemas/helpers, the server-only
`cad_evidence_commit_requests` migration/table, and disabled NestJS
`POST /v1/documents/:documentId/cad-evidence`. The command derives membership
from PostgreSQL, enforces `document.manage`, validates tenant/project scope,
replaces only document-derived rows, computes exact totals, records idempotent
result plus semantic audit, and fails closed by default. Added HTTP/service/
migration contracts and a disposable API database integration test. Fixed the
API role/capability map to include the existing `estimator` role and
`document.manage` policy; no visible UI changed.

Validation: focused 10/10 API tests; shared 108/108, database 113 passing with
137 normal skips, web 301/301, root typecheck, serial lint, build 77/77 pages,
Actionlint, Gitleaks, and `git diff --check` passed. The disposable lane
replayed 60 migrations, executed database tests 250/250 without skips, and
passed API integration 10/10. No hosted SQL, flag, provider setting, or
deployment was performed.

## 2026-08-01 - NestJS CAD processing-job intake

Added the first durable M2.1 processing seam. Shared contracts are strict and
bounded; the job row is tenant-scoped, idempotent, composite-FK protected,
RLS-enabled, and server-only. Nest derives membership and document project,
rechecks processing/read capabilities, stamps actor context, and returns
queued/replayed state. BullMQ receives only an opaque job UUID with
retry/backoff and duplicate suppression. The worker bridge is intentionally
not registered; no flag or caller can activate this slice by default.

Also recorded the live landing behavior/topology/component audit with 1440px
desktop and 390px mobile screenshots. No landing UI code changed.

Validation: focused API 105/105; disposable PostgreSQL 17/Redis 7.4.9 lane
replayed 61 migrations, passed 253/253 database assertions without skips, and
passed 11/11 API integration assertions. Hosted Supabase, Railway, Vercel,
flags, and business data were not changed.

## 2026-08-01 - Signed Nest-to-Python CAD evidence bridge

Added the next M2 source slice without changing the public upload path:

- `packages/shared-types/src/erp-api/document-processing.ts` now defines
  bounded private request/evidence schemas and limits.
- `apps/workers/dxf-parser/src/{main.py,models.py,storage.py,config.py}` adds
  HMAC-authenticated `/parse-evidence`, exact-object signed-URL download,
  source hashing, deterministic item keys, bounded evidence, and optional
  legacy service-role compatibility.
- `apps/api/src/cad/document-processing.{storage,worker,state,processor}.ts`
  adds server-only signed URL issuance, request signing/response validation,
  PostgreSQL claim/state transitions, retry/dead-letter handling, and the
  disabled BullMQ processor. `cad.module.ts` registers the provider set.
- `apps/api/src/config/environment.ts` adds closed-by-default bridge, parser
  URL/secret, and optional server-only Storage credentials. Processing intake
  now requires the bridge and CAD commit flags plus matching tenant allowlists.
- Added focused worker/processor/shared contracts and extended the disposable
  processing integration for claim/fail/succeed/replay behavior.

Validation: shared contract tests 6/6, API suite 111/111, API typecheck,
Python source bytecode compilation, isolated worker pytest 11/11, full ordered
repository tests, disposable PostgreSQL 17/Redis 7.4.9 replay (61/61
migrations, 253/253 database assertions, 11/11 API integration), typecheck,
serial lint, production build (77/77 pages), Actionlint, Gitleaks, and diff
checks passed. No hosted SQL, flags, provider settings, deployment, or
business data changed.

## 2026-08-01 - Durable CAD evidence and idempotent draft BOM

Added candidate migration `20260801150000_document_processing_evidence.sql`,
Drizzle schema, Nest evidence persistence, independent draft-BOM gate, and
idempotent Nest draft-BOM transaction. Validated worker payload is persisted
per tenant/job/attempt before scope commit. Draft creation locks the job,
revalidates actor/document context, writes integer-centavo BOM lines, attaches
`draft_bom_id`, and emits semantic audit evidence. Replays return the existing
evidence/BOM; mismatched evidence is rejected.

Validation: focused API processor/worker/service/environment tests 19/19,
API typecheck, disposable PostgreSQL 17/Redis 7.4.9 lane with 62/62
migrations, 253/253 database assertions without skips, and 11/11 API
integration assertions passed. No hosted SQL, flags, provider settings,
deployments, or business data changed.

## 2026-08-01 - Atomic CAD scope and draft BOM verification

Refactored the processor handoff so a requested draft BOM is passed as a
context to `CadEvidenceCommitService`; scope replacement, BOM/line creation,
job attachment, idempotency completion, and semantic audit now share one Nest
transaction. Replays lock and reuse the existing BOM. The database integration
probe exercises the same atomic path rather than a separate BOM write.

Validation: disposable PostgreSQL 17/Redis 7.4.9 lane passed 62/62
migrations, 253/253 database assertions without skips, and 11/11 API/Redis
integration assertions. Full workspace gates passed: shared 114/114, API
113/113, web 301/301, database 116 passing with 137 environment-gated local
skips, workspace typecheck, serial lint, Nest/Next production build (77/77
pages), Actionlint, Gitleaks, diff checks, and isolated Python worker pytest
11/11. Hosted Supabase, Railway, Vercel, flags, and business data remain
unchanged.

## 2026-08-01 - Source release handoff

Committed and pushed the reviewed source slice as
`9a773d4e692a4d2471416d14887cbab907f57a04` on
`origin/agent-02/third-code-erp-landing`, authored by `kurtgav`.
The read-only controlled-release planner remains `review_required`: hosted
Supabase is 55/62 migrations with seven candidates pending, one duplicate
Purchase Order-number group contains 12 demo records, and
`AUDIT_RECOVERY_TENANT_ID` is not approved/configured. Railway and Vercel
readiness endpoints remain HTTP 200, but no hosted SQL, flag, deployment, or
business-data mutation was performed.

## 2026-08-01 - Controlled release recheck

Re-ran the read-only controlled-release planner after the final atomic CAD
source handoff. The source worktree and remote branch are clean at
`ef1021f0df799014bff79fe782a31507f33969f5`; author identity remains
`kurtgav <kurtgavin.design@gmail.com>`. The planner still reports
`review_required`: hosted Supabase is 55/62 migrations with candidates
`20260801090000` through `20260801150000`, one tenant-scoped duplicate
Purchase Order-number group contains 12 records, and
`AUDIT_RECOVERY_TENANT_ID` is absent. Railway `/ready` and Vercel `/api/ready`
both returned HTTP 200. No SQL, provider setting, flag, deployment, or
business record changed. Next action requires owner-provided tenant UUID and
record-level duplicate remediation instructions.

## 2026-08-01 - CI secret-scan cost-free fix

Draft PR #1 exposed a GitHub Actions failure before application tests: the
organization-scoped `gitleaks/gitleaks-action@v2.3.9` now requires a paid
license. Replaced that action with the existing checksum-pinned
`scripts/run-gitleaks.mjs` and removed the obsolete action-reference check.
This preserves full-history secret scanning without a paid license or any
runtime/provider change. The PR was pushed again to trigger the corrected CI
run.

The corrected run then exposed a CI-only RLS setup mismatch: Supabase CLI's
local reset did not carry the minimal `anon`/`authenticated` default table
grants used by the repo's WSL reproducibility lane, causing four `projects`
permission errors. Added the existing test-only
`scripts/ci/supabase-system-bootstrap.sql` before the reset so both lanes use
the same system-role bootstrap. No application migration or hosted privilege
was changed.

The first bootstrap retry was rejected by the CLI-owned `auth` schema, so it
was narrowed to a new `scripts/ci/supabase-default-privileges.sql` fixture
that creates only missing roles, schema usage, and future-object grants. It
does not recreate or alter Supabase-managed auth/storage objects.
