# ABI OPS — Client Handover Guide

| Field | Value |
|---|---|
| System | ABI OPS (Third Code ERP) — construction operating system |
| Client | Actuate Builders Inc. |
| Delivered by | Third Code Solutions |
| Prepared | 2026-11-03 |
| Production web | https://thirdcode-erp.vercel.app |
| Production Core API | https://third-code-erp-api-production.up.railway.app |
| Live revision at preparation | `04b3ac5a6139` (web `/api/health`) — `main` is ahead at `90c48866fc76`, see §8 |

This is the single entry point for the team that will own and operate ABI OPS
after handover. It says what exists, who must own which account, which
secrets must be rotated, how to release and roll back, and what is
deliberately not finished. Deeper engineering material is linked in §10;
nothing here replaces it.

---

## 1. What the system does

One tenant-scoped record from first lead to warranty:

Account/CRM → Opportunity pipeline → Proposal (PPRF, site inspection, design,
tender) → BOM (DXF/Togal import, client e-sign portal) → Project workspace →
Procurement (RFQ, PO approval, deliveries) → Inventory → Construction cadence
(tasks, progress, diary, RFIs, submittals, variation orders) → Cost control
(versioned budgets, commitments, actuals, forecast) → Billing & Finance
(progress claims, invoices, BIR 2307, receivables, payables, cash,
bank reconciliation, journals, ledger) → Post-construction (punchlist, COC,
turnover) → Warranty & CNPS surveys → Cortex (cited AI search over the
tenant's own records).

External parties use token links only (no login): BOM review/sign, project
progress portal, vendor PO confirmation, warranty tickets, CNPS surveys.

## 2. Architecture at a glance

| Tier | Runs | Hosted on | Health check |
|---|---|---|---|
| Web | `apps/web` — Next.js 15, server actions, portals, print views | Vercel | `GET /api/health`, `GET /api/ready` |
| Core API | `apps/api` — NestJS 11, transactional ERP authority | Railway | `GET /health` (liveness), `GET /ready` (DB + Redis) |
| CAD worker | DXF/drawing evidence processing | Railway | per `railway.toml` |
| Database | PostgreSQL 17, Auth, Storage, RLS | Supabase | Supabase dashboard |
| Queue/cache | Redis (BullMQ, provider quotas) | Railway | reported by Core `/ready` |
| Jobs | Inngest (SLA, cadence, warranty automation) | Inngest | `/api/webhooks/inngest` registration |

Tenant isolation is enforced twice: every query carries an explicit
`tenant_id` filter, and Postgres RLS denies cross-tenant reads as a second
line. The audit log is append-only and hash-chained.

## 3. Accounts the client must own

Handover is complete only when every row below is owned by an Actuate
Builders account and Third Code access is reduced to what a support
agreement allows. Do the transfers before rotating secrets (§4), otherwise
the new owner rotates keys it cannot yet see.

| # | Account | What lives there | Transfer action | Done |
|---|---|---|---|---|
| 1 | GitHub repository `Third-Code-Solutions/ERP` | Source, CI, `production` environment secrets, branch protection | Transfer repo to client org (or fork + archive); re-create `production` environment and its required reviewers; update `CODEOWNERS` handles | ☐ |
| 2 | Vercel project | Web deployments, env vars, domains, rollback history | Transfer project to client team; re-issue `VERCEL_TOKEN` | ☐ |
| 3 | Railway project | Core API, CAD worker, Redis | Transfer project to client workspace; re-issue `RAILWAY_API_TOKEN` | ☐ |
| 4 | Supabase project | Database, Auth users, Storage objects, backups | Transfer project to client organization; confirm backup/PITR plan on client billing | ☐ |
| 5 | Inngest app | Scheduled + event jobs | Move app to client account; re-issue signing/event keys | ☐ |
| 6 | Domain / DNS | Production hostname (currently `*.vercel.app`) | Point client domain at Vercel; update `NEXT_PUBLIC_SITE_URL` and Supabase Auth redirect URLs | ☐ |
| 7 | OpenAI (and optional Anthropic) | Cortex answers and embeddings | Client-owned API key with a spend cap | ☐ |
| 8 | Resend (optional) | Transactional email (invites, notifications) | **Not configured in production today** — see §8 | ☐ |
| 9 | Semaphore (optional) | SMS | Not configured | ☐ |
| 10 | DocuSeal (optional) | Provider e-signature | Not configured; built-in canvas signing is used | ☐ |
| 11 | Discord webhook | Deploy notifications (`DISCORD_DEPLOY_WEBHOOK`) | Replace with a client channel or remove the workflow | ☐ |

## 4. Secrets to rotate after transfer

Rotate every value Third Code staff could have seen. Values live only in the
provider dashboards and GitHub environment secrets — never in the repository.
Full meaning of each variable: [`docs/ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md).

| Where set | Variables |
|---|---|
| Supabase (rotate at source first) | database password (changes `DATABASE_URL`, `PRODUCTION_DATABASE_URL`, `SUPABASE_MIGRATION_DATABASE_URL`), JWT secret / API keys (`SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| Vercel env | the Supabase values above, `ERP_CORE_API_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET`, `ERP_RATE_LIMIT_KEY_SALT`, `HEALTH_DETAIL_TOKEN` (optional), any `UPSTASH_REDIS_REST_*`, `RESEND_API_KEY`, `DOCUSEAL_*` |
| Railway env (Core API) | `DATABASE_URL`, `REDIS_URL`, `SUPABASE_JWT_SECRET`, `ERP_CORE_WEBHOOK_TOKEN`, `AI_PROVIDER_API_KEY`, `AI_WORKER_SHARED_SECRET` |
| Railway env (CAD worker) | `PARSER_SHARED_SECRET` (must match the web value) |
| GitHub `production` environment | `VERCEL_TOKEN`, `RAILWAY_API_TOKEN`, `SUPABASE_MIGRATION_DATABASE_URL`, `PRODUCTION_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` |
| GitHub repository secrets (CI) | `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_SUPABASE_ANON_KEY`, `E2E_VERCEL_PROTECTION_BYPASS_SECRET`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `DISCORD_DEPLOY_WEBHOOK` |

Rotation order that avoids downtime: Supabase → Railway (redeploy) → Vercel
(redeploy) → GitHub secrets → run the smoke checklist (§6). Rotating the
Supabase JWT secret signs every user out once; schedule it outside work hours.

Also remove or disable the Third Code staff user accounts inside the ABI OPS
tenant, and the shared production E2E/demo account if the client does not
want to keep the automated release checks (§6).

## 5. Access model

Thirteen tenant roles: `owner`, `admin`, `estimator`, `sales`, `commercial`,
`design`, `pm`, `sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`,
`viewer`. Route and action permissions per role are in
[`docs/functional/RBAC_SUMMARY.md`](../functional/RBAC_SUMMARY.md) and the
machine-checked `RBAC_ROUTE_MATRIX.csv`.

- Tenant `owner`/`admin` manage users at **Admin → Users** (invite, role,
  deactivate) and workspace settings at **Settings**.
- Money-moving and record-locking actions (posting, reversing, issuing,
  approving, signing) are capability-gated, audited, and never happen
  silently; corrections are made by reversal, not by editing history.
- **Platform Control** (`/platform-admin`, cross-tenant administration) is a
  separate authority that is currently bound to a single Third Code identity
  in code and in a database constraint
  ([ADR-027](../adrs/ADR-027-platform-owner-administration-boundary.md)). Whether that authority
  transfers to the client or stays with Third Code under a support agreement
  is an open handover decision — see §8.

## 6. Releasing, verifying, rolling back

**Release** — only through `.github/workflows/deploy-production.yml`
(manual dispatch on `main`, `production` environment approval). It runs
lint/type/unit/build gates, a read-only production data-boundary scan,
ordered Supabase migrations, Railway + Vercel deploys, health checks and the
authenticated production E2E suite. Details:
[`docs/DEPLOYMENT.md` §5](../DEPLOYMENT.md). Wait for every PR check to pass
before merging; do not rely on auto-merge as a gate.

**Smoke check after every release**

| Check | Expected |
|---|---|
| `GET /api/health` | `ok: true`, `status: "ok"`, `revision` = first 12 chars of the released commit, `dependencies.coreApi.state: "ok"` |
| `GET /api/ready` | `ok: true`, `database: "up"` |
| Core `GET /ready` | `{"status":"ready","database":"ok","redis":"ok"}` |
| Sign in, open Dashboard, Projects, Finance | Pages render, no "unavailable" panels |

For uptime monitoring use `GET /api/health?deep=1` — it returns 503 when the
Core API is down, so a monitor cannot stay green through an outage.

**Roll back**
- Web: Vercel → Deployments → last good deployment → *Promote to Production*.
- Core API / CAD worker: Railway → service → redeploy the previous deployment.
- Database: forward-only. Fix with a reviewed additive migration; for an
  integrity-affecting incident restore the pre-release backup/PITR point
  (expect downtime; Storage objects are not restored by a database restore).
  Never run `supabase db reset --linked` against production. Runbook:
  [`docs/runbooks/database-release.md`](../runbooks/database-release.md).

**Backups** — Supabase daily backups (and PITR if enabled on the plan) cover
database state. Storage objects (uploaded drawings, photos, signed PDFs) need
their own periodic export; set this up on the client's Supabase plan.

## 7. Day-to-day operations

| Task | Where |
|---|---|
| Add / remove staff, change roles | Admin → Users |
| Workspace profile, notification display, integration status | Settings |
| Audit trail of every change | Audit (tenant), project → Audit tab |
| Master data (materials, rate cards, mapping) | Admin → Material items / Rate cards / Mapping config |
| Data quality issues | Admin → Data quality |
| Background job status | Inngest dashboard |
| Errors / logs | Vercel → Logs (web), Railway → service logs (API), Supabase → Logs (DB/Auth) |

## 8. Open items at handover

These are known and recorded, not hidden. Each has an owner decision or
action.

| # | Item | Impact | Owner action |
|---|---|---|---|
| 1 | `main` (`90c48866`, PR #123: landing tap targets, dependency advisory overrides, Dependabot/CODEOWNERS/SECURITY.md) and this handover branch are not yet deployed; production runs `04b3ac5a` | Fixes not live | Run the guarded release (§6) after PR approval |
| 2 | Production email provider not configured (`RESEND_API_KEY`, `EMAIL_FROM`) | Invitations/notifications do not send email; in-app notifications still work | Create client Resend account + verified sender domain, set both variables |
| 3 | Platform Control authority bound to a Third Code identity (ADR-027) | Client cannot administer the platform layer itself | Decide: transfer to a client identity (needs a reviewed migration + code change) or retain under support agreement |
| 4 | DocuSeal not configured | Provider e-signature unavailable; built-in canvas signing works | Optional |
| 5 | Recoverable React 419 diagnostic when navigating away from an invalid-record page (Cash, Journals) | Destination renders correctly; console noise only | None required; tracked in the Defect Register |
| 6 | Session cookies cannot be `HttpOnly` (Supabase browser client design) | Mitigated by strict nonce CSP and session scoping | None; keep CSP strict |
| 7 | Login throttling relies on Supabase Auth rate limits | No app-tier lockout | Review Supabase Auth rate limits; optionally add a Vercel WAF rule on `POST /auth/login` |
| 8 | No error-tracking/uptime service wired | Incidents found by users first | Add uptime on `/api/health?deep=1`; optionally Sentry |
| 9 | Hero image source is 1536px wide | Slight upscaling on very wide/HiDPI screens | Supply a 2560–3840px asset |
| 10 | Public sign-up: the app's sign-up page and links are removed (`/auth/signup` redirects to login; accounts are invitation-only), but Supabase Auth still accepts sign-ups sent directly to its API with the public anon key | No access to ABI data (tenant isolation holds); a direct API sign-up creates an Auth user with no workspace | Set Supabase Auth → Sign In / Providers → "Allow new users to sign up" off (`enable_signup=false`); invitations keep working |
| 11 | Core API routing flags: production values not verified (Vercel env listing was refused to the handover tooling) | Role changes on Users and task completion on My Tasks stay read-only (the screens say so) until `ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API` / `ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API` are `true` with ABI's tenant ID in the matching `*_TENANT_IDS` | Review every `ERP_*_VIA_API` flag in Vercel against `.env.example` (all are listed there) |
| 12 | Pre-award design upload: design files can be attached only after the deal is won and its project exists | Sales cannot attach drawings during proposal | Accept, or schedule an opportunity-level upload |
| 13 | Partial deliveries: a PO marked "Partially Delivered" in older records cannot take more stock receipts (the posting guard accepts `partial_delivery`, not `partial_delivered`) | Affects only POs set to that status before this release; new partial progress is tracked by receipts | Data fix or guard migration, reviewed before applying to production |
| 14 | Resolved: permission errors now read "Your role does not have permission to do this." or "Your role cannot …". The KYC HTTP endpoint keeps its `Forbidden:` prefix because it maps to HTTP 403 | None | None |
| 15 | Resolved: the internal `/roadmap` page was removed | None | None |
| 16 | Client portal BOM page now shows the recorded BOM total (TCV) only; it no longer recomputes VAT and retention, which are applied per progress billing | Client sees one figure matching the internal BOM, with a note that VAT/retention apply on each billing | Confirm with ABI that this is how they want the BOM presented to clients |
| 17 | Asset service-log cost is now entered in pesos (e.g. `1500.00`) and stored in centavos; it was previously a raw centavo field | Older entries are unaffected; staff entering cost must use pesos | Mention in user training |
| 18 | RFQ bid comparison for estimator/viewer roles is computed in the web app from the quote rows the page already shows; the Core read (`procurement.rfq_read`) is limited to owner/admin/commercial/finance/procurement | Same comparison either way; no API permission was widened | Decide whether to add estimator/viewer to `procurement.rfq_read` |
| 19 | Dependency advisories waived in `pnpm-workspace.yaml` (each justified there): zod GHSA-mrhx-c7xc-m3w5 (fix only in zod 4), minimatch GHSA-g3hv-75wg-m249 (fix only in a breaking major; no user-supplied patterns), plus dev-only deepmerge and glob | zod: a very large array that fails validation can use a lot of memory; request bodies are capped (server actions 3 MB, API JSON 4 MB) | Schedule the zod 3 → 4 migration across all packages, then drop the zod waiver; re-check the others when patched releases ship |

## 9. Acceptance checklist (client sign-off)

Run each with a real client user of the named role on production after the
release in §8 item 1.

- [ ] Owner: invite a user, change their role, suspend them, reactivate them; see each in Audit.
- [ ] Sales: create account → opportunity → advance stages → PPRF → proposal.
- [ ] Estimator: upload a DXF/Togal file → review draft BOM → send BOM portal link; client signs.
- [ ] PM: open project workspace; log diary, RFI, submittal, variation order; update progress.
- [ ] Procurement: RFQ → PO → approvals → vendor confirmation link → delivery → stock receipt.
- [ ] Finance: progress claim → invoice → print + BIR 2307 → receipt allocation → bank reconciliation → journal reversal.
- [ ] CX: punchlist → COC → turnover package → warranty ticket via portal → CNPS survey.
- [ ] Viewer: can read, cannot change anything.
- [ ] Each role: pages they should not see are denied, not just hidden.

## 10. Where to go deeper

| Need | Document |
|---|---|
| Product scope (authoritative) | [`docs/PRD.md`](../PRD.md) |
| Architecture | [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), [`docs/adrs/`](../adrs/) |
| Deploying from scratch | [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) |
| Every environment variable | [`docs/ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md) |
| Runbooks (posting, reversal, reconciliation, tenant isolation, DB release) | [`docs/runbooks/`](../runbooks/) |
| Accessibility posture | [`docs/ACCESSIBILITY.md`](../ACCESSIBILITY.md) |
| Release evidence and history | `Third Code ERP Control Center.md`, `… Verification Ledger.md`, `… Deployment Record.md`, `… Defect Register.md` (repo root) |
| Latest QA reports | [`docs/qa/`](../qa/), [`docs/changesets/`](../changesets/) |
| Security policy / reporting | [`SECURITY.md`](../../SECURITY.md) |
