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
- **Gate bypass:** Railway's GitHub integration (a Railway setting, not in this repo)
  also deploys the API on every push to `main`, before `main` CI and the
  promotion's gates run. PR CI and the merge gate still apply. Owner decision
  pending: disable it so the promotion workflow is the only path (see Blockers).
- Phase names: lettered phases (A–D) are the `erp-swarm` init steps; numbered
  PHASE 1/2 are the owner mandate.
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
  locally (run in CI) · Audit: green on `main` since #129.
- P0: 0 · P2: 12 + 3 security Medium · P3: 10 + 9 security Low.
- P1 at baseline: 4 code + 6 security High (SEC-01..06, `00-security-baseline.md`). Status now:
  1. BL-01/02/03 + SEC-05/06 (Next RCE/DoS, body-parser crash, audit): **fixed**,
     PR #129 merged.
  2. SEC-03 cross-tenant file read (storage-path allow-list): **fixed**, PR #130
     merged `198e026c`.
  3. SEC-04 PO self-approval (distinct actors): **fixed**, PR #130.
  4. BL-04 opportunity money: **fixed**, PR #130.
  5. SEC-01 + SEC-02 (browser-JWT table writes): **fixed in prod 2026-11-04**.
     Migration `20261104055626_revoke_client_table_writes` (PR #134, merged
     `5d56f63d`) revokes I/U/D/T/REFERENCES/TRIGGER/MAINTAIN from
     `authenticated`/`anon` on all public tables and in the postgres default ACL.
     Post-apply: 0 client write relations (was 119), SELECT kept on 142.
     Evidence: the preflight and "Applied to production" comments on PR #134
     (catalog queries run through Supabase MCP `execute_sql`).
- PR #125 merged `2c2576cb`: 6 contract gates in CI, doc-authority v1.5, runners
  pinned to ubuntu-24.04.
