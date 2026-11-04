# ERP swarm state

Read first, update last, every run.

## Operating mandate (2026-11-04)
Owner granted end-to-end autonomy: review, merge, deploy to production, roll back.
This overrides `erp-swarm` non-negotiable #4 ("never deploy / never touch production")
for this program only. Hard rules still apply: no force-push, no commits to `main`,
no reading/printing secrets, no deleting production data, no disabling CI or skipping
tests. Stop for: destructive migration on production data, production broken after a
rollback, a new paid service, a legal/licensing question.

Merge gate (no GitHub branch protection: the private repo is on the free plan and the
API returns 403, which counts as a paid service): merge only when `gh pr checks` is all
green, AND the security verdict is PASS, AND the code-review verdict is APPROVE.
Verdicts are posted as PR comments.

## Production facts
- Web: Vercel project `thirdcode-erp` -> https://thirdcode-erp.vercel.app
- API + CAD worker: Railway (see `.github/workflows/deploy-production.yml`)
- DB: Supabase project `aqqrtkmtcsfkbyyqxowv`. PITR is unavailable.
- Deploy path: merge to `main` -> CI on `main` green -> `Production promotion`
  workflow (`workflow_dispatch` on `main`). The workflow re-verifies CI for the exact
  SHA, runs the release gates, deploys Railway + Vercel, and runs production E2E.
  Code-only: a pending migration fails its ledger gate (see `docs/erp/RUNBOOK.md`).
- **Real users/data (checked 2026-11-04):**
  - No paying-customer tenant.
  - Active data is the `buildops-e2e` demo/release-E2E tenant: 11 users, 3 sign-ins
    in the last 30 days, 5 projects, 6 opportunities, 1,092 daily tasks.
  - The `third-code-solutions-inc` internal tenant has 1 user and no projects.
  - 12 empty `abi-ops-demo-*` tenants and 1 isolation-QA tenant.
  - **Policy: treat production as live.** Every migration must be additive
    (expand/contract): never drop, rename or retype in the same release.

## Baseline
- Status: Phase A done 2026-11-04 (`docs/erp/reports/00-baseline.md`,
  `00-security-baseline.md`, `docs/erp/ARCHITECTURE.md`).
- Build: pass (api 26 s, web 127 s) · Typecheck: 0 errors (13 tsconfigs) ·
  Lint: 0/0 (1,388 files) · Tests: 5,105 pass, 0 fail, 204 DB-backed skipped
  locally (run in CI) · Audit: red on `main` (fixed by #129).
- P0: 0 · P1: 4 code + 4 security High open · P2: 12 + 3 security Medium ·
  P3: 10 + 9 security Low.
- P1 queue (dependency order):
  1. BL-01/02/03 + SEC-05/06 (Next RCE/DoS, body-parser crash, audit) → PR #129.
  2. SEC-03 cross-tenant file read: signers must require `storage_path` to start
     with `<tenantId>/` (code, no migration).
  3. SEC-04 PO self-approval: distinct actors in `purchase-order-workflow.service`.
  4. BL-04 opportunity money: zod non-negative decimal → cents in `pipeline/actions.ts`.
  5. SEC-01 + SEC-02: revoke INSERT/UPDATE/DELETE from `authenticated` on legacy
     tenant tables and roadmap outbox/flag/reference tables. **Live in prod**
     (checked 2026-11-04: `authenticated` can INSERT/UPDATE `purchase_orders`,
     `progress_claims`, `provider_delivery_outbox`, `tenant_feature_flags`, …;
     migration 20260921181036 applied). Needs a browser-writer inventory, a
     backup, then an additive grant-only migration.
- PR #125 (`chore/production-readiness-audit-2026-11-02`) duplicates #129's deps
  work and adds 6 contract gates to CI + doc-authority fix. After #129 merges,
  merge `main` into #125 so it carries only that delta, then review it.
- Tenancy model: shared schema + `tenant_id` + RLS.
  - Drizzle server code bypasses RLS, so isolation relies on an explicit
    `tenant_id` WHERE clause on every query.
  - RLS is defense in depth.
- CI (`.github/workflows/ci.yml`, every PR):
  - actionlint, invariants, typecheck, lint
  - unit tests + coverage
  - DB reproducibility on Postgres 17 (integration)
  - build, claim-document browser test, trusted-PR e2e
  - `pnpm audit` (prod + full), gitleaks
- Deferred P1 items (with reason): —

## Current
Order: promote #129 → #128 (round 2) → #130 (P1 security) → baseline PR → #125 delta →
SEC-01/02 grant migration (needs `backup-production.yml` on `main` first).

- **PR #129** merged 2026-11-04 as `a2313a47` (security PASS r2, review APPROVE r2,
  CI green). Next.js 15.5.28, body-parser/multer/qs overrides, zod waiver with
  compensating controls (Core API array budget, token-first DocuSeal webhook).
  Production promotion pending main CI.
- **PR #128** `fix/tasks-generation-and-erp-task-page` (worktree `D:\thirdcode\ERP`).
  Fix loop 1 done (`925685de`, `f2c0d351`), `main` merged in (`854ac6d0`), round 2
  fresh reviewers running.
- **PR #130** `fix/p1-tenant-paths-po-sod-money` (worktree `D:\thirdcode\ERP-p1`):
  SEC-03, SEC-04, BL-04. Fresh reviewers running. Prod check: all 9 `documents`
  rows are tenant-prefixed, so the guard hides no existing file.
- **Baseline PR** `chore/erp-baseline` (worktree `D:\thirdcode\ERP-baseline`): swarm
  files, STATE, RUNBOOK, `smoke:prod` + workflow, encrypted backup workflow, audit
  reports.

## Follow-ups (tracked)
- **zod 4 migration:** removes waiver GHSA-mrhx-c7xc-m3w5. Due 2026-12-04, with the
  minimatch and deepmerge waivers re-checked the same day.
- **daily_tasks generation:**
  - unique partial index + `onConflictDoNothing` (expand migration, needs a backup);
  - `(tenant_id, due_date)` index for cadence and count reads.
- **Takeoff import `raw` record:** authenticated 2.4 MB body of failing keys costs
  ~0.9 GB Core heap (zod 3 union issues). Pre-check key count + single-issue value
  check, or the zod 4 migration.
- **Opportunity GP sign:** web now allows negative GP to match Core; confirm with
  the business that loss-making deals are recorded as negative GP.
- **Owner/admin "Team tasks" view:** needs an explicit change to the daily-task contract
  verifier and its tests, and a `created_by` column so assignees see who assigned a task.

## Done modules
| Slug | PR/branch | Flag | Date |
|---|---|---|---|

## Blockers / decisions needed
- **Licensing (Phase 2 gate):** the module loop clean-room reverse-engineers
  OpenConstructionERP, which is AGPL-3.0, into closed SaaS. The package README says a
  lawyer must confirm this. It falls under the owner's stop rule, so the owner must
  confirm before `oce-recon` touches OCE.

## Log
| Date | Mode | Result |
|---|---|---|
| 2026-11-04 | prod config | Set `ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API=true` + `_TENANT_IDS=<buildops-e2e>` in Vercel production (owner approved); applies on the next prod deploy |
| 2026-11-04 | baseline | Phase A: P0 0 · 4 P1 code + 4 security High. Security auditor verdict BLOCK (SEC-01..06) |
| 2026-11-04 | merge | PR #129 squash-merged `a2313a47` (deps + Next RCE + zod compensating controls) |
