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
  - 12 empty `abi-ops-demo-*` tenants and 1 isolation-QA tenant. (Recount 2026-11-13: 11 `abi-ops-demo-*`,
    14 tenants in all; see `reports/02-trial-readiness.md` §2.1.)
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
- Live code (web and API 2026-11-15, database 2026-11-04; manual promotions; GitHub Actions is blocked by the org's spending limit):
  - **DB**: ledger 180, head `20261104195001`. The two D-5 migrations were applied
    on 2026-11-04 through Supabase MCP `apply_migration` (stamps `20261104194934`,
    `20261104195001`) after an encrypted targeted snapshot in
    `backups/20261104T194753Z` (decrypt verified). Post-apply: 0 null
    `quantity_decimal`, BOM line totals unchanged at 2,609,885,000 centavos, and the
    repo and production version sets match. #142 has no migration.
  - **Web (Vercel)**: `ad342498` (#161, landing page) since 2026-11-15 (`/api/health` and
    `/api/ready` revision `ad342498b722`; deployment `dpl_Fj7jCsucLEkWqFpjYeU23k5Sa6f2`,
    `thirdcode-modo4bef6`). The steps were those of `deploy-production.yml` without its
    `DATABASE_URL` step: Vercel CLI 54.7.1 run from a clean checkout of `main`,
    `APP_REVISION` set to the SHA, then `deploy --prod`. Rollback target:
    `thirdcode-h9ks0jxwc` (`80a397f0`, D0-1). Never roll web back past D0-1. Everything
    through #161 is live on web. Since `80a397f0` the only runtime change is #161 (the
    public landing page, `three`, and a dev-only `Cache-Control` change in
    `next.config.ts`); there is no new migration.
  - **API (Railway)**: Railway's auto-deploy `6540ce9a` at `ad342498` is SUCCESS
    (2026-11-15; #161's lockfile change triggered it, where the earlier docs and test merges
    were SKIPPED). Since `f212c9df`, `apps/api` and `packages` add only one database test
    file and no migration, so the API runtime code is unchanged. `e2acdd8f` at `f212c9df` was
    the previous one. **CAD**: no change since `8293f798`
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
### Program phase (2026-11-13): v1 feature freeze, then the ABI company trial
Owner order of 2026-11-13: "end the Construction ERP implementation and mark it as ready to launch and
ready for company trial phase." Decision record:
[`reports/02-trial-readiness.md`](reports/02-trial-readiness.md).
- **Implementation is closed.** v1 feature freeze from 2026-11-13. The trial runs `main` at `db4887c0`
  plus two security fixes: SEC-10 (D0-1) and #147 rebased onto `main` (D0-2, D0-3). The mandate PHASE 2
  module queue (`approvals` → `contracts`) and Cortex batch 2 are parked until the trial exits. Merges
  during the trial follow rule R2: trial defects, Day-0 items and GA-gate work.
- **Company trial: GO, conditional.** A supervised ABI pilot (one tenant, up to 10 named users) starts
  only after Day-0 items D0-1..D0-8 are done:
  1. the SEC-10 fix (#156, merged as `e708ba2f`), promoted to web on its own so that, from D0-3 on,
     the web rollback target never predates it. **Done 2026-11-13:** `main` `80a397f0` on
     `thirdcode-h9ks0jxwc` (`dpl_DeBH8PRoz6zjENMT6T3AytGgPZ65`). Web rollback target until D0-3:
     `thirdcode-jzhgfv5c9` (`ddacfb1b`). Deployment Protection: Vercel Authentication, "all except
     custom domains", so every per-deployment URL, the pre-fix ones included, answers 302 to the
     Vercel login, and only `thirdcode-erp.vercel.app` is public;
  2. #147 rebased, with full gates on the combined tree. **Done 2026-11-13** on `cae8c63b` plus the
     docs-only `b92f35fa` (see the Log). Two local exceptions: actionlint cannot unpack on Windows,
     and the account-actions database file rests on its round-4 run on a disposable copy, because
     neither that file nor any migration or schema changed since;
  3. the #147 rollout (closes exposures 1 and 3);
  4. authenticated smoke plus the production cross-tenant spec, which must report passed, not skipped;
  5. the ABI tenant, with public sign-up off, "Confirm email" on, the Auth URL configuration checked and
     a supervised first invite;
  6. a fresh full backup, taken before the #147 rollout;
  7. uptime alerts;
  8. signed operating rules.

  Money outputs run in parallel with ABI's current process (rule R1) until gate G2 is met.
- **Commercial launch (GA): NO-GO** until gates G1–G6 in the report are met.
- Exposure 2 now covers two routes: the takeoff import (ExcelJS) and document intake (SheetJS parses the
  whole workbook). It is accepted for the pilot only once public sign-up is off. Time box: 2026-12-15; if
  a route is still open then, deploy the `.xlsx` stop-gap there.
- Tags: `v1.0.0-rc.1` on the `main` commit that holds D0-1 and #147, once D0-2 passes (#147 merges
  only inside D0-3, straight after its migrations, so the tag comes with D0-3). `v1.0.0-trial`
  once D0-1..D0-8 are recorded here.

