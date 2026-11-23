# Production readiness audit — 2026-11-23

Scope: ABI OPS / Third Code ERP — web (Vercel `thirdcode-erp`), Core API and CAD worker
(Railway project `a21fd382-…`), database (Supabase `aqqrtkmtcsfkbyyqxowv`), CI (GitHub
`Third-Code-Solutions/ERP`). Read-only discovery on 2026-11-23 (UTC+8 workstation), before any
change. Every fact below was observed today unless marked *inferred*. `docs/erp/STATE.md` was
last updated 2026-11-16 and is **stale** on several points (section 6).

## 1. Verdict

- **Production is healthy and current.** Web, API and database all run `main` at `641a4ea9`
  (#219). Health: web `/api/ready` 200 `revision 641a4ea9a9b4`, API `/health` and `/ready` 200
  (database ok, Redis ok), CAD `/health` 200.
- **Not ready for outside trial companies yet.** P0 gaps: an unauthenticated service-role
  trigger (edge functions), no trial tenant set up and no per-tenant switches, Auth email and
  sign-up settings unverified, no backup in 19 days, no error monitoring, DXF upload fails on
  real drawings, and the uncommitted work is not reviewed or merged.
- **Why recent work did not reach production:** it was never committed. See section 2.

## 2. Why changes are not reaching production

| # | Link in the path | Observed | Status |
|---|---|---|---|
| 1 | Local edit → commit | Branch `fix/trial-readiness-pass-1`: 0 commits ahead of `origin/main`, 222 modified tracked files (+8,913/−1,861) and 175 untracked files, including 8 migrations (`20261118*`). Nothing committed. | **Root cause.** Backed up 2026-11-23 to `D:\thirdcode\ERP-wip-backup-20261123` (`tracked.patch`, `untracked.tar`, `BASE_SHA`). |
| 2 | Commit → PR → CI | CI works again (main CI green on `641a4ea9`, 2026-11-17; promotion run 44110678314 succeeded). The "Actions blocked by billing" blocker in STATE.md is **no longer true**. The repo is now **public**. | Working |
| 3 | PR CI gates | Security Scan fails on every PR: `next@15.5.28` has GHSA-7qx7-33qx-rqx2, GHSA-f3mh-rxg3-f5g2, GHSA-pc58-hwjq-p385 (fixed 15.5.29). Trusted-PR E2E fails on every PR: repo variable `E2E_BASE_URL` points to deployment `thirdcode-gcfq50x0o` (2026-09-20), which Vercel removed (`410`, `X-Vercel-Error: GONE`). | Broken — fix in #221 + variable change |
| 4 | Merge → production | **Merging to `main` is a production action.** Supabase GitHub integration applies new migrations ~40 s after push (logs: `20261116120000` at 2026-11-15T19:49:12Z, 40 s after `7247f37e`). Railway auto-deploys the API on every push matching its watch patterns (incl. root `package.json`, lockfile). Vercel git deploys are off (`apps/web/vercel.json` `deploymentEnabled: false`): web goes live only via the `Production promotion` workflow. | By design; skips backup and ledger gates for DB and API |
| 5 | Branch protection | `main` is not protected (404, no rulesets). Free for a public repo. | Gap |
| 6 | Schema vs code | Production ledger 182 = `origin/main` 182 (head `20261116130000`). No drift. The 8 untracked migrations are not applied. | OK |
| 7 | Env vars | Every variable the docs mark required is present in Vercel production and on the Railway API (names only). Undocumented in-use names: `APP_REVISION`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `REDIS_URL`, `ERP_API_CORS_ORIGINS`, three `ERP_*_VIA_API` pairs. | Doc gap only |

## 3. Live state by provider

**Vercel** — production `dpl_5pWS6WiibAymU76i5ttajSgH5s55` (2026-11-17 15:33Z, `641a4ea9`). Last
20 production deployments: no ERROR; four November CLI deployments without git metadata
(manual, superseded). Runtime errors 7 days: 14 events, all during the 11-17 release E2E
(expected denials). Pro plan; 30-day cost $21.58 ($19.51 seat, $0 overage). No spend hard limit
visible via API; firewall "not configured" (defaults only). Two stale preview environments
still hold `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`.

**Railway** — API `c45b3d01` runs `641a4ea9` (deployment `6b738e69`, push auto-deploy);
CAD `328c6650` (`ca055675`, `railway up`, no repo connected); Redis `55639597` (50 GB volume,
1.4 GB used). No AI worker service exists. **Outage:** all three deployments were removed
within 9 s at 2026-11-15 21:05:16Z and restored 2026-11-16 14:21Z (~17 h); four API deploys
failed in the gap (`ENOTFOUND redis.railway.internal`). *Inferred:* usage/billing stop.
API serverless sleep is on: cold starts 5.4–6.4 s, two `/ready` 499s; web→API timeouts are
5–10 s. API dashboard build settings describe the web app; `railway.toml` overrides them.
No resource limits (24 vCPU / 24 GB). Cost ≈ $1.3–2.4/month (*estimated*).

**Supabase** — Pro plan (org PAVI). Advisors: 0 ERROR; WARN leaked-password protection off,
`vector` in `public`, 12 SECURITY DEFINER functions executable by clients, 5 duplicate indexes.
No `cron` schema (nothing scheduled). Edge functions `sla-checker`, `permit-staleness-checker`,
`cnps-survey-sender` ACTIVE (v2, 2026-08-13) and **unauthenticated** (section 4). One private
bucket `documents` (9 objects, 313 KB; allows `text/html`). DB 54 MB, 14/60 connections,
Realtime publication empty. Logs 24 h: 0 errors. 14 tenants (11 users in `buildops-e2e`,
1 in `third-code-solutions-inc`, 12 empty demo tenants); no client tenant; 0 MFA factors;
0 `platform_user_invitations`. Leftovers: preview branch `enterprise-remediation-20260817`
(MIGRATIONS_FAILED, running since 2026-08-17), schema `erp_backup_20261112`.
Not readable via MCP (owner to check in dashboard): email confirmation, public sign-up,
SMTP, redirect URLs, PITR, daily backups.

**GitHub** — CI green on `main`. Last `backup-production` 2026-11-04 (19 days), last
`smoke-prod` 2026-11-04 (not run for the 11-17 release). Dependabot npm updates fail (Node 24
runner vs `engines: 22.x`). Open PRs before today: #149, #147, #146, #145, #144, #127, #126, #121.

**Sentry** — no ERP project; no SDK in the repo. Errors go nowhere.

## 4. Security and leak findings

| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P0 | Edge functions accept the public anon key and run with the service role across all tenants; `permit-staleness-checker` re-emails every manager on every call | `supabase/functions/*/index.ts` `Deno.serve` with no auth; CORS `*` | #220 (secret check + HTML escaping); deploy needs approval |
| High | Repo is public: source, STATE (production ids, tenant slugs, workstation paths) and `output/pdf/*` are world-readable | `gh repo view` → `PUBLIC` | Owner decision |
| High | Next.js 15.5.28 advisories | CI Security Scan | #221 |
| High | Workspace admin could change role / reset password of a platform identity in their tenant (service-role reset bypasses DB guards) | uncommitted slice F3 | #224 |
| Medium | Public self sign-up creates an `admin` tenant; UI had no off switch | E10 in `reports/02-trial-readiness.md` | #223 + Supabase setting |
| Medium | No backup since 2026-11-04 | workflow history | Run `backup-production.yml` |
| Low | Customer portal links valid 365 days | `customer-portal.ts:43` | Backlog |
| Low | `server-only` missing on admin/env/db modules (no client import today) | `packages/auth/src/index.ts` | Backlog |
| Info | No secret found in 3,824 tracked files, 175 untracked files, the diff, or 2,588 commits (masked regex scan; gitleaks itself not run offline) | scan | Run `pnpm ci:gitleaks` in CI |

Spend: costs are small (Vercel $21.58/30 d, Railway ≈ $2/month, Supabase Pro). Waste to remove:
middleware runs on static assets and calls Supabase Auth on each; 3 Auth calls per dashboard
render (no memoization); robots/sitemap rendered per request; default prefetch on ~400 links;
stale Supabase preview branch; spend-guard regex misses `vercel@x deploy --prod`.

## 5. Trial readiness (summary; detail in `trial-onboarding-requirements.md`)

P0 before the first trial user:
1. Tenant setup: chart of accounts, fiscal period, warehouse, cost codes — only the new
   bootstrap script creates them (#222).
2. Per-tenant Core switches (`ERP_*_WRITES_TENANT_IDS`, exact UUIDs) on Vercel and Railway,
   checked with `check:trial-flags` (#222). Without them pipeline moves, Won → project,
   project create and invoice drafts fail.
3. Supabase Auth: public sign-up off, confirm email on, working SMTP, redirect URLs, min
   password 12, leaked-password protection on.
4. Fresh full backup; uptime alerts; error monitoring.
5. DXF upload fails on any fractional polygon area (`dxf-parser/src/main.py:117-126`,
   `shared-types/src/erp-api/cad.ts:11`) — fix in progress.

P1: no trial expiry/read-only mode, partial data export, no proposal PDF, BIR 2307 missing
payor TIN/payee address, KYC/contacts gaps, API cold starts.

## 6. STATE.md corrections

| STATE.md says | Observed 2026-11-23 |
|---|---|
| Actions blocked by billing; CI cannot run | CI and promotion ran green on 2026-11-17 |
| Web at `ad342498`, #163–#217 not live | Web, API at `641a4ea9` (#219) |
| DB ledger 180, head `20261104195001`; #191/#214 migrations pending | Ledger 182, head `20261116130000`; both applied (auto, via Supabase GitHub integration) |
| Private repo on the free plan | Public repo |
| Q-TEN-6 part 3 open | `ERP_ROADMAP_TAX_STATUTORY_OUTPUTS_ENABLED` is not set on the Railway API |

## 7. Not checked

Local full gate run on the uncommitted tree (running at time of writing); Supabase Auth
settings, PITR and backups (dashboard only); Vercel spend limit and firewall via API (MCP
denied); deployed edge function source vs repo; Redis disk contents; gitleaks with the real
binary.
