# Production readiness report — 2026-11-23

Companion to `readiness-audit-2026-11-23.md` (discovery) and
`trial-onboarding-requirements.md` / `trial-onboarding-checklist.md` (what companies send).
Statuses: **VERIFIED LIVE** (checked on production after release) · **VERIFIED** (a
setting, file or run checked directly; no runtime behaviour involved) · **DEPLOYED, NOT VERIFIED**
· **MERGED, NOT DEPLOYED** · **IMPLEMENTED, NOT MERGED** · **BLOCKED** · **NOT STARTED**.

## 1. CEO summary

- **Production is current and healthy.** Web, API, CAD worker and database all run `main`
  `385bcc92` (#239). It went out through the gated `Production promotion` workflow (run
  45217102060): release gates, migration ledger, health and release identity, the demo role
  boundary, **cross-tenant isolation**, authenticated production E2E and password recovery
  all passed. Production smoke passed (10/10) before and after the web release.
- **What today's release closes:** a service-role trigger anyone could call (edge
  functions), the Next.js advisories that failed every PR, workspace admins changing
  platform identities, the public sign-up page (page only), 13 defects that blocked trial
  journeys (#226–#238), and integer-only DXF quantities (schema live; the end-to-end
  upload is not yet exercised on production).
- **Why changes were not reaching production:** the work was never committed. On top of
  that, two CI gates failed on every PR, and today the web step failed because the
  `production` environment's own `VERCEL_TOKEN` had expired (an environment secret
  overrides the repo secret of the same name). The owner replaced it.
- **Not yet ready for an outside trial company.** Remaining blockers are owner-only:
  Supabase public sign-up off (A), working email (B), monitoring (D), the company's data
  (H) and approval to create and switch on its tenant (I). No further code release is
  planned before day 1; trial P1 gaps (no trial expiry, partial export) remain.
- **Still uncommitted:** a large part of the trial-readiness work (section 3, last row)
  is not reviewed or merged.

## 2. Why changes did not reach production (broken links)

