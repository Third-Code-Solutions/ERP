# ERP swarm state

Read first, update last, every run.

## Operating mandate (2026-11-04)
Owner granted end-to-end autonomy: review, merge, deploy to production, roll back.
This overrides `erp-swarm` non-negotiable #4 ("never deploy / never touch production")
for this program only. Hard rules still apply: no force-push, no commits to `main`,
no reading/printing secrets, no deleting production data, no disabling CI or skipping
tests. Stop for: destructive migration on production data, production broken after a
rollback, a new paid service, a legal/licensing question.

Licensing decision (owner, 2026-11-04: "continue to phase 2"): clean-room is approved in
its strictest form. `oce-recon` reads only OCE's public descriptive material (site,
playbooks, docs, release notes, repo README/changelog). It never opens OCE source code,
and it copies no OCE names, strings or data. The CWICR cost data is CC BY-NC 4.0, so it
is never imported (`docs/erp/oce/survey.md`). Not legal advice: get a lawyer's
confirmation before selling.

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
  promotion's gates run. PR CI and the merge gate still apply. **Owner decision
  (2026-11-04): keep it.** The promotion workflow remains the gated path for web
  and the release E2E.
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
- Live code (2026-11-04, after promotion [41792158962](https://github.com/Third-Code-Solutions/ERP/actions/runs/41792158962)):
  - **DB**: ledger 178, head `20261104055626`.
  - **Web (Vercel)**: `b9c9d9b4` (`/api/health` and `/api/ready` revision
    `b9c9d9b43220`). The Next.js 15.5.28 patch (#129), #128, #130 and #134 are live.
  - **API and CAD worker (Railway)**: the same run verified both as
    `retained-identical` (watched inputs unchanged; active deployments `edfd4065`
    for the API at `5d56f63d` and `dcf4a7fa` for CAD); both health checks return 200.
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
- Phase D done 2026-11-04:
  - Survey: `docs/erp/oce/survey.md` (63 rows, 18 new, including PH compliance).
  - Gap analysis: `docs/erp/reports/01-gap-analysis.md` (15 exists, 19 partial,
    3 missing, 8 defer).
  - `BACKLOG.md` statuses are now set.
- Phase D money defects D-1..D-15 (gap report section 2). Production exposure
  (read-only count, 2026-11-04): 0 DUPAs, 3 BOMs, 3 invoices and 1 PO, all in one
  tenant. No real customer money is affected, so no data correction is needed.
  - **Hardening batch 2 (fix before modules; the rule is clear and consistent with the PRD).**
    Six defect IDs in five items:
    1. D-5: fractional BOQ quantity via expand/contract, per the additive-only policy
       above. Add a `numeric(18,4)` column, backfill it, then switch readers and writers.
       Drop the integer column in a later contract release.
    2. D-8: BIR 2307 payor/payee reversed.
    3. D-4 (part): PO header must foot to its lines; the rate-card path must price at the
       rate card. The VAT-on-H part of D-4 is deferred with D-9 (Q7).
    4. D-6 guard: cumulative billing ≤ 100%. DP recoupment is deferred (Q4, below).
    5. D-14 + D-15: half-up DP rounding; one decimal-string percent parser.
- Deferred P1 items (with reason): waiting on the owner's money-policy answers (see
  Blockers). The PRD makes these business policy, so the agent will not guess them:
  - D-1 cost vs sell on DUPA lines (Q1, Q2);
  - D-2 VAT inside H plus VAT on the invoice (Q1);
  - D-3 budget baseline basis (Q2);
  - D-10 open-line forecast = max(budget, committed, actual). It must follow D-3: today's
    budget baseline includes profit and VAT, so the new forecast would push projected GP
    to zero or below (Q2). A builder was stopped for this reason in review round 2;
  - D-6 DP recoupment only; the cap is in batch item 4 (Q4);
  - D-7 VAT/EWT on retention (Q3; conflicts with PRD A13);
  - D-9 PO EWT 1%/2% and non-VAT suppliers, plus the D-4 VAT-on-H part (Q7; PRD A13 and
    WO-15 say carry forward);
  - D-11 DP invoice tax (Q4);
  - D-12 Togal 30% markup (Q9).
- D-13 (hard-coded retention): the `tenancy` module only replaces the constant with the
  tenant's `tax_profiles.retention_rate_bps`, defaulting to today's 10%, so behaviour is
  unchanged until a tenant edits it. Contract-level retention waits for `contracts` and Q3.
- Accepted risk: no environment protection or branch protection (plan blocks it);
  see `docs/erp/RUNBOOK.md` section 5.

## Current
Owner mandate PHASE 1 (init: green baseline, CI merge gate, `smoke:prod`, STATE,
RUNBOOK) is **done**.
- Promotion [41792158962](https://github.com/Third-Code-Solutions/ERP/actions/runs/41792158962) of `b9c9d9b4` succeeded after the owner
  rotated `RAILWAY_API_TOKEN` (2026-11-04 07:24Z). Its release gates and production
  E2E suites passed, and `smoke-prod.yml` [41796012425](https://github.com/Third-Code-Solutions/ERP/actions/runs/41796012425) passed
  afterwards.
- The daily-task completion flag (`ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API`,
  `buildops-e2e` tenant only) went live with this deploy.
- Mandate PHASE 2 (`next --auto` through Wave 2) **started 2026-11-04**. Phase D is
  done. Next: hardening batch 2 (items 1–5 above), then modules in gap-report order:
  `tenancy` → `approvals` → `contacts` → `cost-db` → `assemblies` → `boq` → `contracts`.

- Merged 2026-11-04 (all CI green, security PASS, review APPROVE posted on the PR):
  - #128 `c2d075ad`: tasks generation and task page.
  - #125 `2c2576cb`.
  - #130 `198e026c`.
  - #131 `e083c485`: swarm, RUNBOOK, smoke, backup.
  - #132 `a5c3cd6a`: Railway CLI failure labels, fail fast on bad credentials.
  - #134 `5d56f63d`: SEC-01/02.
- Earlier promotion runs 41772426127 (2 attempts, #129) and 41779917439 (`a5c3cd6a`)
  failed at "Deploy Nest API to exact Railway service" (resolved by the token
  rotation). The last says:
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
- **Money-policy answers (owner/Finance; non-blocking: affected items are deferred and
  the loop continues).** Full text is in gap report section 4.
  - Q1: Is the contract sum VAT-inclusive? (ABI's DUPA puts 12% VAT inside H.)
  - Q2: Is the allowable budget D, D + OCM, or TCV − margin?
  - Q3: When are VAT and EWT due on retention, and what are the release terms?
  - Q4: What are the DP %, its VAT treatment and the recoupment method?
  - Q5: Is billing by % per BOQ item or by milestone?
  - Q6: Do we have government or zero-rated clients?
  - Q7: Is ABI a Top Withholding Agent? Which suppliers are non-VAT?
  - Q8: Does a signed VO revise the contract sum and budget?
  - Q9: Can the Togal 30% markup be retired?
  - Q10: Are a Filipino UI and a public API needed for MVP?
- PH rates in the survey (2% EWT, 10% retention, 0.1%/day LDs, PCAB ranges) come from
  secondary sources. Check them against primary BIR, GPPB and PCAB texts before they
  become rules.

## Log
| Date | Mode | Result |
|---|---|---|
| 2026-11-04 | decision | Owner: "continue to phase 2" → clean-room approved, strict mode (public material only) |
| 2026-11-04 | phase D | Survey (63 rows) + gap analysis (15/19/3/8); 15 money defects: 6 IDs in 5 batch-2 items (D-4 part, D-6 cap only), the rest deferred to owner Q1–Q10 (D-10 behind D-3) |
| 2026-11-04 | prod config | Set `ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API=true` + `_TENANT_IDS=<buildops-e2e>` in Vercel production (owner approved); applies on the next prod deploy |
| 2026-11-04 | baseline | Phase A: P0 0 · 4 P1 code + 6 security High. Security auditor verdict BLOCK (SEC-01..06) |
| 2026-11-04 | merge | PR #129 squash-merged `a2313a47` (deps + Next RCE + zod compensating controls) |
| 2026-11-04 | merge | #128 `c2d075ad`, #125 `2c2576cb`, #130 `198e026c`, #131 `e083c485`, #132 `a5c3cd6a` |
| 2026-11-04 | incident | Promotion blocked: Railway token unauthorized (runs 41772426127, 41779917439). Owner rotation needed |
| 2026-11-04 | decision | Owner keeps Railway GitHub auto-deploy; owner rotated `RAILWAY_API_TOKEN` |
| 2026-11-04 | promote | `b9c9d9b4` live on web, API and CAD (run 41792158962); smoke 41796012425 green; incident closed |
| 2026-11-04 | prod migration | `20261104055626_revoke_client_table_writes` applied after backup 41781901181; smoke 41782320759 green; PR #134 merged `5d56f63d` |
