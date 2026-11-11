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
- Live code (2026-11-05, manual promotion; GitHub Actions is blocked by the org's spending limit):
  - **DB**: ledger 180, head `20261104195001`. The two D-5 migrations were applied
    on 2026-11-04 through Supabase MCP `apply_migration` (stamps `20261104194934`,
    `20261104195001`) after an encrypted targeted snapshot in
    `backups/20261104T194753Z` (decrypt verified). Post-apply: 0 null
    `quantity_decimal`, BOM line totals unchanged at 2,609,885,000 centavos, and the
    repo and production version sets match. #142 has no migration.
  - **Web (Vercel)**: `f212c9df` (`/api/health` and `/api/ready` revision
    `f212c9dffb47`). The steps were the same as `deploy-production.yml`: Vercel CLI
    54.7.1 run from a clean checkout of `main`, `APP_REVISION` set to the SHA, then
    `deploy --prod` (deployment `thirdcode-31jl07njo`). Rollback target:
    `thirdcode-e38eo3kec` (`8293f798`). Everything through #142 is live.
  - **API (Railway)**: Railway's auto-deploy `e2acdd8f` at `f212c9df` is SUCCESS
    (`aa79f2b7` at `c45bc64c` before it). **CAD**: no change since `8293f798`
    (`apps/workers/dxf-parser` untouched). API `/health`, API `/ready` and CAD
    `/health` return 200.
  - Checks run instead of the workflow: `verify-production-surface.mjs` PASS; an
    unauthenticated route sweep (protected routes redirect to `/auth/login`); no
    Vercel runtime errors after the deploy; API logs show only the known `punycode`
    warning; 0 `tax_profiles` rows (default rates, no amount moves).
  - **Not run:** `smoke-prod.yml` and the release E2E suites. Their credentials are
    GitHub secrets only. Run both as soon as Actions is unblocked.
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
    Six defect IDs in five items, **all live** (#138 `d2d3ce6f`, #139 `8293f798`,
    #141 `c45bc64c`):
    1. D-5: fractional BOQ quantity via expand/contract, per the additive-only policy
       above. Add a `numeric(18,4)` column, backfill it, then switch readers and writers.
       Drop the integer column in a later contract release. Fixed in #141 (expand step;
       a sync trigger keeps the legacy integer `quantity` mirrored).
    2. D-8: BIR 2307 payor/payee reversed. Fixed in #138.
    3. D-4 (part): PO header must foot to its lines; the rate-card path must price at the
       rate card. The VAT-on-H part of D-4 shares D-2's root cause and is deferred with it (Q1).
       Fixed in #139 (leaf rows only, header = Σ lines created, rate-card picker checks
       price > 0, dates, vendor, unit).
    4. D-6 guard: cumulative billing ≤ 100%. DP recoupment is deferred (Q4, below).
       Fixed in #138 (cap checked under the project lock on the API and legacy web paths).
    5. D-14 + D-15: half-up DP rounding; one decimal-string percent parser. Fixed in #138.
- Deferred P1 items (with reason): waiting on the owner's money-policy answers (see
  Blockers). The PRD makes these business policy, so the agent will not guess them:
  - D-1 cost vs sell on DUPA lines (Q1, Q2);
  - D-2 VAT inside H plus VAT on the invoice, and the same on PO lines (D-4 VAT-on-H part) (Q1);
  - D-3 budget baseline basis (Q2);
  - D-10 open-line forecast = max(budget, committed, actual). It must follow D-3: today's
    budget baseline includes profit and VAT, so the new forecast would push projected GP
    to zero or below (Q2). A builder was stopped for this reason in review round 2;
  - D-6 DP recoupment only; the cap is in batch item 4 (Q4);
  - D-7 VAT/EWT on retention (Q3; conflicts with PRD A13);
  - D-9 PO EWT 1%/2% and non-VAT suppliers (Q7; PRD A13 and
    WO-15 say carry forward);
  - D-11 DP invoice tax (Q4);
  - D-12 Togal 30% markup (Q9).
