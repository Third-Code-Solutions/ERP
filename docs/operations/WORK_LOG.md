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
