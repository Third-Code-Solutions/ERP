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