- D-13 (hard-coded retention): the `tenancy` module only replaces the constant with the
  tenant's `tax_profiles.retention_rate_bps`, defaulting to today's 10%. The rate is
  read-only until Q3 is answered, so the tax rates cannot change before then. (Batch items
  3 and 5 do change amounts: PO line prices, and DP and preview rounding by centavos.)
  Contract-level retention waits for `contracts` and Q3.
  Merged in #142 `f212c9df` and live on 2026-11-05; evidence in
  [`reports/tenancy.md`](reports/tenancy.md). `ERP_TENANCY_ENABLED` stays **off**:
  flags go on only after smoke passes, and smoke cannot run yet.
- Accepted risk: no environment protection or branch protection (plan blocks it);
  see `docs/erp/RUNBOOK.md` section 5.

## Current
### In flight (2026-11-11)
Owner order of 2026-11-05: import and export estimates in Excel, mirror every piece of
ERP data into Cortex, and a master construction price catalogue. Cortex coverage ships
in batches: batches 0-1 are #147; deal management (sales) is batch 2 and not started.
Owner order of 2026-11-11: deploy only what is green on CI and proven working.
**Nothing below is merged or live.** CI cannot run (Actions billing, see Blockers), so
no PR here can pass the merge gate yet.

| Work | Branch / PR | State |
|---|---|---|
| BOQ Excel import and export (`boq-export`) | `feat/erp-boq-excel`, #144 | **With the owner: three fix loops used.** Round 4: security FAIL, code REQUEST_CHANGES. The security reviewer found a crafted sheet that slips past the guard and sends ExcelJS into a builtin loop that `Worker.terminate()` cannot stop. The `terminate()` behaviour was reproduced with a minimal worker on Node 22.23.2: the thread kept a full core after `terminate()`, and `process.exit` hung. The crafted-sheet path itself is the reviewer's finding. Also open: a concurrency-slot leak when a worker fails to start, TOTAL and VAT rows priced as lump sums, untested units, a nested `[VENDOR:` forgery, and three repo gates that fail when run locally (`test:type-safety`, `test:wo-08-contract`, `test:wo-08a-contract`). The PR proposes another fix loop (its comment calls it the 5th): parse in a child process killed with SIGKILL, scan row attributes linearly, and audit every index ExcelJS allocates from. Spec `docs/erp/specs/boq-excel.md` |
| Catalogue research data, 20 trades | `feat/erp-catalogue-data`, #146 | 1,008 items: 708 priced, 300 blank and flagged `NO_SOURCE`. Security PASS; data review not approved after 3 loops (open list on the PR). Waits on the owner's licensing answers |
| Catalogue table, seed, pages, admin edit (`cost-db` extension) | `feat/erp-catalogue`, #149 (base `feat/erp-boq-excel`; carries #146's data) | Round 4: security PASS, code APPROVE, UI check pass. Three fix loops used; low follow-ups are on the PR. Proven on a local Postgres rebuilt from `ac252c52`: verifier 181 migrations; seed 1,008 items, then 0 on a rerun; catalogue DB tests 10/10, 15/15 and 8/8; database suite 112 files / 559 tests. Lands after #144 and #146, with a rebase and a fresh review then. The supplier Excel import is not built (spec §6 says so). Flag `ERP_CATALOGUE_ENABLED`, default off. Spec `docs/erp/specs/catalogue.md` |
| Cortex coverage, batches 0-1 | `feat/erp-cortex-coverage`, #147 | Round 4: security PASS, code APPROVE. Three fix loops used; one should-fix test gap and the lows are on the PR. Rerun by the orchestrator on a rebuilt database: verifier 183 migrations, database suite 111 files / 576 tests, API integration 94 files / 526 passed / 2 skipped (one failure in the first run was not captured; two reruns were clean), web DB workflows pass (the account-actions test only on a disposable copy, which its guard requires). In one local measurement a `cost_codes` update took 1.64 ms with the mirror against 0.28 ms without it. Ready to merge once CI runs green. Spec `docs/erp/specs/cortex-coverage.md`, runbook `docs/runbooks/cortex-substrate.md` |

