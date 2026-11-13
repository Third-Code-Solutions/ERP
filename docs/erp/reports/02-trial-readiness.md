# 02 · Trial readiness and implementation close (v1.0)

Author: principal engineering lead (orchestrator). Date 2026-11-13. Owner order of 2026-11-13:
"end the Construction ERP implementation and mark it as ready to launch and ready for company
trial phase." This report is the decision record for that order. It follows
[`../STATE.md`](../STATE.md) and replaces the 2026-10-20 verdict, which was never merged. That verdict
exists only on the parked #126 branch, as `docs/qa/2026-10-20-trial-readiness-verdict.md`.

## 1. Verdict

| Question | Answer |
|---|---|
| Is implementation closed? | **Yes. v1 feature freeze from 2026-11-13.** No new module starts until the trial exits (§5). The trial runs `main` at `db4887c0` plus two security fixes: the SEC-10 fix (D0-1, merged as #156, `e708ba2f`) and #147 rebased onto `main` (D0-2, D0-3). That combined tree is the release candidate, and it is the tree the Day-0 gates certify. |
| Ready for the company trial? | **Yes, conditionally: a supervised pilot for Actuate Builders Inc. (ABI), in one tenant, with up to 10 named users.** The first trial user logs in only after Day-0 items D0-1..D0-8 in §4 are done. Two of them carry code: D0-1 (#156, merged; production promotion pending) and D0-3, the reviewed #147. The rest are gates and owner or operator actions. |
| Ready for commercial launch (paid tenants beyond the pilot)? | **No.** The GA gates in §6 are open. CI is blocked by GitHub billing. Money-policy questions Q1–Q10 are unanswered, so the money defects deferred to them (E4) are unfixed. There is no error monitoring and no restore drill. |

Production is healthy. The gates that finished today pass (§2.2); the rest, and the combined release
tree, are certified in D0-2. Two kinds of work remain: two security fixes, and the delivery around the
software: a client tenant that does not exist yet, and the safeguards (smoke test, backup, uptime
alerts) the trial needs before real company data goes in.

## 2. Evidence: what was executed today

All checks ran on 2026-11-13. Gates ran on `main` `db4887c0` with Node 22.23.2 and pnpm 10.33.0, on
the operator workstation. The runtime code at `db4887c0` is byte-identical to live web `ddacfb1b`:
#154 changed only docs.

### 2.1 Production (read-only)

| Check | Result |
|---|---|
| Web `/api/health`, `/api/ready` | 200, revision `ddacfb1b8f63`, database up, Core API dependency 200 |
| API `/health`, `/ready` | 200, database ok, redis ok (API runs `f212c9df`; no API code changed since) |
| CAD worker `/health` | 200 |
| Supabase project | `ACTIVE_HEALTHY`, PostgreSQL 17.6, 52 MB |
| Migration ledger | 180 rows, head `20261104195001`; matches the repository's applied set (STATE) |
| Tenants | 14: `buildops-e2e` (11 users, 5 projects), `third-code-solutions-inc` (1 user, 0 projects), 11 empty `abi-ops-demo-*` and 1 isolation-QA tenant. STATE's 2026-11-04 line counted 12 demo tenants; today's query returns 11. **No ABI client tenant exists.** |
| Auth | 12 users; 0 `platform_user_invitations` ever; 0 `tax_profiles` |
| Vercel production env (names only) | `ERP_TENANCY_ENABLED` is not set, so tax settings are off. Four Core API write switches are set: `ERP_PROJECT_WRITES_VIA_API`, `ERP_OPPORTUNITY_STAGE_WRITES_VIA_API`, `ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API` and `ERP_DAILY_TASK_COMPLETION_WRITES_VIA_API`. A switch applies only to the tenants in its `_TENANT_IDS` list (`tenantEnabledForCoreApi` treats an empty list as off; `*` is allowed). No code on `main` reads `ERP_PROJECT_WRITES_VIA_API` (only `docs/ENVIRONMENT_VARIABLES.md` names it), so it is stale. The other three have lists, whose values were not read. Whether the ABI tenant gets the Core API paths is decided in D0-5 |
| Supabase security advisors | 0 ERROR. WARN: 11 `SECURITY DEFINER` helpers executable by `authenticated` (permission predicates and the invite activation RPC); `enforce_docuseal_submission_id_uniqueness` executable by `anon` (a trigger function); `vector` in `public`; **leaked-password protection off**. INFO: 4 tables with RLS and no policy (3 in the Cortex backup schema, plus `project_retirement_requests`) |
| GitHub org | Free plan. Actions jobs are refused for billing |

### 2.2 Release-candidate gates on `main` `db4887c0`

The run started at 09:37Z. Claude Code stopped it about 30 minutes later because the workstation ran
critically low on memory, so the gates are **partial**.

| Gate | Result |
|---|---|
| Typecheck: shared-types, auth, database, operations, api, web | **6/6 pass** (exit 0) |
| Unit: shared-types | **729/729 pass** (96 files) |
| Unit: operations | **14/14 pass** (3 files) |
| Unit: database | **333 pass**, 0 fail; 215 skipped because they need a database (`DATABASE_URL` unset) |
| Lint (`eslint --max-warnings=0`, 7 packages) | **Not concluded.** ESLint exited 2 before linting: it could not load `eslint-plugin-react-hooks`. The shell's working directory `D:\thirdcode\erp` differs in case from pnpm's store path `D:\thirdcode\ERP`. This is an environment fault, not a lint finding |
| Unit: api | **Interrupted.** `project-comments.controller.spec.ts` › "requires an idempotency key before reaching Core" timed out at 65 s while memory was short. The run was then stopped |
| Unit: web; CI contract gates; `pnpm audit --prod`; api and web builds | **Not reached** |

Earlier evidence (from STATE):
- Before the 2026-11-13 web promotion of `ddacfb1b`, lint, the web typecheck and the web unit suite
  (2,889 passed, 6 skipped) passed on a clean checkout of `main`. That checkout has the same runtime code.
- On 2026-11-13 the #144 branch at `f45a0a0a` passed lint, the web and API typechecks and the unit
  suites (API 1,622, web 3,014). That branch is `main`'s code plus #144's changes.

Not run, and why:
- **GitHub Actions CI** is blocked: every job is refused with "recent account payments have failed or
  your spending limit needs to be increased" (main CI run 43379471191). The last CI run that executed on
  `main` was for `8293f798` (2026-11-04, success). Every run from `5d223726` on was refused.
- **Database suites, migration replay from zero, and E2E**: they need PostgreSQL and a browser target.
  This workstation has no Docker (no hardware virtualization) and no local PostgreSQL. The last
  full-database evidence is from 2026-11-11, on rebuilt local databases: #147 branch, verifier 183
  migrations, database suite 111 files / 576 tests (STATE).
- **`smoke-prod.yml` and the release E2E suites**: their credentials are GitHub secrets only. Last
  green smoke: run 41823866906 on `8293f798` (2026-11-04). **The live web revision `ddacfb1b` has never
  been smoke-tested**, and the fixed invite path (#151) has never run in production.

## 3. Open risks at the freeze

| ID | Risk | Severity for the pilot | Disposition |
|---|---|---|---|
| E1 | `audit_log` is readable through the Supabase client by every signed-in user of a tenant: row images with budgets, vendor contacts, stock movements. `audit.read` is enforced only in server code | High: same-tenant confidentiality, with real budgets in the trial | **Day-0 fix:** #147 (security PASS, code APPROVE) revokes client SELECT and forces RLS. D0-3 |
| E2 | Two routes parse untrusted workbooks in-process on the request thread. (a) The takeoff import (`/api/bom/takeoff-import`, `bom.generate`) uses ExcelJS; it is the only reachable ExcelJS reader, since `parseTogalFile` and `extractScopeFromVisual` have no production caller. (b) Document intake (`/api/upload/complete`, `document.manage`, held by 12 of 13 roles) uses SheetJS 0.20.3. `XLSX.read` parses the whole workbook before the 100,000-cell text cap applies, and the local parser accepts files up to 25 MB. A crafted workbook can pin a web function until the platform timeout | Medium: availability only, no data exposure; needs a signed-in user | **Accepted for the pilot only after public sign-up is off (D0-5), so only invited users reach these routes.** Time-boxed to 2026-12-15. Closure: #144 for (a), and a new isolated-reader fix for (b); #144 does not touch (b). If it fires, or if either path is still open on 2026-12-15: deploy a stop-gap that refuses `.xlsx` at the open route (CSV and PDF stay accepted). The takeoff route logs nothing before parsing, so the response does not depend on identifying the uploader |
| E3 | Cortex nodes of deleted rows keep their old attributes, including vendor email, phone and address, which every tenant role can query | Medium: same-tenant personal data | **Day-0 fix:** #147's scrub, per `docs/runbooks/cortex-substrate.md` on that branch. D0-3 |
| E4 | Money policy Q1–Q10 is unanswered. Deferred to it: D-1, D-2, D-3, the VAT-on-H part of D-4, D-6 recoupment, D-7, D-9, D-10, D-11 and D-12. Also open: D-16 (P3, requisition-to-PO flooring). Already live: D-4 PO footing and rate-card pricing, D-5, the D-6 cap, D-8, D-13, D-14 and D-15. Example of the risk: D-2 can put VAT inside H and add VAT again on the invoice | High if the numbers are used as the books | **Trial rule R1:** billing, invoices, VAT, EWT, retention and BIR 2307 run in parallel with ABI's current process and are never the system of record until §6 G2 is met |
| E5 | CI is blocked, so every fix merges under the owner override with local gates only | Medium: process risk | Week-1 owner action: apply the GitHub Team upgrade (already chosen; the org is on the free plan) |
| E6 | No error monitoring (no Sentry), no uptime alerting, no restore drill. The last full dump is `20261104T055240Z` | High for a trial holding real data | Day-0: fresh backup and uptime alerts (D0-6, D0-7). Week 1: restore drill and error monitoring (G3) |
| E7 | SEC-M7: five Cortex mirror functions copy 11 finance, cash, bank and inventory tables by denylist, without redaction | Low for a single-tenant pilot (same-tenant only) | Owner and date set at GA (G4) |
| E8 | The invite fix B1 is live but has never run. The #151 Medium (a sign-up racing an invite) and the any-age `pending` Low are open. "Confirm email" is necessary but not sufficient (STATE) | Medium | D0-5: public sign-up off, which stops any self-sign-up from binding to a pending invitation; "Confirm email" on; a supervised first invite |
| E9 | SEC-10 (baseline, suspected): five readers in `'use server'` modules take `tenantId` from the caller, with no session check: `listProjectVos`, `getVoById`, `loadProgressContext`, `getLatestPprf` and the portal `logView`. They are registered as server actions; their ids are not in client bundles today | Medium: cross-tenant read of the first real client's variation orders, progress and PPRF pricing if an action id is learned | **Day-0 fix:** D0-1 moves them out of `'use server'` modules (#156, merged as `e708ba2f`). A guard test keeps any server-action export from taking `tenantId`, `actorId`, `userId` or `role`. Production is fixed only once D0-1 is promoted, and stays fixed only if no web rollback goes to a deployment that predates it (D0-1, D0-4) |
| E10 | Public self-sign-up, if on in production, creates an active tenant whose user is `admin`, holding `bom.generate` and `document.manage` (`20260729054456`). The production setting is not recorded | Medium: it turns E2 and E9 from insider risks into internet risks | D0-5: turn public sign-up off. Both invite paths use the Auth admin API; the supervised first invite proves they still work |
| E11 | Lows: SEC-14 (refreshed auth cookies lack `Secure`; HSTS mitigates); SEC-16 (`auth_can_read_cortex_subject` is a cross-tenant existence oracle); MFA is not enforced for any role (the historical PRD in root `CLAUDE.md`, §10.2, requires it for Owner and Admin, and requires a breached-password check) | Low for the pilot | G4 |

## 4. Day-0 checklist (all done before the first trial user logs in)

| # | Item | Who | Acceptance |
|---|---|---|---|
| D0-1 | SEC-10 fix (E9), PR #156: move the five readers to `server-only` modules, or remove them where unused, and add the invariant check. Then promote web at the D0-1 merge commit on its own, before D0-3, so that a post-D0-1 deployment exists to roll back to. Record the Vercel Deployment Protection mode; if generated URLs of older production deployments are public, the owner decides whether to protect or delete them, since they still serve the E9 readers | Agent; the owner decides on old deployments | Security PASS and code APPROVE on the PR; local gates green; merged (done: `e708ba2f`). The promoted deployment id and the protection mode are recorded in STATE |
| D0-2 | Rebase #147 onto `main` after D0-1; its branch predates #151 and #152. Then run the full gates on that tree: lint (from `D:\thirdcode\ERP`), typecheck, every unit suite, the database suite and migration replay on a rebuilt PostgreSQL 17, the CI contract gates, `pnpm audit --prod`, and the api and web builds. Use a machine with enough memory, or CI once Actions runs | Agent | All exit 0 on the rebased #147 head; security PASS and code APPROVE renewed on that head; results added to §2.2 |
| D0-3 | Roll out #147, per the runbook on its branch: <br>• a fresh backup of the Cortex tables and `audit_log`; <br>• the preflight (the runtime role is superuser or BYPASSRLS); <br>• the three migrations, with #147 merged directly after; <br>• the backfill dry-run, then the backfill at page size 50; <br>• the scrub until every table reports changed 0 and skipped 0, with embed jobs paused during it (#147 security LOW-1); <br>• deploy web, and approve the Railway API deployment | Agent executes; the owner stays at the screen for the Supabase connector confirmations (they expired twice on 2026-11-12) and the Railway approval | Client `SELECT` on `audit_log` denied for `authenticated`; scrub report all zero; `/api/health` reports the new revision; 0 ERROR-level findings from the Supabase security advisors; `erp_backup_20261112` dropped once verified. The fresh pre-scrub backup holds every tenant's unredacted audit rows, so it is kept encrypted, never in the repo, with its location and a delete date (trial exit plus 30 days) recorded in STATE |
| D0-4 | On the post-D0-3 revision: authenticated production smoke, plus the cross-tenant isolation spec `production-cross-tenant-isolation.spec.ts` (smoke alone covers only auth, dashboard and console). Web rollback target from here on: the D0-1 deployment recorded in STATE. Confirm in D0-3 that it runs on the post-#147 schema. Never roll web back to a deployment that predates D0-1 (it brings back E9), nor to `f212c9df` (it brings back invite defect B1) | Owner runs both with the `buildops-e2e` credentials (locally, or through the workflows once Actions runs). A local cross-tenant run needs the production service-role key: it lives only in that shell's environment for that run, is never written to a file or committed, and the shell is closed afterwards | Both pass. The cross-tenant spec runs with `E2E_CROSS_TENANT_PROOF=1` and reports passed, not skipped |
| D0-5 | Provision the ABI tenant in `/platform-admin/tenants`. In Supabase Auth: public sign-up off; "Confirm email" on, with working Auth email (SMTP); leaked-password protection on if the plan offers it; if it does not, record that and set the minimum password length to 12. Check the Auth URL configuration: the Site URL is the production web URL, the redirect allowlist holds only exact production URLs with no broad wildcard, and the email templates build their links from the Site URL. Without this, a password-reset email can carry its token to another host, and turning sign-up off does not prevent it. Decide whether to add the ABI tenant id to the `*_VIA_API_TENANT_IDS` allowlists. Then a supervised first invite | Owner, with the agent observing read-only | The invitee lands in the ABI tenant with the intended role; no new tenant is created; the invitation row is bound; a public sign-up attempt is refused; the Auth settings and URL configuration are recorded in STATE |
| D0-6 | A fresh full production backup before ABI enters data. Until Actions runs, the owner runs the three `supabase db dump` commands of `backup-production.yml` (roles, schema, data) locally, with the database URL from the Supabase dashboard, onto an encrypted volume. Nothing is committed or uploaded (RUNBOOK §3) | Owner (workflow: agent) | Dump time and SHA-256 sums recorded in STATE |
| D0-7 | Uptime alerts on web `/api/health`, API `/ready` and CAD `/health`, to the Discord deploy channel or email. Free tier only; no new paid service | Owner creates the monitor account; agent configures | A stopped check raises an alert |
| D0-8 | Trial operating rules (§5) accepted by the owner and ABI's sponsor | Owner | Written acceptance, linked in STATE |

## 5. Trial shape

**Scope.** One ABI tenant, up to 10 named users, one or two live projects. Flows in use: CRM pipeline →
project → BOM/BOQ → purchase orders → receiving and stock → site progress → progress billing and invoices
(parallel run only, R1) → documents, approvals, tasks and dashboards.

**Off for the pilot:** tax settings (`ERP_TENANCY_ENABLED` unset) and the roadmap tax statutory outputs.
No flag hides a whole module (gap report, preamble). Scope is therefore held by the rules below and by
role assignment, not by code.

**Operating rules.**
- **R1, parallel run:** every peso amount the ERP produces for billing, VAT, EWT, retention or BIR 2307 is
  checked against ABI's current process and never filed or sent to a client from the ERP until §6 G2
  is met.
- **R2, freeze.** Three kinds of change merge to `main` during the trial:
  - fixes for defects found in the trial;
  - Day-0 items;
  - work on GA gates G1–G6, including a money-defect fix once its policy question is answered.

  Each needs security PASS and code APPROVE, plus local gates while CI is blocked. #144, #146 and #149
  continue on their branches and merge only after G1. #144 and #146 have no feature flag. #149 ships
  behind its own flag `ERP_CATALOGUE_ENABLED` (default off).
- **R3, support:** one named on-call engineer, and a written issue log with 24-hour triage. Severities:
  - SEV-1: production down, data loss or a security breach. Page on-call at once.
  - SEV-2: a trial flow broken. Respond within 1 hour.
  - SEV-3: degraded. Respond within 4 hours.
  - SEV-4: cosmetic. Backlog.

  A SEV-1 follows `docs/erp/RUNBOOK.md` §2: roll back web first, never the database.
- **R4, data safety:** a backup before every production migration, as before (RUNBOOK §3), and a weekly
  backup during the trial.
- **R5, workbooks:** prefer CSV for takeoff imports while E2 is open. An upload that hangs is a SEV-2 and
  triggers the E2 stop-gap.

**Exit after 4 weeks**, or earlier on the owner's call, when all of these hold:
- 0 open SEV-1, and every SEV-2 fixed;
- ABI's finance team has compared one sample billing month under R1;
- §6 G1, G2 and G3 are met.

## 6. Gates for commercial launch (GA)

| # | Gate | State on 2026-11-13 |
|---|---|---|
| G1 | CI restored and green on `main`; branch protection on; `smoke-prod.yml` and the release E2E suites, including the cross-tenant isolation spec, green on the live revision | Blocked: GitHub Team upgrade chosen, not applied |
| G2 | Q1–Q10 answered; every E4 money defect fixed (D-16 included), with worked examples as tests; ABI finance signs a sample billing month | Q1–Q10 open since 2026-11-04 |
| G3 | E2 closed on both paths (#144 and the intake reader fix); restore drill into a scratch database recorded; error monitoring (Sentry or equal) live | Open |
| G4 | SEC-M7 redaction; `SECURITY DEFINER` helper review; SEC-14 and SEC-16; MFA for Owner and Admin (enrolment plus an `aal2` check: today the code has neither); a session timeout and refresh-token lifetime (the historical PRD sets a 12-hour idle limit; none is implemented); identity fields inside object-shaped server-action parameters added to the SEC-10 guard; role checks on the BOM supplier readers in `bom/actions.ts` (same-tenant); a contract release that drops the unreachable write policies (SEC-01/02 residuals) | Open |
| G5 | Lawyer's confirmation of the clean-room approach before selling (STATE, licensing decision); RA 10173 pack (privacy notice, DPA, retention policy) | Open |
| G6 | Decide the parked work. #126: reserved-stock integrity (ADR-042) and upload quota (ADR-043). #121: award task scope. Both #126 and #121 carry migrations that must be restamped. #127 (turnover polish) has no migrations. Also Dependabot #145 | Parked |

## 7. Work parked by the freeze

- Mandate PHASE 2 module queue: `approvals` → `contacts` → `cost-db` → `assemblies` → `boq` → `contracts`.
- Cortex coverage batch 2 (deal management).
- #144 (BOQ Excel, fix loop 8), #146 and #149 (catalogue; they need the owner's licensing answers).
  They continue on their branches under R2.
- #121, #126, #127 and #145, as in G6.

## 8. Release identity at the freeze

| Surface | Revision | Rollback target |
|---|---|---|
| Web (Vercel) | `ddacfb1b` (deployment `thirdcode-jzhgfv5c9`) Until the D0-1 promotion: `thirdcode-31jl07njo` (`f212c9df`), SEV-1 only, because it brings back invite defect B1. From the D0-1 promotion on: that D0-1 deployment, never one older (E9) |
| API (Railway) | `f212c9df` | `aa79f2b7` (`c45bc64c`) |
| CAD worker | `8293f798` | unchanged since |
| Database | ledger 180, head `20261104195001` | never rolled back; fix forward |

Tags:
- `v1.0.0-rc.1` goes on the `main` commit that holds D0-1 and #147, once D0-2's gates pass.
- `v1.0.0-trial` goes on the commit that records D0-1..D0-8 as done in STATE.
- This report carries no tag. The freeze is marked here and in STATE.