### In flight (2026-11-13)
Owner order of 2026-11-05: import and export estimates in Excel, mirror every piece of
ERP data into Cortex, and a master construction price catalogue. Cortex coverage ships
in batches: batches 0-1 are #147; deal management (sales) is batch 2 and not started.
Owner order of 2026-11-11: deploy only what is green on CI and proven working.
**Web serves `main` at `ad342498` since 2026-11-15 (#161 landing page, deployment `dpl_Fj7jCsucLEkWqFpjYeU23k5Sa6f2`; D0-1 `80a397f0` before it). It holds #151 and #152, the SEC-10 fix (#156), its guard (#157) and the landing page (#161). Nothing else below is live.** Merged to `main` since, **not live**: the 2026-11-15 trial-defect batch #163–#169 and the retired-project batch #171–#175 (see the Log; #165 has a deploy precondition in Follow-ups). The API runs `ad342498` (Railway auto-deploy), with the same runtime code as `f212c9df`. CI cannot run (Actions billing, see Blockers), so
no PR here can pass the merge gate yet.

| Work | Branch / PR | State |
|---|---|---|
| BOQ Excel import and export (`boq-export`) | `feat/erp-boq-excel`, #144 | **Fix loop 8 running (2026-11-13).** Round 7 on `f45a0a0a`: security FAIL (0 Critical, 1 High, 1 Medium, 3 Low, 4 Info), code REQUEST_CHANGES (1 blocking, 4 should-fix, 8 nits). The High is in the Excel export, which this PR adds: DUPA rows have no limit, so one export of a BOM with very large DUPAs holds the web thread for tens of seconds (measured through the route with a stubbed loader, not staged through the database). The code blocker is a missing ADR for the reader child process. Also found: fix loop 7's stricter filter refuses a legacy shared workbook (a hand-built fixture), and an imported lump-sum line lands in grain review with no review row, which blocks BOM approval (measured with the database mocked). Fix loop 7 (`2266cabc..f45a0a0a`, 11 commits, after `main` was merged in) fixed the round-6 items for the reviewers' inputs, except code N3 (stale names) and N6 (a `wip` commit in the history), security I-2 and I-3 (open, unchanged) and S6-4 (partly fixed). Orchestrator run on `f45a0a0a`: 39 CI static gates pass and 2 fail only on local Windows (actionlint, one build-ops test); lint and the web and API typechecks pass; the unit suites pass (shared-types 739; web 3,014 with 6 skipped; API 1,622). Database lanes and e2e were not run. Round 6 on `2a79cf7b`: security PASS (0 Critical, 0 High, 2 Medium, 2 Low, 3 Info), code REQUEST_CHANGES (1 blocking, 5 should-fix, 6 nits). The blocking item and both Mediums are one class: a crafted workbook can still hold one of the two reader slots until the 15 s kill, so one user can keep `.xlsx` import answering busy for every tenant on an instance. The child process bounds CPU and memory, and no data is exposed. Round 5 on `db98b8f7`: security FAIL (a small CSV blocked the web event loop; this PR added that parser) and code REQUEST_CHANGES (the first filter missed an index behind a quoted `>`). Fix loop 6 (`db98b8f7..2a79cf7b`, 8 commits) fixed both for the reviewers' inputs and made the import skip and list amount-only rows. The verdicts are on the PR. Fix loop 5 was pushed as `db98b8f7` on owner order (2026-11-12, past the 3-loop limit); loops 6 to 8 continue under the owner's order of the same day to get everything merged and working. Loop 5 commits: the reader is a child process killed with SIGKILL at the wall clock, its concurrency slot freed only once the process is gone or failed to start; the first filter reads every index ExcelJS allocates from (row, cell, column min/max, dimension, merges) without a character window; nested vendor tokens are stripped to a fixpoint; fixes aimed at the WO-08/08A contract gates and the type-safety gate; unit tests for each new takeoff unit; spec D.4 and D.9 updated. One owner decision is open (amount-only TOTAL and VAT rows, see Blockers). Round 4, for the record: security FAIL, code REQUEST_CHANGES. The security reviewer found a crafted sheet that slips past the guard and sends ExcelJS into a builtin loop that `Worker.terminate()` cannot stop. The `terminate()` behaviour was reproduced with a minimal worker on Node 22.23.2: the thread kept a full core after `terminate()`, and `process.exit` hung. The crafted-sheet path itself is the reviewer's finding. Round 4 also found a concurrency-slot leak when a worker fails to start, TOTAL and VAT rows priced as lump sums, untested units, a nested `[VENDOR:` forgery, and three repo gates failing locally (`test:type-safety`, `test:wo-08-contract`, `test:wo-08a-contract`). Loop 5 addressed all of these except the amount-only rows (round 5 then failed on other findings, above); the #150 fact-check ran the three gates on `db98b8f7` and all pass (2/2, 1/1, 2/2). Spec `docs/erp/specs/boq-excel.md` |
| Catalogue research data, 20 trades | `feat/erp-catalogue-data`, #146 | 1,008 items: 708 priced, 300 blank and flagged `NO_SOURCE`. Security PASS; data review not approved after 3 loops (open list on the PR). Waits on the owner's licensing answers |
| Catalogue table, seed, pages, admin edit (`cost-db` extension) | `feat/erp-catalogue`, #149 (base `feat/erp-boq-excel`; carries #146's data) | Round 4: security PASS, code APPROVE, UI check pass. Three fix loops used; low follow-ups are on the PR. Proven on a local Postgres rebuilt from `ac252c52`: verifier 181 migrations; seed 1,008 items, then 0 on a rerun; catalogue DB tests 10/10, 15/15 and 8/8; database suite 112 files / 559 tests. Lands after #144 and #146, with a rebase and a fresh review then. The supplier Excel import is not built (spec §6 says so). Flag `ERP_CATALOGUE_ENABLED`, default off. Spec `docs/erp/specs/catalogue.md` |
| Cortex coverage, batches 0-1 | `feat/erp-cortex-coverage`, #147 | **Ready for D0-3, not merged (it merges straight after its migrations).** Head `b92f35fa`. Round 5 (2026-11-13, on `cae8c63b`, scope: interaction with `main` since `67163c62`, read from code): security PASS (one Info: a disabled provisional user keeps a same-tenant Cortex node), code APPROVE (the runbook should-fix and one nit folded into `b92f35fa`). The PR's own patch is byte-identical to round 4 (same `git patch-id`). D0-2 gates passed on this tree (Log). Round 4: security PASS, code APPROVE. Three fix loops used; one should-fix test gap and the lows are on the PR. Rerun by the orchestrator on a rebuilt database: verifier 183 migrations, database suite 111 files / 576 tests, API integration 94 files / 526 passed / 2 skipped (one failure in the first run was not captured; two reruns were clean), web DB workflows pass (the account-actions test only on a disposable copy, which its guard requires). In one local measurement a `cost_codes` update took 1.64 ms with the mirror against 0.28 ms without it. 2026-11-12: the owner ordered merge plus the production runbook under the CI override. Done so far: a production backup of the Cortex tables into schema `erp_backup_20261112` (`cortex_nodes` 1,463 rows, `cortex_edges` 2,861, plus policy, grant, RLS, trigger and function metadata; RLS on; revoked from `public`, `anon`, `authenticated`). **No migration applied and not merged:** the Supabase MCP `apply_migration` confirmation expired twice with no one at the screen. The backup holds pre-scrub attributes (vendor emails among them); drop it once the runbook is verified. Spec `docs/erp/specs/cortex-coverage.md`, runbook `docs/runbooks/cortex-substrate.md` |
| Tenant-admin invite fix (trial blocker B1) | `fix/erp-tenant-admin-invite`, #151 | B1 is present on `main` by code trace (2026-11-12; not run): Admin → Users → New creates the invitee in a new empty tenant, then the action's own `public.users` insert hits the duplicate key and deletes the Auth user. The fix inserts a `platform_user_invitations` row for the admin's tenant first, so the existing `a_platform_invited_user_provision` trigger writes the only user row. No migration. The two touched web test files pass (41); the full web suite has 1 failure, the aged supplier-matching test that #152 fixes; the new DB test was skipped (no `DATABASE_URL`). Round 1: security PASS (1 suspected Medium: a signup racing the invite can end up active in the tenant; 3 Low), code REQUEST_CHANGES (a failed invite after Auth leaves an `invited` user row that blocks re-invites; the DB tests never ran). Round 2 on `a0bcdea1`, after fix loop 1: security PASS, code APPROVE. **Merged `2822c6ab` under the owner override and live on web since 2026-11-13 (deployed in `ddacfb1b`).** Not yet exercised in production: no invite through it has been verified. Railway holds the API deployment for `2822c6ab` at NEEDS_APPROVAL; #151 changes a web action, its test and a database test, and no API code. Open from round 2 (on the PR): one Medium that needs production to auto-confirm sign-ups, three Lows (a `pending` invitation of any age can bind; the invite sets `email_confirm: true` with a password the admin chooses; the suspension reason can name the wrong cause), and two should-fix items from the code review (no recovery runbook for a disabled email; no database-level test of the disable compensation) |
| Fixed clock for an aged unit test | #152, merged `4e9cd9ed` | The supplier-matching test used the real clock; its August fixture dates crossed the 90-day stale cutoff and it failed on every branch. Test file only. Code APPROVE and security PASS on `8579c58d`; merged under the owner override (no CI). Test file only: no runtime change |

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
- **WO11-01 (Medium, #158 security review, read from code, not run):** the WO-11 writer check
  (`scripts/verify-wo-11-kyc-gate.mjs:273-302`) counts only `.insert`/`.update` on tables
  named-imported from `@third-code-erp/database/schema`. A mounted PPRF or Opportunity action
  could still write through a package-root import (`@third-code-erp/database` re-exports the
  schema), a namespace import, `.delete`, `db.execute(sql...)`, a destructured alias, a helper or
  a callback. No current entry module does. Fix: reject any reachable insert, update, delete,
  execute or transaction call in those actions, with one test-35 fixture per pattern. Until CI
  runs again, add `pnpm test:wo-11-contract` to the local checks before owner-override merges.
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
  - The progress-invoice amount chain (`progressBillingAmount` → `computeRetention` →
    `computeVAT`/`computeEWT` → net) is duplicated in `customer-invoice-draft-create.service.ts`
    and `invoice-preview.ts`; consolidate it. (The legacy web `createInvoice` copy, which
    also billed a superseded BOM, was deleted in #165.)
  - Replace `parseDownPaymentBps` with `parsePercentToBps`.
  - Bound the rate-card `FOR SHARE` read with `inArray(code)`.
  - Web test mocks don't pin SQL predicates; add tests for `BOM_NO_LINES` and overflow.
  - A unit-vocabulary mismatch (`pc` vs `pcs`) skips the rate card with no message.
    Which units are equivalent is an owner/domain decision; not guessed in code. (The
    0-price writer half was fixed in #166.)
  - BIR 2307 print lacks the client TIN, the ATC and the payee (tenant) address, and shows
    the month, not the quarter. The client address is the billing address, not the
    BIR-registered one.
  - The DP award insert takes no project lock (Low).
- **Release gaps from the manual promotion (do first once Actions is unblocked):**
  re-run CI on `main` (now `ddacfb1b`; the 2026-11-13 web promotion has the same gaps),
  run `smoke-prod.yml` and the release E2E suites,
  then decide on `ERP_TENANCY_ENABLED`. Finish Q-TEN-6: confirm, by name only, that
  `ERP_ROADMAP_TAX_STATUTORY_OUTPUTS_ENABLED` is not set on the Railway API. Also take a full `backup-production.yml`
  dump: D-5 had only the targeted snapshot. After the Team upgrade, turn on branch
  protection.
- **#141 review follow-ups (Low / display):**
  - No DB CHECK keeps `quantity_decimal` non-negative (the app layer enforces it).
  - The backfill held an exclusive lock and wrote one audit row per line (8 rows in
    production, so no impact).
  - The sync trigger takes the integer branch when an UPDATE changes `quantity` and
    sets `quantity_decimal` to its current value, so the decimal is overwritten. No caller
    does this today. Note it in the function comment and the contract-release plan.
- **#142 review follow-ups (Low):**
  - The billing page, the PO list and the portal call `resolveTaxRates` without catching
    `TaxProfileOverlapError`, so an overlap from legacy data would take the whole page
    down. Catch it and show the conflict notice.
  - `formatBps(retention_bps)` throws outside 0..10000, and `invoices.retention_bps`
    has no CHECK. Add the CHECK, or fall back in the label.
  - Re-checked 2026-11-15: neither is reachable today (0 `tax_profiles` rows, tax-profile
    writes gated, every invoice writer takes retention from CHECKed 0..10000 rates).
    Deferred behind the trial-defect queue.
- **2026-11-15 trial-defect batch follow-ups (#163–#169, reviews non-blocking):**
  - #165 **deploy precondition**: the BOM builder now bills through Core, behind
    `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED` and its tenant allowlist,
    exactly like the billing page already did. Before promoting, confirm both cover the
    live tenants, or builder invoicing returns 503 "not enabled for this tenant".
  - #165: `award-actions.ts` and `packages/operations/src/signed-bom-award.ts` still write
    invoices directly (predate the batch). `createInvoiceDraft` hand-checks the bps
    instead of `customerInvoiceDraftCreateBodySchema.safeParse`. The dead
    `financeCustomerInvoiceDraftCreateWritesUseCoreApi` and its env-doc rows went in #178;
    `apps/web/.env.example` (lines 102, 189) still lists the two `..._DRAFT_CREATE_WRITES_VIA_API`
    vars (left for the owner: env files are outside the agent's permissions).
  - #163: done in #172 (the BOM readers require a live project and answer empty for a
    malformed id).
  - #164: `takeoff-import-wizard.tsx:177` shows the raw number (no grouping);
    (`project-material-actuals-card.tsx` done in #171);
    `togal-import-wizard.tsx` has no importer (its route returns 410).
  - #166: legacy 0-centavo rate cards may already exist. Clean them up, then add
    `CHECK (unit_price_cents > 0)` (RLS checks only the tenant).
  - #167: the cookie-options literal lives in four places (middleware, callback,
    `packages/auth` server and client); the middleware stale-cookie deletes don't pass
    `secure` (harmless over HTTPS).
  - #169: RFQ coverage (`packages/database/src/procurement/rate-card-coverage.ts`) and the
    two PO card queries (`purchase-order-creation.service.ts`, web `procurement/actions.ts`)
    are three copies of one card query, cross-referenced by comment; extract one loader.
    RFQ quotes `is_group === 0` lines while PO prices `purchasableBomLines`, so a parent
    work item with material children is quoted but never PO'd. An RFQ is built once: a
    card that expires between RFQ and PO creation leaves that line with neither.
- **2026-11-15 retired-project batch follow-ups (#171–#175, reviews non-blocking):**
  - **Owner decision:** signing still awards a retired project. The `runSignedBomAward`
    callers (portal sign actions, Core public signing, the DocuSeal webhook) don't check
    retirement, so a client signature on a retired project's BOM still awards it.
    Refuse, or honour the signature?
  - `liveProjectCondition` takes no project lock (shortcut in
    `packages/database/src/projects/live-project.ts`): a retirement that commits between
    the check and the insert still slips through. Closing it needs one repo-wide lock
    order, project row vs the tenant audit advisory lock. Core PO `create`/`createFromBom`
    and the takeoff import already lock the project before the audit lock, a pre-existing
    deadlock risk against signing, award and opportunity conversion; settle both together.
  - Core RFQ dispatch: done in #179. A 4xx refusal (but 408/429) fails as
    `UnrecoverableError` and is dead-lettered on its first attempt; outages still retry; a
    new request replaces a failed job instead of being deduplicated into it. Left: "every
    line already contracted" (`procurement.service.ts` ~376) is a normal outcome but still
    dead-letters; `NotificationDeliveryProcessor` throws plain `Error` for settled states
    (`notification-delivery.service.ts` ~253, 388, 493, 613, 769, 1101), so each retries 5
    times, and its `onFailed` would skip `markDeadLetter` on an early `UnrecoverableError`.
    `apps/api/tsconfig.json` does not include `integration/`, so those specs are not
    type-checked.
  - PO steps after creation (submit, approve, issue, receive) don't check retirement.
  - Replays after retirement now return 404 instead of the stored result (Togal commit,
    document processing).
  - Document processing (#175): a retirement during the 5th (last) attempt records
    `processing_failed`, not `project_retired`; `status()` still reads a retired project's
    job; an evidence row can be written when a retirement races claim and commit
    (immutable, nothing derived from it); document upload (`createDocumentThroughCoreApi`,
    web `api/upload/complete`) doesn't check retirement (a wasted parse, nothing committed).
  - Tests: the #172–#174 guards are proven by SQL-shape unit tests; only #175 has a
    DB-backed one. Add integration cases for the BOM, RFQ and PO paths.
  - #171: each micros quantity view formats on its own; extract one shared formatter.
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
- **D0-6 full backup, owner (blocks D0-3, the #147 rollout).** The agent has no route to the
  production database URL: the Vercel production variables were refused to it, and the
  GitHub secret is reachable only through `backup-production.yml`, which Actions will not start
  ("recent account payments have failed"). Either: (a) fix GitHub billing, then dispatch
  `Production backup` on `main` and download the encrypted artifact within its 1-day retention;
  or (b) on this workstation, with the session-pooler URL (`:5432`) from the secret manager in
  `DATABASE_EXPORT_URL` and `PG_DUMP_PATH=D:/thirdcode/tools-pg17/pgsql/bin/pg_dump.exe`
  (PostgreSQL 17.12 portable client), run `pnpm plan:database-export` until it reports
  `ready`, then the three dumps and the RSA-OAEP encryption exactly as `backup-production.yml`
  does. Record time, sizes and SHA-256 in the Log. Docker is also available here, so
  `supabase db dump` (the workflow's own tool) works too.
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
- **#144, owner:** the owner ordered fix loop 5 (2026-11-12); loops 6 to 8 followed
  under the same day's order to merge everything. If round 8 still requests changes, the
  owner chooses between another loop and a stop-gap on `main` for exposure 2 (for
  example, refusing `.xlsx` at the takeoff route until #144 lands). Until #144 lands,
  #149 cannot merge.
- **#144 lump-sum units, owner:** an imported line with unit `ls`, `l.s.` or "lump sum"
  is put in grain review, because `lot` is a work-item unit and these are not
  (`packages/shared-types/src/bom/grain.ts`). Fix loop 8 is briefed to make the import
  write the review row, so the line can be resolved. The alternative is the owner's:
  treat lump-sum units as work items, as `lot` is.
- **#147 apply, owner at the screen:** the owner ordered the #147 merge and the runbook
  rollout (2026-11-12). A backup of the Cortex tables is in `erp_backup_20261112`, taken
  2026-11-12. Take a fresh backup, or confirm a fresh restore point, right before the
  apply, as the runbook on the #147 branch requires
  (`docs/runbooks/cortex-substrate.md`). The three migrations go
  through the Supabase connector, whose confirmation prompts expired twice with nobody
  there to approve them. Nothing is applied and #147 is not merged. This replaces the
  earlier question of applying the `audit_log` migration alone. The cautions stand: the
  runbook preflight first (if the API or web runtime role is neither superuser nor
  BYPASSRLS, every direct audit insert would fail); a brief ACCESS EXCLUSIVE lock on
  `audit_log`; and once any #147 migration is in production, the promotion's ledger gate
  (`deploy-production.yml`) fails until #147 is on `main`, so the merge must follow the
  apply directly. Until then exposures 1 and 3 stay live.
- **SEC-M7, owner:** five Cortex mirror functions covering 11 finance, cash, bank and
  inventory tables still copy rows by denylist, without redaction. This needs an owner and a date.
- **Catalogue data (#146), owner:** keep or remove about 100 rows priced from
  theprojectestimate.com purchase lists? May 165 rows read from Wilcon's online store
  be used (its terms of use are unchecked)? Is it acceptable that 121 rows rest on AEDO
  cost guides, 13 of them on one labour article? The data-quality open list is on the PR.
- **GitHub Actions blocked (owner):** the Third-Code-Solutions org is on the free plan
  and hit its Actions spending limit. The owner chose the Team upgrade, but it is not
  applied yet. Until then, CI, backups, promotion and smoke cannot run, and releases
  need the owner override. Still blocked on 2026-11-12: main CI run 43238226184 on
  `999d558c` refused the Actionlint job with "recent account payments have failed or
  your spending limit needs to be increased", and the other 9 jobs were skipped
  because they depend on it. Actionlint was refused the same way on #144-#148, and again on main CI run 43271445298
  (`2822c6ab`, 2026-11-12 17:37 UTC).
- **Stale open PRs (decided 2026-11-12):** 35 open PRs predated this program and were
  tracked nowhere else: the Codex stack #67-#93 (27 PRs, one chain), #13, #14, #32,
  #34, #51 (98-263 commits behind `main`), and #121, #126, #127. The owner closed the
  32 in the first two groups unmerged. The stack's five migrations and most of its code
  were already on `main`, byte-identical. #14 was not: its 3 migrations, including
  `20260827120000_secure_tenant_invitation_provisioning`, are not on `main`; its invite
  part is replaced by #151. **Kept to re-port onto `main` as new
  reviewed PRs:** #121 award task role scope (3 migrations), #126 trial hardening
  (11 migrations, 54 API files; its B1 invite part is replaced by #151), #127 client
  turnover polish (no migrations). The #121 and #126 migrations are stamped before the
  production head `20261104195001`, so a re-port must restamp them. #126's verdict doc
  `docs/qa/2026-10-20-trial-readiness-verdict.md` exists only on the #126 branch.
  #145 (Dependabot, GitHub Actions versions) is clean but unreviewed and cannot be
  verified until CI runs.
- **Adding a client's users:** #151 is live on web since 2026-11-13, so Admin → Users →
  New runs the fixed code (B1). It is not yet exercised in production, so make the first
  invite a supervised test: check that the invitee lands in the inviter's tenant with the
  intended role and that no new tenant was created. Before any invite on
  either path, the owner checks that Supabase Auth has "Confirm email" on. The trigger
  that binds an invitation is on `main` in a migration older than the production ledger
  head, and it binds on any sign-up with the invited email; only activation needs a
  confirmed email. So the setting is necessary, not sufficient: the open #151 Medium and
  the any-age `pending` Low apply to the platform-owner path too. The
  production setting is not recorded here; the local `supabase/config.toml` has
  `enable_confirmations = false`. Production on 2026-11-12: 12 Auth users, all confirmed; 0
  `platform_user_invitations` rows ever; 1 platform role assignment. The platform-owner
  invite path is the one that provisions into the right tenant, but it has never run
  in production and depends on Auth email delivery (a password-recovery email hit a
  429 before).
- **#144 amount-only rows (owner):** sheets carry TOTAL and VAT rows with an amount
  but no quantity. Fix loop 6 implemented option 1 below, and the spec dated it as an
  owner decision of 2026-11-13, but no owner message records one. Fix loop 7 (`d767dd8f`)
  relabelled it as a default and extended it to a row with an amount, no unit and no rate
  (a VAT row with 12% typed in Quantity was still priced). Still priced, and part of the
  same decision: a row with `%` typed as its unit, when the amount divides exactly
  (round-7 code N1). Confirm, or pick another option. Before
  loop 6 the import priced them as lump sums. Options: (1, recommended) skip
  and list amount-only summary rows, and treat a row as a lump sum only when its unit
  is `ls`, `l.s.` or `lot`; (2) import them unpriced for review; (3) keep the spec as is.
- **Supabase account (owner):** the owner named a Supabase account to use (in chat, 2026-11-12).
  The connector used on 2026-11-12 reaches org PAVI, project `aqqrtkmtcsfkbyyqxowv`,
  which is the production project in this file. Confirm PAVI is that account.
- PH rates in the survey (2% EWT, 10% retention, 0.1%/day LDs, PCAB ranges) come from
  secondary sources. Check them against primary BIR, GPPB and PCAB texts before they
  become rules.

## Log
| Date | Mode | Result |
|---|---|---|
| 2026-11-15 | fix | Owner order "start fixing the features of ERP system one by one", continued. Five PRs, same gates as the batch below (failing-first tests, web/API `tsc` 0, eslint 0, security PASS and code APPROVE posted as PR comments, squash-merged under the owner override): #171 `e703e346` the project Inventory actuals card shows received and issued quantities at up to 6 dp, like every other micros view; #172 `0d7d81bd` the BOM server actions (six readers, draft-line writes, approve, create, locations) treat a retired project as not found and answer empty for a malformed id; #173 `96a4bf18` RFQ creation (Core and web) and the staff award refuse a retired project, and `liveProjectCondition` moves to `@third-code-erp/database` (unlocked, see Follow-ups); #174 `0036a64e` every PO creation path (Core and web standalone, from-BOM and grouped), requisition-to-PO, the Togal BOM commit and the takeoff import refuse a retired project; #175 `8021b5de` document processing refuses a retired project at enqueue (404), claim (job failed `project_retired`, no worker run, no retry) and evidence commit, with a DB-backed test. Nothing deployed: web stays `ad342498`, API `ad342498`. Follow-ups are listed under Follow-ups |
| 2026-11-15 | fix | Owner order "start fixing the features of ERP system one by one" (rule R2 trial defects). Seven PRs, each with its own branch, tests that fail on the old code, local gates (web/API `tsc` 0, eslint 0, affected suites green), a security review (PASS) and a code review (APPROVE) posted as PR comments, then squash-merged under the owner override (Actions blocked by billing): #163 `925849b0` the six BOM reader server actions enforce the BOM page read policy (8 roles leaked same-tenant reads); #164 `05bd53ee` RFQ quantities through `formatBoqQuantity` (4 dp); #165 `2529c350` the BOM builder bills through Core, which refuses a superseded BOM; the legacy web `createInvoice` money path is deleted; #166 `cea261e9` rate-card prices must be at least 1 centavo and a safe integer (the picker silently skipped 0-price cards); #167 `e688b2e1` SEC-14, refreshed and callback auth cookies are `Secure` in production, pinned by a contract test on the real `@supabase/ssr`; #168 `2b97a2c4` RFQ "contracted" lines use the PO rate-card filter (`rateCardInEffectCondition`); #169 `e5bdc3bf` RFQ coverage is decided by the PO `rateCardPicker` through `loadRateCardCoverage`, so a vendorless cheapest card, an unknown vendor or a unit mismatch keeps the line quoted. Nothing deployed: web stays `ad342498`, API `ad342498`. Before the next promotion, check the #165 Core invoice flag precondition. Follow-ups are listed under Follow-ups |
| 2026-11-15 | deploy | Owner order: ship the landing page changes to production. This is outside the v1 freeze rule R2. #161 (`feat/web-abi-ops-landing-3d`) was merged as `ad342498` under the owner override (Actions refused for billing; no security or code-review round ran), then web was promoted by the manual path of `deploy-production.yml` (Vercel CLI 54.7.1 as `kurtgav`: link, `APP_REVISION` override, `deploy --prod`; `DATABASE_URL` step skipped). Pre-checks on Node 22.23.2: web typecheck 0, eslint 0, web unit suite 324 files passed and 3 skipped, 2,919 tests passed, `next build` pass, `pnpm audit --prod` one moderate (GHSA-3v2p-hm54-8qcq, `inngest` > `@opentelemetry/instrumentation-http`, already on `main`). `test:e2e:landing-local`: the page, robots, sitemap and manifest-name assertions pass. The `start_url` assertion fails because the spec expects `/`, while `manifest.ts` has had `/dashboard` since `dfcd049e`. `/api/ready` fails on a local server with no database. Deployment `dpl_Fj7jCsucLEkWqFpjYeU23k5Sa6f2` aliased to `thirdcode-erp.vercel.app`. Verified: `/api/health` and `/api/ready` report `ad342498b722`, database up, core API 200; `/`, the GLB models and the still image return 200; `verify-production-surface.mjs` PASS; API `/health` and `/ready` 200. Railway also auto-deployed the API at `ad342498` (`6540ce9a`, SUCCESS), with no API runtime change since `f212c9df`. Web rollback target: `thirdcode-h9ks0jxwc` (`80a397f0`). Not run: the production release E2E (D0-4 credentials) |
| 2026-11-13 | gates | D0-2 done on #147 `cae8c63b` (= `a94745d5` + #158; Node 22.23.2, one process at a time). The steps the first run did not reach now pass: web `next build` (CI placeholder env, heap capped at 3 GB); the image-optimizer check (built server, `/api/health` 200, `/_next/image` 200 `image/webp`, valid WebP); the credential-free Playwright job (15 specs, 153/153, 0 skipped, 0 flaky, asserted no skips). `test:wo-11-contract` 59/59. Renewed #147 review (round 5): security PASS and code APPROVE on the interaction with `main` since `67163c62`; the PR's own patch-id is unchanged since round 4. Runbook should-fix folded in as `b92f35fa` (docs only: back up and pause the embed job first, merge #147 straight after the migrations, deploy web and API from that commit, no web rollback older than D0-1). Local exceptions, accepted: actionlint (Windows `tar`), and the account-actions database file, which refuses a non-disposable database; the copy for it could not be made this round (a `pg_dump` restore was stopped for low workstation memory and the copy dropped), and its round-4 run on a disposable copy stands because neither the file nor any migration or schema changed since `67163c62` |
| 2026-11-13 | gates | D0-2 partial on the #147 + `main` tree `a94745d5` (Node 22.23.2, one process at a time). Pass: lint; typecheck in every package; the CI unit-job gates except wo-11 (below); unit suites shared-types, operations, API and web; `pnpm audit --prod`; local `supabase_db_erp` (port 54342) rebuilt from zero with `supabase@2.109.1 db reset` (183 migrations, head `20261106102000`); `verify:build-ops-data`; policy-contract, repro and release-planner (`--require-current`) checks; empty public schema diff; CI-only grants applied and asserted; database suite with no skips; API integration with no skips (Redis on 56379); the API container built and smoked (health and ready 200, unauthenticated PATCH 401). Fail: (1) `test:wo-11-contract` 58/59, also on `main`: #156 removed the import its fixture relied on; fixed by #158, merged as `93492bda` (security PASS with two pre-existing Mediums, WO11-01 in Follow-ups and WO11-02 = CI not running; code APPROVE), then merged into #147 as `cae8c63b`, where it passes 59/59; (2) actionlint: the local Windows `tar` reads `C:` as a host, so the pinned binary cannot unpack; (3) web DB workflows: two of three pass, and the account-actions file refuses a database that is not a disposable loopback copy, by design (round 4 ran it on a copy). The `db reset` step itself finished; only the run's own ledger query had a quoting error, and a separate query read 183. Not reached: Claude Code stopped the run for low workstation memory at the web `next build` (exit `0xC0000142`), so the build, the image-optimizer check and the credential-free Playwright job are still owed, as are the account-actions file on a disposable copy and a renewed review of #147 on its current head. `v1.0.0-rc.1` waits on them |
| 2026-11-13 | deploy | D0-1 done: web promoted to `main` `80a397f0` by the manual path of `deploy-production.yml` (Vercel CLI 54.7.1 as `kurtgav`: link, `APP_REVISION` override, `deploy --prod`), because Actions is still refused for billing. The workflow's `DATABASE_URL` rewrite was skipped: it needs the GitHub secret, and the production value was left as it was. Pre-checks on a clean checkout of `80a397f0` (Node 22.23.2): lint 0, web typecheck 0, web unit suite 324 files passed and 3 skipped (DB-backed, no `DATABASE_URL`), 2,891 tests. Deployment `dpl_DeBH8PRoz6zjENMT6T3AytGgPZ65` (`thirdcode-h9ks0jxwc`, region `icn1`), aliased to `thirdcode-erp.vercel.app`. Verified: `/api/health` and `/api/ready` report `80a397f089bc`, database up, core API 200; API `/health` and `/ready` and CAD `/health` 200; `verify-production-surface.mjs` PASS; no runtime errors in the first hour. Previous production `thirdcode-jzhgfv5c9` (`ddacfb1b`) is the web rollback target until D0-3. Deployment Protection is Vercel Authentication on all deployment URLs except the production domain; the old URLs answer 302. The production release E2E (demo boundary, cross-tenant, authenticated) was not run: it needs the `buildops-e2e` credentials (D0-4). D0-6 is blocked: the agent was refused the production database URL, and `backup-production.yml` cannot start while Actions billing fails, so D0-3 waits |
| 2026-11-13 | merge | D0-1: #156 (SEC-10) merged as `e708ba2f` under the owner override (Actions blocked). Five `'use server'` functions (four readers and the portal view counter) moved to `server-only` modules or deleted; a guard test fails on identity parameters, re-exports or a vacuous scan. Security PASS (F1 closed in the PR; F2 and the same-tenant BOM reader role gap moved to G4) and code APPROVE, both on `d7771c90`; the two later test-only commits in the merged head `cb23e4bc` were not re-reviewed. Local: web typecheck, lint on the changed files, and the guard plus the progress, vos, portal and proposal suites (155 passed). Web not yet promoted, so production still serves the readers. #155 round 2: security PASS (N1–N5) and fact-check REQUEST_CHANGES (S1–S5, nits), folded in: D0-6 now precedes D0-3, D0-6 names a runnable procedure, and the cross-tenant spec must not skip. Round 3 fact-check (§8 web row, backup form, nits) folded in. Left: fact-check round-2 N8 (CI wording in an older STATE section) |
| 2026-11-13 | release | Owner order: end implementation and mark trial-ready. v1 feature freeze. Report `reports/02-trial-readiness.md` (#155): company trial GO conditional on D0-1..D0-8, GA NO-GO (G1–G6). Release-candidate gates on `db4887c0` (Node 22.23.2) partial: typecheck 6/6; unit shared-types 729, operations 14, database 333 pass; lint not concluded (plugin load, path case); api suite interrupted; the rest not reached. The session stopped the run for low workstation memory (rerun in D0-2). Production read-only: all health 200, ledger 180, no ABI client tenant yet, 0 ERROR advisors, leaked-password protection off. #155 round 1: fact-check REQUEST_CHANGES, security PASS with M1–M4 (SEC-10 re-raised as D0-1, public sign-up, cross-tenant spec, intake SheetJS path), all folded in. Actions still refused for billing |
| 2026-11-13 | promote | Manual (Actions blocked): web `ddacfb1b` via Vercel CLI from a clean checkout of `main` (deployment `thirdcode-jzhgfv5c9`). Before: lint, web typecheck and the web unit suite (2,889 passed, 6 skipped) on that checkout. After: `/api/health` and `/api/ready` report `ddacfb1b8f63`, the surface check passes, API and CAD health answer 200, and Vercel showed no runtime errors in a check a few minutes after the deploy. Smoke not run (secrets in GitHub only); the invite path was not exercised. API and database unchanged |
| 2026-11-13 | build | #153 `ddacfb1b` merged (docs only, owner override). The fact-check APPROVE covers `18a83a2b` and the security PASS `10f0c5cd`; the merged head `de8acfc0` is one commit later, the two wording fixes the security recheck asked for. #144 fix loop 7 pushed as `f45a0a0a`; round 7: security FAIL (1 High, in the export), code REQUEST_CHANGES (a missing ADR); fix loop 8 started |
| 2026-11-13 | build | #151 round 2 on `a0bcdea1`: security PASS, code APPROVE; merged `2822c6ab` under the owner override. Not deployed: web and API both at `f212c9df`, the Railway deployment for `2822c6ab` waits at NEEDS_APPROVAL, and the Vercel CLI cannot reach the production project. #144 round 5 on `db98b8f7`: security FAIL, code REQUEST_CHANGES; fix loop 6 to `2a79cf7b`; round 6: security PASS, code REQUEST_CHANGES; `main` merged into the branch locally; fix loop 7 started. Nothing deployed: Actions still refused |
| 2026-11-12 | build | Owner decisions: #144 fix loop 5 (pushed `db98b8f7`, reviews running); #147 merge plus runbook (production Cortex backup taken into `erp_backup_20261112`; migrations not applied, the MCP confirmation expired twice; not merged); 32 stale PRs closed, #121/#126/#127 kept for re-port; B1 present on `main` by code trace, fix #151 opened (round 1: security PASS, code REQUEST_CHANGES; fix loop 1 running). #152 `4e9cd9ed` merged (test only: pins the clock of an aged unit test). Nothing deployed |
| 2026-11-12 | merge | #148 `999d558c` (docs only), owner override of the CI gate. Security PASS and code APPROVE cover `bfafd665`; the fact-check APPROVE covers the merged head `f2618fc0` (4 commits later, STATE only). Production checked: web `/api/ready` revision `f212c9dffb47` database up, API `/ready` database ok and redis ok, CAD `/health` 200. Actions still refused for billing. 35 stale open PRs triaged into Blockers. Legacy root status files marked superseded. Nothing deployed |
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
