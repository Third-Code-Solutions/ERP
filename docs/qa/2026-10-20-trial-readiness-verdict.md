# Trial readiness verdict — Third Code ERP — 2026-10-20

Question: the client has paid the down payment. Is the ERP ready to go to trial?

**Verdict: NO for a client-facing trial on the hosted system starting today.
Conditional YES for a supervised pilot at one project site once the five release
blockers in §3 are closed.**

The software itself is not the problem. The code passes its own tests, the
migrations replay cleanly onto an empty database, the security model (auth +
row-level tenant isolation) demonstrably works, and the deployed API reports its
database and cache healthy. What is missing is everything between "the code on
this laptop is correct" and "a paying client can log in tomorrow and trust the
numbers": the hardening work is uncommitted, production is three weeks behind it,
the client's tenant does not exist, and there is no backup, monitoring, or
regression gate around the trial.

---

## 1. What is actually built

| Measure | Value | How measured |
|---|---|---|
| Database tables (public schema) | 214 | `pg_tables` on a freshly replayed database |
| Web routes (`page.tsx`) | 149 | `find apps/web/src/app -name page.tsx` |
| Supabase migrations in tree | 25 | replay from empty DB, 2026-10-20 |
| Monorepo packages | 7 linted packages (web, api, ai, auth, database, operations, shared-types) | root `lint` script |

Module areas present in routing: projects, BOM, procurement/purchase orders,
inventory and stock movements, progress billing and receivables, statutory/tax
surfaces, documents, approvals, dashboards, admin/owner console.

---

## 2. Evidence ledger — what was executed, not assumed

All commands run on 2026-10-20 in `D:\thirdcode\ERP`, Node v22.23.0.

| Check | Command | Result |
|---|---|---|
| Unit/integration suite | `pnpm test` (root, turbo) | **exit 0** — 4,649 tests passed, 0 failed (one contention flake fixed, §5) |
| Lint (zero warnings allowed) | `eslint --max-warnings=0` over 7 packages | **exit 0**, 286 s |
| Migration replay | `supabase db reset` on empty DB (all 25 migrations + seed) | **OK**, 214 tables |
| API reachable, unauthenticated | `GET /v1/projects` | **401** (guard works) |
| API reachable, authenticated | disposable local user + password grant, `GET /v1/projects` | **200**, paginated `rows/total/page/limit/totalPages` |
| Web public routes | `/`, `/auth/login`, `/auth/signup` | **200** |
| Web protected routes | `/dashboard`, `/projects`, `/bom` | **307 → /auth/login** |
| Authenticated render (real Chromium) | `/dashboard`, `/projects` with the repo's session-cookie helper | **200**, `h1 "Workspace overview"` / `h1 "Projects"`, 0 console errors, 0 5xx |
| Repo's own auth e2e | `playwright test e2e/auth.spec.ts` against live server | **6 passed**, 25.8 s |
| Production web | `GET https://thirdcode-erp.vercel.app/api/health` | **200** `{ok:true, revision:"04b3ac5a6139"}`, coreApi 200 |
| Production API | `GET https://third-code-erp-api-production.up.railway.app/ready` | **200** `{status:"ready", database:"ok", redis:"ok"}` |
| Tenant isolation regressions | `pnpm --filter @third-code-erp/database test` against the replayed DB | **94 files / 318 tests passed, 0 failed** (240 env-gated skips) |
| Typecheck | `pnpm typecheck` | **exit 0**, 101 s |

Smoke identities were disposable `@probe.test` users in the local database only.
No real demo request was submitted, no production user was created, and no
credential appears in this report.

---

## 3. Release blockers (why the answer is NO)

### B1 — Production is three weeks behind the fixes the client is paying for
Production runs revision `04b3ac5a6139` (2026-10-04, PR #122). `origin/main` is
at `90c48866` (2026-10-13). The work that makes the system safe for a paying
tenant — server-side write authority on BOM/purchase-order/tender tables, exact
BOM pricing and fractional PO quantities, reserved-stock ledger integrity,
controlled document upload quota, tenant invite provisioning — is **not on
`origin/main` at all**. It exists only as 11 untracked migration files plus 86
untracked files in this working tree.

Concretely: on the deployed build, an invited colleague is provisioned into a
brand-new empty tenant instead of the inviter's tenant (and the server action
then double-inserts `public.users` and errors), and BOM/PO writes are not yet
constrained to server authority. Both are disqualifying on a multi-user trial.

### B2 — The critical slice is uncommitted on one machine
`git status`: HEAD `b3f8a9bc`, **8 commits behind** `origin/main`, 177 modified
files, 86 untracked files, 11 untracked migrations. Nothing on any remote has
this code. A disk failure today loses the entire hardening slice, and there is no
review trail for the client's auditors.

### B3 — The client's tenant does not exist
The seed only creates a local admin (`local-admin@abiops.invalid`) and reference
data. There is no production tenant for the client, no platform-owner bootstrap
run against production, no users/roles, and no opening data (projects, clients,
suppliers, material catalogue, chart of accounts, contracts). Day one of a trial
would otherwise be a data-entry session the client did not buy.

### B4 — No proven backup, and no restore rehearsal
`docs/DEPLOYMENT.md` requires a restore rehearsal before handover; no per-project
backup/PITR configuration or restore evidence exists for this installation. A
trial writes real commercial data (prices, quantities, progress billings). Without
a rehearsed restore, one operator mistake is an unrecoverable business event.

### B5 — No error or uptime monitoring
No Sentry (no `@sentry/*` dependency in any package), no Axiom, no Better Stack,
no alerting route. During a trial the first report of a 500 would come from the
client by phone, days later, with no trace id to investigate.