Rules decided for this work:
- Catalogue current price: the newest priced observation for the item and region
  (regions compare as `lower(trim(region))`; ties go to the newer `created_at`, then
  the higher `id`). An observation with no price is shown only when the item has no
  priced one there.
- **Do not seed the production catalogue before the owner answers the #146 licensing
  questions.** Price rows are append-only by design and cannot be deleted once loaded.
- After seeding a tenant, run `ANALYZE` on both catalogue tables. Locally a list page took
  73 ms right after seeding and 5 ms after `ANALYZE`; for a tenant the statistics did
  not describe at all, 1 to 2 s per request.
- Cortex rollout follows the runbook: a production backup, the migrations, a backfill
  dry-run, then page size 50 off-peak, then the scrub until every table reports changed 0
  and skipped 0. The runbook does not yet cover #147 security LOW-1: pause the embed jobs
  during the backfill and scrub, or null those nodes' embeddings after the last scrub.

Live exposures found during this work. None is fixed in production:
1. **`audit_log` is readable by every signed-in user of a tenant through the Supabase
   client.** Its only SELECT policy checks the tenant, `authenticated` holds SELECT, and
   the `audit.read` capability is enforced only in server code. Insert and delete
   audit rows hold full row images and update rows a column diff (vendor contacts,
   budgets, stock movements). No browser code reads `audit_log`; `anon` already has no
   access. The fix revokes
   client SELECT, adds a deny policy and forces RLS behind a BYPASSRLS guard. It is in
   #147, reviewed and waiting on CI.
2. **Spreadsheet parsing on `main` runs ExcelJS on the request thread with no guard
   beyond the 25 MB cap.** Any user with `bom.generate` can upload a small crafted
   `.xlsx` to the takeoff import that holds a web function at full CPU until the
   platform timeout, or exhausts its heap. This is the #144 security reviews' finding
   and was not reproduced against `main`. There is no switch to turn the import off.
   #144 as pushed does not close it; the planned next fix loop is meant to.
3. **Cortex nodes of deleted rows keep their old attributes**, including vendor email,
   phone and address that every tenant role can query. The scrub in #147 fixes this once
   it is run.