- Code that is live is not the same everywhere (2026-11-04):
  - **DB**: current (ledger 178, head `20261104055626`).
  - **API (Railway)**: current. Railway's GitHub integration (configured in
    Railway, not in this repo) auto-deploys `main`; deployment `edfd4065` serves
    `5d56f63d` (SUCCESS 2026-11-04 06:15Z; source: Railway MCP `list-deployments`
    for service `c45b3d01`). The promotion workflow's Railway step is the gated
    path and is blocked (see Blockers). CAD worker: there are no commits to
    `apps/workers/dxf-parser` in `04b3ac5a..5d56f63d`, so its watched inputs match
    the last promoted release.
  - **Web (Vercel)**: still `04b3ac5a`. The Next RCE fix (#129), #128, #130 and
    later are **not live on web** until the promotion runs. See Blockers.
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
- Phase D (gap analysis) has not run. `BACKLOG.md` statuses are unreviewed seeds,
  so `/erp-swarm next` must wait for Phase D, which in turn waits for the licensing
  decision below.
- Accepted risk: no environment protection or branch protection (plan blocks it);
  see `docs/erp/RUNBOOK.md` section 5.

## Current
Owner mandate PHASE 1 (init: green baseline, CI merge gate, `smoke:prod`, STATE,
RUNBOOK) is done apart from the production promotion, which is blocked on the
Railway token (see Blockers). Next: rerun `deploy-production.yml` on `main` once
the token is rotated, confirm web `/api/health` revision = `main` HEAD, then
dispatch `smoke-prod.yml`. Mandate PHASE 2 (`next --auto`) waits for Phase D, which
waits for the licensing decision.

- Merged 2026-11-04 (all CI green, security PASS, review APPROVE posted on the PR):
  - #128 `c2d075ad`: tasks generation and task page.
  - #125 `2c2576cb`.
  - #130 `198e026c`.
  - #131 `e083c485`: swarm, RUNBOOK, smoke, backup.
  - #132 `a5c3cd6a`: Railway CLI failure labels, fail fast on bad credentials.
  - #134 `5d56f63d`: SEC-01/02.
- Promotion runs: 41772426127 (2 attempts, #129) and 41779917439 (`a5c3cd6a`)
  failed at "Deploy Nest API to exact Railway service". The last says:
  `Railway deployment list failed: unauthorized (check the RAILWAY_API_TOKEN
  production secret)`.
- `smoke-prod.yml` passed on 2026-11-04 (runs 41776991762 and, after the
  SEC-01/02 apply, [41782320759](https://github.com/Third-Code-Solutions/ERP/actions/runs/41782320759)).
- **Backups (`backup-production.yml`)**:
  - 41776995431: proof run, dump `20261104T050445Z`, SHA-256 OK.
  - [41781901181](https://github.com/Third-Code-Solutions/ERP/actions/runs/41781901181): guarded `20261104055626_revoke_client_table_writes`, dump
    `20261104T055240Z`. `data.sql` 10,600,443 B, `schema.sql` 1,276,436 B,
    `roles.sql` 297 B, SHA-256 OK. `schema.sql` holds the pre-migration ACL
    snapshot (508 grants to `authenticated`, 214 column-level).
  - Plaintext was shredded after verification; the encrypted artifacts are kept in
    `backups/` (gitignored, plus `.git/info/exclude`).
- Backup key: private key at `~/.erp-backup/operator.key` on the operator machine
  (ACL: operator read-only, fixed 2026-11-04 after an empty DACL blocked decrypt);
  public key pinned as `production` variable `PRODUCTION_BACKUP_PUBLIC_KEY`.

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
- **SEC-01/02 residuals (accepted):**
  - `supabase_admin`'s default ACL in public still grants client DML on tables it
    creates. No such table exists today (PR #134 preflight comment: 0 public
    relations not owned by postgres). This is **unmonitored in production**:
    the CI repro verifier checks only the postgres default ACL
    (`scripts/verify-database-repro.mjs:1819`). Re-run the parity-plan preflight
    query after any Supabase-side schema change.
  - Default sequence grants (`rwU`) to `authenticated` remain; not reachable
    through PostgREST.
  - Tenant write RLS policies are now unreachable; drop them in a contract release,
    keeping RLS enabled and the SELECT policies in place.
  - Accepted by the agent under the 2026-11-04 owner mandate; re-check at that
    contract release.
- **Parity plan snapshot** (`docs/operations/managed-supabase-parity-plan.json`)
  dates from 2026-08-22; refresh it from the read-only ledger.
- **#130 deferred nits:** optimistic-predicate assertion, `router.refresh` after a
  conflict, approve buttons shown to the creator, legacy PM/commercial approvals
  without a status predicate, `createOpportunitySchema` and PPRF GP minimum.
- **#131 deferred:**
  - failure artifact upload (traces hold tokens);
  - PreToolUse push hook;
  - read-only backup DB role;
  - Windows credential paths in the deny list;
  - E2E secrets are repo-level.
- **Owner/admin "Team tasks" view:** needs an explicit change to the daily-task contract
  verifier and its tests, and a `created_by` column so assignees see who assigned a task.

## Done modules
| Slug | PR/branch | Flag | Date |
|---|---|---|---|

## Blockers / decisions needed
- **Production promotion: rotate `RAILWAY_API_TOKEN` (owner action).** The
  `production` environment secret (last set 2026-08-15) is rejected by Railway CLI
  5.28.0 as unauthorized.
  - The agent may not set secrets.
  - A Railway account or team token with access to project
    `a21fd382-80b2-4218-8025-11f420a062e3` is needed.
  - Web stays on `04b3ac5a` (Next.js 15.5.25 locked) until the promotion runs. That
    version is affected by GHSA-2464-fhr4-w9xw (image optimizer SVG RCE) and
    GHSA-p3m5-59mp-jv5r (Server Actions DoS). Its `next.config.ts` sets no
    `dangerouslyAllowSVG` and no `remotePatterns`, the same mitigating setup the
    security baseline found; the DoS has no config mitigation.
- **Railway auto-deploy (owner decision):** keep or disable the GitHub integration
  that deploys the API on push to `main` outside the promotion gates (see
  Production facts).
  - An out-of-band Vercel deploy was not attempted: the Vercel MCP account gets 403
    on project env, and bypassing the workflow would skip its release gates.
- **Licensing (gates Phase D and mandate PHASE 2):** the module loop clean-room reverse-engineers
  OpenConstructionERP, which is AGPL-3.0, into closed SaaS. The package README says a
  lawyer must confirm this. It falls under the owner's stop rule, so the owner must
  confirm before `oce-recon` touches OCE.

## Log
| Date | Mode | Result |
|---|---|---|
| 2026-11-04 | prod config | Set `ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API=true` + `_TENANT_IDS=<buildops-e2e>` in Vercel production (owner approved); applies on the next prod deploy |
| 2026-11-04 | baseline | Phase A: P0 0 · 4 P1 code + 6 security High. Security auditor verdict BLOCK (SEC-01..06) |
| 2026-11-04 | merge | PR #129 squash-merged `a2313a47` (deps + Next RCE + zod compensating controls) |
| 2026-11-04 | merge | #128 `c2d075ad`, #125 `2c2576cb`, #130 `198e026c`, #131 `e083c485`, #132 `a5c3cd6a` |
| 2026-11-04 | incident | Promotion blocked: Railway token unauthorized (runs 41772426127, 41779917439). Owner rotation needed |
| 2026-11-04 | prod migration | `20261104055626_revoke_client_table_writes` applied after backup 41781901181; smoke 41782320759 green; PR #134 merged `5d56f63d` |