### Secondary (fix during the first trial week, not blocking)
- **S1** Authenticated feature e2e specs (`complete-route-audit`,
  `branding-authenticated`) need a `DEMO_ROLE_EMAILS` tenant fixture that the
  seed does not create, so CI cannot exercise BOM → procurement → billing flows
  end to end. Auth is covered; the money flows are not.
- **S2** No RA 10173 / data-processing-agreement / retention artefacts in the
  repo. A construction client with subcontractor records will ask during
  procurement review.
- **S3** Statutory surfaces (BIR 2307/VAT basis, retention math, progress
  billing) have no client-finance acceptance run on a real sample month.
- **S4** External providers (email/Resend domain, signature, AI, CAD) are not
  wired for this installation; a trial can start without AI and CAD but needs a
  working outbound email domain for invites.

---

## 4. What to add/fix, in order, with acceptance criteria

| # | Action | Acceptance |
|---|---|---|
| R1 | Commit the working tree as ordered conventional commits on a branch cut from `origin/main` (merge main first — 6 files exist only on main: `CODEOWNERS`, `dependabot.yml`, `e2e.yml`, `notify-discord-deploy.yml`, `SECURITY.md`, one changeset; do not delete them) | `git status` clean; branch contains all 11 migrations; PR open with green CI |
| R2 | Get review + merge to `main`; tag the release | PR merged, CI green on merge commit |
| R3 | Deploy web + API + migrations to production | `/api/health` reports the new revision; `/ready` database+redis ok; prod smoke: login, project list, one BOM line, one PO |
| R4 | Provision the client tenant: platform-owner bootstrap, tenant, 3–5 users with roles, opening data import | Each user logs in and sees only their tenant; cross-tenant read attempt fails |
| R5 | Enable backups/PITR for the production project and rehearse a restore into a scratch project | Restore documented with timestamp and row counts; documented in `docs/DEPLOYMENT.md` |
| R6 | Add monitoring: Sentry (web + api), uptime check on `/api/health` and `/ready`, alert to email/Discord | A forced test error appears in Sentry with `trace_id`; uptime alert fires on a stopped service |
| R7 | Seed the demo-role fixture in CI and make authenticated e2e run on every PR; make `pnpm test` a required check | Authenticated BOM → procurement → billing e2e green in CI |
| R8 | Compliance pack (RA 10173 notice, DPA, retention policy) + client finance sign-off on a sample month (progress billing, retention, 2307/VAT basis) | Signed acceptance sheet from client finance |

Realistic schedule with one engineer: R1–R3 two working days, R4–R6 one to two
days (client data dependent), R7 parallel, R8 client-side.

---

## 5. Gate status and the one red test

`pnpm test` (root, turbo) — **green after one fix**: 4,649 tests passed across
web (2,740), api (1,582), database (318) and operations (9), 0 failed.

The single failure found on the first run:
`apps/web/src/lib/document-intake/deterministic-extractor.test.ts` →
"extracts a real DOCX after removing Mammoth CLI-only dependencies", 8392 ms.
It passes in isolation (239 ms) and its whole file passes (4.75 s); it failed
only while the machine was simultaneously replaying 25 migrations and starting
the Docker stack. Sibling extraction tests in the same file already declare
`30_000` ms budgets; this one did not. Fixed by giving it the same explicit
budget, with a comment recording why, then re-running the full suite green.

Lint: **green** (exit 0, `--max-warnings=0`, 286 s).
Typecheck: **green** (exit 0, 101 s).
Build: **green** (exit 0, 321 s).
Migrations: **green** (25/25 replay from empty database, seed applied).

---

## 6. Recommended trial shape when the blockers are closed

In scope for the pilot (one live project, 3–5 users):
projects → BOM → purchase orders → receiving/stock issue → progress billing →
invoice/receivables, plus documents and approvals.

Deferred to week 2+ of the trial: AI assistant, CAD/DXF import, statutory
exports and filings, client portal, warranty/claims.

Operating conditions: daily check-in with the site team, a named engineer on
call, weekly backup-restore spot check, and a written issue log with a 24-hour
triage commitment.

## 7. If the client insists on starting this week

Then it is a **supervised demonstration, not a trial**: read-only finance, no
statutory filings, no multi-user invites, manual database dump before each
session, and a signed acknowledgement that the invite and BOM/PO authority fixes
are not yet in the deployed build. Anything less puts the down payment at risk of
a failed first impression on the exact flows the client will test first.

---

## 8. One paragraph you can send the client

"The system is built and it works: it covers projects, BOM, procurement,
inventory, progress billing and receivables, and its tenant isolation and access
controls passed this week's regression run (4,649 automated tests including 318
database security tests, with lint, typecheck and production build all green). What is not ready is the
delivery around it. The security hardening we finished is still sitting
uncommitted on the development machine rather than in the released version your
site will use, your company's workspace and users have not been created yet, and
we do not yet have production backups, restore proof or monitoring in place. We
are not going to hand you a trial where an invited colleague lands in an empty
workspace or where a mistaken delete has no restore path. Give us the rest of
this week: we commit and release the hardening, provision your workspace and
users with your opening data, and put backups and alerting in place. We can then
start a supervised pilot on one live project with 3–5 users, and expand from
there once your finance team has signed off on a sample billing month."

---

Prepared by: engineering (Agent 13 / QA), from executed evidence on 2026-10-20.
Related: `docs/changesets/2026-10-20-trial-readiness-verdict.md`,
`docs/changesets/2026-10-20-tenant-invite-provisioning.md`.