Owner mandate PHASE 1 (init: green baseline, CI merge gate, `smoke:prod`, STATE,
RUNBOOK) is **done**.
- Latest promotion (2026-11-05, manual, owner order "MERGE EVERYTHING AND DEPLOY ON
  LIVE PRODUCTION"): `f212c9df` (#141 D-5, #142 tenancy) is live; see Live code above.
  The promotion before it, [41820543052](https://github.com/Third-Code-Solutions/ERP/actions/runs/41820543052), put `8293f798` (#138, #139) live,
  and smoke 41823866906 passed. The next bullet is the earlier PHASE 1 promotion.
- Promotion [41792158962](https://github.com/Third-Code-Solutions/ERP/actions/runs/41792158962) of `b9c9d9b4` succeeded after the owner
  rotated `RAILWAY_API_TOKEN` (2026-11-04 07:24Z). Its release gates and production
  E2E suites passed, and `smoke-prod.yml` [41796012425](https://github.com/Third-Code-Solutions/ERP/actions/runs/41796012425) passed
  afterwards.
- The daily-task completion flag (`ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API`,
  `buildops-e2e` tenant only) went live with this deploy.
- Mandate PHASE 2 (`next --auto` through Wave 2) **started 2026-11-04**. Phase D is
  done. Hardening batch 2 is live, and so is `tenancy`. Next modules in gap-report order:
  `approvals` → `contacts` → `cost-db` → `assemblies` → `boq` → `contracts`.
- `tenancy` (D-13) is live (#142). Ship check Q-TEN-6, re-run in production at release:
  0 `tax_profiles` rows and 0 `tax_statutory_outputs` tenant flag rows. Its third part is
  still open: check, by name only, that `ERP_ROADMAP_TAX_STATUTORY_OUTPUTS_ENABLED` is not
  set on the Railway API. `/settings/tax` stays
  behind `ERP_TENANCY_ENABLED` (off). New defect D-16 is in `BACKLOG.md`.
- **CI not run on #141, #142 or `main` since `5d223726`.** The org's Actions spending
  limit blocks every workflow (CI, backup, promotion, smoke). The owner overrode the
  CI-green gate ("MERGE EVERYTHING AND DEPLOY ON LIVE PRODUCTION"), so local gates
  stood in. On the final tree: typecheck clean (api, web, shared-types, database);
  unit tests api 1624, web 2876 (6 skipped), shared-types 729, database 333; the
  reviewers' container runs were DB 544/544 and integration 6/6.

- Merged 2026-11-04 (all CI green, security PASS, review APPROVE posted on the PR):
  - #128 `c2d075ad`: tasks generation and task page.
  - #125 `2c2576cb`.
  - #130 `198e026c`.
  - #131 `e083c485`: swarm, RUNBOOK, smoke, backup.
  - #132 `a5c3cd6a`: Railway CLI failure labels, fail fast on bad credentials.
  - #134 `5d56f63d`: SEC-01/02.
  - #135 `b9c9d9b4`, #136 `1e6fc387`, #137 `8ab55740`: docs (STATE, Phase D).
    #137 needed 4 review fix loops (max is 3). This was accepted because it is docs
    only and each round's findings were narrower; the PR comment says so.
  - #138 `d2d3ce6f`: billing cap, BIR 2307 parties and print gate, half-up DP, exact
    percent parsing (batch 2 items 2, 4, 5).
  - #139 `8293f798`: PO-from-BOM footing and rate-card pricing (batch 2 item 3).
  - #140 `5d223726`: docs (batch 2 STATE).
- Merged 2026-11-04/05 under the owner override (CI red only from the Actions billing
  block; security PASS, review APPROVE and a local-gate evidence comment on each PR):
  - #141 `c45bc64c`: D-5 fractional BOQ quantity (batch 2 item 1).
  - #142 `f212c9df`: `tenancy` (D-13), tax rates from the tenant tax profile.
  - Incident (closed): deleting #141's head branch after its merge **closed** #142,
    which was stacked on it (GitHub does not retarget). It was fixed by re-pushing the
    branch, reopening #142 and retargeting it to `main`. Rule: retarget stacked PRs
    before deleting their base branch.
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
- **Batch 2 follow-ups (#138/#139 reviews, non-blocking):**
  - Budget grain: material PO lines keep their own `bom_line_item_id`, but budget lines
    are top-level only. The WO-15 block-mode trigger fails closed and cost-control CTEs
    misattribute those lines. Fix with `parent_line_item_id` at the budget grain.
  - Legacy web `createInvoice` still accepts a superseded approved BOM.
  - The progress-invoice amount chain (`progressBillingAmount` → `computeRetention` →
    `computeVAT`/`computeEWT` → net) is duplicated in `customer-invoice-draft-create.service.ts`,
    web `procurement/actions.ts` `createInvoice` and `invoice-preview.ts`; consolidate it.
  - Replace `parseDownPaymentBps` with `parsePercentToBps`.
  - Bound the rate-card `FOR SHARE` read with `inArray(code)`.
  - Web test mocks don't pin SQL predicates; add tests for `BOM_NO_LINES` and overflow.
  - A unit-vocabulary mismatch (`pc` vs `pcs`) skips the rate card with no message;
    the rate-card writer still accepts a price of 0.
  - BIR 2307 print lacks the client TIN, the ATC and the payee (tenant) address, and shows
    the month, not the quarter. The client address is the billing address, not the
    BIR-registered one.
  - D-15 error text "Billing % must be between 1 and 100" (`billing/actions.ts`,
    `bom-builder.tsx`) contradicts the accepted 0.01 minimum; align it with the legacy
    "between 0.01% and 100%".
  - The DP award insert takes no project lock (Low).
- **Release gaps from the manual promotion (do first once Actions is unblocked):**
  re-run CI on `main` (`f212c9df`), run `smoke-prod.yml` and the release E2E suites,
  then decide on `ERP_TENANCY_ENABLED`. Finish Q-TEN-6: confirm, by name only, that
  `ERP_ROADMAP_TAX_STATUTORY_OUTPUTS_ENABLED` is not set on the Railway API. Also take a full `backup-production.yml`
  dump: D-5 had only the targeted snapshot. After the Team upgrade, turn on branch
  protection.
- **#141 review follow-ups (Low / display):**
  - No DB CHECK keeps `quantity_decimal` non-negative (the app layer enforces it).
  - The backfill held an exclusive lock and wrote one audit row per line (8 rows in
    production, so no impact).
  - The RFQ quantity uses `toLocaleString('en-PH')` (max 3 dp): 0.0001 shows as "0" and
    12.3456 as "12.346". Use `formatBoqQuantity`.
  - The sync trigger takes the integer branch when an UPDATE changes `quantity` and
    sets `quantity_decimal` to its current value, so the decimal is overwritten. No caller
    does this today. Note it in the function comment and the contract-release plan.
- **#142 review follow-ups (Low):**
  - The billing page, the PO list and the portal call `resolveTaxRates` without catching
    `TaxProfileOverlapError`, so an overlap from legacy data would take the whole page
    down. Catch it and show the conflict notice.
  - `formatBps(retention_bps)` throws outside 0..10000, and `invoices.retention_bps`
    has no CHECK. Add the CHECK, or fall back in the label.
- **Tooling:** the `lint` script fails on a pnpm 11 vs 10.33 mismatch (run eslint
  directly); local runs need Node 22 (Node 24 fails the engines check).
- **Owner/admin "Team tasks" view:** needs an explicit change to the daily-task contract
  verifier and its tests, and a `created_by` column so assignees see who assigned a task.
- **Cortex embed race (predates #147):** the API embed job's `succeed()` checks only that
  the node is open and its embedding is null, and `setCortexNodeEmbedding` (behind
  `/api/cortex/embed`) overwrites with no check. Either way a vector computed from an old
  title can land after a re-title or scrub. Make both compare `recorded_at` or a title
  hash.
- **Catalogue follow-ups (#149, apply at the rebase):** the literal offboarding SQL
  block, a cap on regions per item, the history `id` tiebreak, and the wording of the
  pinned row.
- **Cortex follow-ups (#147):** a scrub test on opportunities and folds, a test that each
  `audit_*` trigger sorts before `cortex_mirror_r`, an exact empty-`search_path`
  check, tenant predicates on the scrub's re-read, SQL page-size defaults of 50, and a
  lower `MAX_PAGE_SIZE` (now 2000; the round 4 security review suggests 500).

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
  - Q-TEN-8 (advisory, ties to Q1): the portal BOM summary shows TCV + VAT on full
    TCV − retention on full TCV, with no EWT. Keep it, or align it with the invoice
    formula once Q1 and Q3 are answered?
- **#144, owner:** approve another fix loop (the plan is on the PR) or take the PR
  over. A stop-gap on `main` for exposure 2 (for example, refusing `.xlsx` at the takeoff
  route until #144 lands) is a third option. Until #144 lands, #149 cannot merge.
- **`audit_log` early apply, owner:** apply #147's `audit_log` migration
  (`20261106102000`) to production before CI is restored, under the owner override,
  or wait for CI? It is the third of #147's three migrations; the question is whether
  to apply it alone. Applied alone, production history goes out of order, and the
  release planner (`scripts/plan-database-release.mjs`) then fails the production
  promotion's ledger gate (`deploy-production.yml`). Applying needs a backup and the runbook preflight first: if the API
  or web runtime role is neither superuser nor BYPASSRLS, every direct audit insert would
  fail. It takes an ACCESS EXCLUSIVE lock on `audit_log` briefly. Waiting keeps
  exposure 1 live.
- **SEC-M7, owner:** five Cortex mirror functions covering 11 finance, cash, bank and
  inventory tables still copy rows by denylist, without redaction. This needs an owner and a date.
- **Catalogue data (#146), owner:** keep or remove about 100 rows priced from
  theprojectestimate.com purchase lists? May 165 rows read from Wilcon's online store
  be used (its terms of use are unchecked)? Is it acceptable that 121 rows rest on AEDO
  cost guides, 13 of them on one labour article? The data-quality open list is on the PR.
- **GitHub Actions blocked (owner):** the Third-Code-Solutions org is on the free plan
  and hit its Actions spending limit. The owner chose the Team upgrade, but it is not
  applied yet. Until then, CI, backups, promotion and smoke cannot run, and releases
  need the owner override.
- PH rates in the survey (2% EWT, 10% retention, 0.1%/day LDs, PCAB ranges) come from
  secondary sources. Check them against primary BIR, GPPB and PCAB texts before they
  become rules.

## Log
| Date | Mode | Result |
|---|---|---|
| 2026-11-11 | build | #146 data review rounds 3-4, to the owner (3-loop limit). #144 rounds 2-4 and fix loops 2-3; round 4: security FAIL (a worker that cannot be terminated) and code REQUEST_CHANGES, to the owner. #147 rounds 1-4 and fix loops 1-3, final round: security PASS, code APPROVE. #149 opened; rounds 1-4 and fix loops 1-3, final round: security PASS, code APPROVE, UI pass. Database suites rerun on rebuilt local databases; actionlint fails only on local Windows; `supabase db diff` was not run. A machine shutdown (Windows event 1074, 16:26 local time) stopped two agents; work resumed from their commits. Nothing deployed: Actions still blocked |
| 2026-11-10 | build | #146 catalogue data opened; data review rounds 1-2 and fixes |
| 2026-11-05 | promote | Manual (Actions blocked): web `f212c9df` via Vercel CLI, API auto-deploy `e2acdd8f`; health, revision, surface PASS; smoke not run (secrets in GitHub only) |
| 2026-11-05 | merge | #142 `f212c9df` tenancy (D-13), owner override of the CI gate; Q-TEN-6 re-checked (0 profiles, 0 gates) |
| 2026-11-05 | incident | Deleting #141's branch closed stacked #142; reopened and retargeted to `main`. No code impact |
| 2026-11-05 | build | `tenancy` (D-13) on `feat/erp-tenancy`: 13 commits, no amount moved, gates in `reports/tenancy.md`; not merged |
| 2026-11-04 | merge | #141 `c45bc64c` D-5, owner override of the CI gate (Actions spending limit) |
| 2026-11-04 | prod migration | D-5 `20261104194934`, `20261104195001` applied (ledger 180) after targeted encrypted snapshot `20261104T194753Z` |
| 2026-11-04 | blocker | GitHub Actions blocked by the org spending limit; owner chose the Team upgrade (not applied yet) |
| 2026-11-04 | promote | `8293f798` web live (run 41820543052; API/CAD retained-identical); smoke 41823866906 green |
| 2026-11-04 | merge | #138 `d2d3ce6f` (D-6 cap, D-8, D-14, D-15), #139 `8293f798` (D-4 part); D-10 builder stopped (needs D-3/Q2) |
| 2026-11-04 | merge | #137 `8ab55740` Phase D docs (4 fix loops, accepted as docs-only) |
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