| # | Link | Cause | Now |
|---|---|---|---|
| 1 | Local edit → commit | Weeks of work sat uncommitted on `fix/trial-readiness-pass-1` (222 modified + 175 untracked files). Nothing that is not committed can deploy. | 20 PRs (#220–#239) carved out, reviewed and merged today. The rest is still uncommitted (section 3, last row). Backup of the tree: `D:\thirdcode\ERP-wip-backup-20261123`. |
| 2 | PR → CI | Every PR failed two gates: Security Scan (Next 15.5.28 advisories) and trusted-PR E2E (`E2E_BASE_URL` pointed at a deleted Vercel deployment, HTTP 410). | Fixed: #221 (Next 15.5.29); `E2E_BASE_URL` = `https://thirdcode-erp.vercel.app`. |
| 3 | Merge → API/DB | Merging to `main` is itself a production action: Supabase applies merged migrations ~40 s after push, Railway auto-deploys the API. | Unchanged by design (owner decision 2026-11-04). Documented in the audit. |
| 4 | Merge → web | The web goes live only through the `Production promotion` workflow. It refuses to start until main CI for the exact SHA has finished. | Run 45199532691 refused for that reason (CI still running) — correct behaviour. |
| 5 | Promotion → Vercel | Runs 45200336742, 45208899612 and 45212871303 deployed API and CAD worker, then failed at Vercel with `The specified scope does not exist`. The job runs in the `production` environment, whose own `VERCEL_TOKEN` (set 2026-08-22) no longer reached the team; it overrides the repo-level secret, so replacing the repo secret had no effect. *Inferred:* the token expired between 11-17 (last good release) and 11-23. | Owner set a new token (account kurtgav, team pavi) on the `production` environment; run 45217102060 passed. Mixed window (new API from 14:56Z, new CAD worker from 15:11Z, old web until 16:42Z): healthy, smoke 10/10. |
| 6 | STATE.md | Recorded blockers that are no longer true (Actions billing, private repo, pending migrations). | Corrected in STATE.md (this PR). |

## 3. Status ledger

Live revision everywhere: `385bcc92`. Web deployment `dpl_HtEF9XSHoNa6zxmiX5S82Goap8va`
(rollback target `dpl_5pWS6WiibAymU76i5ttajSgH5s55`, `641a4ea9`); API `12309aa0`; CAD worker
`f3e287d7` (rollback `ca055675`); database ledger 183, head `20261123120000`.

| Item | Status | Evidence |
|---|---|---|
| Fresh backup | **VERIFIED** | Run 45190233956 (2026-11-23 14:04Z), encrypted dump copied to `D:\thirdcode\ERP-prod-backups\2026-11-23\`. Not restore-tested. |
| #220 edge functions require `x-cron-secret` | **VERIFIED LIVE** | `sla-checker`, `permit-staleness-checker`, `cnps-survey-sender` v3; each answers 503 `CRON_SECRET is not configured` to the anon key. |
| #221 Next 15.5.29 | **VERIFIED LIVE** | Web serves `385bcc92`; Security Scan green on `main`. |
| #222 trial bootstrap + flag checker | **MERGED** (tooling, nothing to deploy) | Not run: no trial tenant exists yet (blocked on H, I). |
| #223 invitation-only sign-up page | **VERIFIED LIVE** | `/auth/signup` shows "Sign-up is by invitation", no password field. The Supabase Auth API still accepts sign-ups until owner item A. |
| #224 platform identities locked from workspace admins | **DEPLOYED, NOT VERIFIED** | In API and web; unit tests 47/47; not exercised live (needs a workspace admin acting on a platform account). |
| #225 audit and onboarding docs | **MERGED** | Docs. |
| #226–#238 trial-journey fixes (project form errors, budget draft state, VO cumulative impact, TCV/GP in pesos, stage moves, inventory caps, read-only views, punchlist SLA stop, turnover attach scope, read-only PPRF, portal billing, portal BOM approval, dashboard alerts) | **DEPLOYED, NOT VERIFIED** | Live in web `385bcc92`. Release E2E and smoke pass, but they do not exercise each fix. #234 (cross-project attach) is security-relevant and has unit tests only. |
| #239 fractional DXF quantities — schema | **VERIFIED LIVE** | `scope_items.quantity_decimal numeric(18,4) NOT NULL`, sync trigger present, 0 mismatched of 143 rows. |
| #239 — code path (worker, API, web) | **DEPLOYED, NOT VERIFIED** | All three on `385bcc92`. The release CAD spec only checks "Worker online"; a real upload with fractional areas has not run on production (needs a write in the E2E tenant: batch 2). |
| API first auto-deploy of `385bcc92` | Resolved | Failed its 15 s `/ready` healthcheck once (app listening, cause not found); redeploy of the same build passed. |
| `E2E_BASE_URL` → production URL | **VERIFIED** | PR #240 "E2E Tests (trusted PR)" passed against it (failed on every PR before). |
| API serverless sleep off | **VERIFIED** (config) | `sleepApplication` no longer set. |
| `NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED=false` (Vercel production) | **VERIFIED LIVE** | See #223. |
| Stale Supabase preview branch deleted | **VERIFIED** | Only `main` remains. |
| `VERCEL_TOKEN` (`production` environment) | **VERIFIED** | Replaced by owner 2026-11-23 16:29Z; run 45217102060 deployed with it. The repo-level `VERCEL_TOKEN` is an unused duplicate (only `deploy-production.yml` reads it, inside `production`). |
| Production smoke | **VERIFIED** | Run 45202868395 (before web) 10/10; run 45221753624 (after web) 10/10. |
| Logs after release (16:42Z–17:12Z) | **VERIFIED** | Vercel: only the release E2E's deliberate denials and unsigned Inngest probes; Railway API: 0 errors; CAD worker: 0 errors; Supabase: 3 edge 5xx = my 503 checks. |
| Rest of the trial-readiness work: slices F1, G1–G5, G17–G21, G24–G27, H1–H14, M1–M7 and 8 untracked migrations (`20261118*`) | **IMPLEMENTED, NOT MERGED** | Uncommitted on `fix/trial-readiness-pass-1`; includes the wo-08 / wo-08a / wo-10 contract-gate conflicts. Backup in `D:\thirdcode\ERP-wip-backup-20261123`. |

## 4. Human blockers (owner only — no agent access)

| # | Action | Where | Why it blocks the trial |
|---|---|---|---|
| A | Turn **off** public sign-up; turn **on** leaked-password protection; minimum password length 12 | Supabase → Authentication → Providers / Policies | The "by invitation" page (#223) is cosmetic; the Supabase setting is the real control. Anyone can still create a tenant via the Auth API until it is off. |
| B | Configure custom SMTP (e.g. Resend) | Supabase → Authentication → SMTP | The default sender only reaches project team members: invitations and password resets to trial companies will not arrive. |
| C | Decide public vs private repo | GitHub settings | Source, STATE (production ids, tenant slugs) and `output/pdf/*` are public. Private on the free plan brings back the Actions minute cap that blocked CI before. |
| D | Error monitoring (Sentry free) and an uptime monitor | Sentry / Better Stack | Errors currently go nowhere; nobody is paged if the site goes down. |
| E | Check Railway billing for the 2026-11-15 21:05Z outage (~17 h, all services removed) | Railway → Usage / Billing | If it was a usage stop, it can happen again mid-trial. |
| F | Branch protection on `main` (free for public repos) | GitHub → Rules | Any push to `main` reaches the API and database. |
| G | Keep or drop schema `erp_backup_20261112` | Supabase | Holds a copy of production Cortex data. |
| H | Per trial company: legal name, BIR TIN, PCAB, DPO email, admin name + work email, fiscal year, users | `trial-onboarding-checklist.md` | Tenant bootstrap and the per-tenant write switches need the tenant id. |
| I | Approve batch 2 (tenant creation, bootstrap `--apply`, add the trial tenant UUID to the `*_TENANT_IDS` switches on Vercel and Railway) | Chat | Production writes and env changes need approval. |

## 5. Cost and leak findings

| Finding | Status |
|---|---|
| Edge functions ran with the service role for anyone holding the public anon key | **VERIFIED LIVE** closed: all three answer 503 without `CRON_SECRET` (v3, 2026-11-23). Nothing schedules them today; to use them, set `CRON_SECRET` (function secret + Vault `cron_secret`) — needs approval. |
| Stale Supabase preview branch `enterprise-remediation-20260817` billed hourly since 2026-08-17 | **VERIFIED** deleted (only `main` remains). |
| Railway API serverless sleep (5–6 s cold starts, `/ready` 499s) | **VERIFIED** off (config no longer has `sleepApplication`; cold-start latency not re-measured). Cost ≈ +$1–3/month (estimate). |
| No backup for 19 days | **VERIFIED** encrypted dump 2026-11-23 14:04Z, run 45190233956, copy at `D:\thirdcode\ERP-prod-backups\2026-11-23\`. PITR still unavailable. |
| Repo public | **BLOCKED** owner item C. |
| Two stale Vercel preview environments still hold `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` | **NOT STARTED** — removing env vars needs approval (batch 2). |
| Spend-guard regex misses `vercel@x deploy --prod` | **NOT STARTED** (low). |
| Web waste: middleware calls Supabase Auth on static assets; 3 Auth calls per dashboard render; robots/sitemap per request; default prefetch on ~400 links | **NOT STARTED** (performance, not cost-critical at trial volume). |
| Spend today | Vercel $21.58 / 30 days (Pro seat), Railway ≈ $2–5/month (estimate), Supabase Pro. No hard spend limit visible via API on Vercel or Railway. |
| Secrets in repo/history | None found (masked regex scan of 3,824 files and 2,588 commits). gitleaks binary not run locally. |
| Dependabot: 5 high, 1 moderate open on `main` | **BLOCKED** by a recorded waiver. The 5 highs are one advisory, zod < 4.6.6 (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized constrained collections), in web, API and shared packages; the fix is the zod 4 major (~230 files), due **2026-12-04** (STATE follow-up). Compensating controls since 2026-11-04: Core API array budget, JWT guard before pipes, token-first webhook, 3 MB Server Action cap. Moderate: minimatch (dev, build-time). |

## 6. Trial onboarding — top 10 inputs per company

1. Registered company name, BIR TIN, PCAB licence number.
2. Data Protection Officer email; signed data processing agreement and trial rules.
3. Up to 10 users: name, work email, job (maps to a role).
4. Credit-check approvers (finance recommendation + president) and two people with finance authority.
5. Mail-server allow-listing and a received test email per user.
6. VAT / EWT / retention rates (defaults 12% / 2% / 10%).
7. Accountant review of the starter chart of accounts and the fiscal year start.
8. Cash and bank account names; main warehouse.
9. 1–2 live projects with a BOQ CSV (`Description, Quantity, UOM`).
10. Client list and open deals (client, stage, TCV, GP, closing date, floor area, salesperson).

Full list with reasons: `docs/operations/trial-onboarding-checklist.md`.

## 7. Next 7 days

1. **Owner, day 1:** items A (sign-up off, leaked-password protection, length 12) and B
   (SMTP). Then one test invite to a company address to prove invitation email works with
   sign-up off.
2. **Owner:** item D — Sentry (free) for web and API; uptime checks on web `/api/ready`,
   API `/ready`, CAD `/health`.
3. **Company:** send the "Before day 1" data (section 6). **Agent:** prepare batch 2 —
   create the tenant, run the bootstrap (dry run, then `--apply`), add its UUID to every
   `*_TENANT_IDS` switch on Vercel and Railway, `check:trial-flags`, publish, invite.
4. **Batch 2 also:** one fractional-area DXF upload in the E2E tenant to verify #239 live
   (then update the DXF line in `trial-onboarding-checklist.md`); remove the two stale
   Vercel preview environments' `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`.
5. **Owner:** delete the unused repo-level `VERCEL_TOKEN` and the first replacement token
   that could not reach the team; decide F (branch protection) and C (repo visibility).
6. **Agent:** land the uncommitted slices as small reviewed PRs, trial P1 items first;
   resolve the wo-08 / wo-08a / wo-10 contract-gate conflicts.
7. **Decide:** whether the SLA, permit and CNPS schedulers should run. If yes: set
   `CRON_SECRET` (function secret and Vault `cron_secret`) and add the pg_cron schedules
   (production change, needs approval).

## 8. What was not checked

- A real DXF upload with fractional areas on production (#239 end to end).
- #224 and each of #226–#238 exercised live; the release E2E and smoke cover general flows.
- Supabase Auth settings (sign-up, email confirmation, SMTP, redirect URLs), PITR and
  daily backups: dashboard only.
- Invitation delivery with sign-up disabled (needs item B first).
- Restoring the backup (the dump was taken and copied, not restored).
- Vercel and Railway spend limits and the Vercel firewall (no API access).
- Why the first API healthcheck for `385bcc92` failed (the same build passed on redeploy).
- That the old `VERCEL_TOKEN` expired (inferred from dates; Vercel token list not readable).
- gitleaks with the real binary; Redis contents.
- Known Lows from review of #239: tie rounding can differ by under 1 centavo between the
  browser extractor and the worker; `updateScopeItemCost` swallows the error detail.
