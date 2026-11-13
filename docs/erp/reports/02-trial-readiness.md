# 02 · Trial readiness and implementation close (v1.0)

Author: principal engineering lead (orchestrator). Date 2026-11-13. Owner order of 2026-11-13:
"end the Construction ERP implementation and mark it as ready to launch and ready for company
trial phase." This report is the decision record for that order. It follows
[`../STATE.md`](../STATE.md) and replaces the 2026-10-20 verdict, which was never merged. That verdict
exists only on the parked #126 branch as `docs/qa/2026-10-20-trial-readiness-verdict.md`.

## 1. Verdict

| Question | Answer |
|---|---|
| Is implementation closed? | **Yes. v1 feature freeze from 2026-11-13.** The trial scope is the code on `main` at `db4887c0`. No new module starts until the trial exits (§6). |
| Ready for the company trial? | **Yes, conditionally: a supervised pilot for Actuate Builders Inc. (ABI), in one tenant, with up to 10 named users.** The first trial user logs in only after the seven Day-0 items in §4 are done. None of them needs new product code. D0-0 finishes the release-candidate gates that a memory shortage cut short today. D0-1 is a reviewed PR, #147, that needs only its production apply. The rest are owner or operator actions. |
| Ready for commercial launch (paid tenants beyond the pilot)? | **No.** The GA gates in §6 are open: CI is blocked by GitHub billing, the money-policy questions Q1–Q10 are unanswered, the deferred money defects D-1..D-12 are unfixed, and there is no monitoring and no restore drill. |

The software is not what holds the trial back. Production is healthy and the code passes its own gates
(§2). What remains is the delivery work around it: one security fix waiting for its production apply,
a client tenant that does not exist yet, and operating safeguards (smoke test, backup, uptime alerts) that
the trial has to have before real company data goes in.

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
| Tenants | 14: `buildops-e2e` (11 users, 5 projects), `third-code-solutions-inc` (1 user, 0 projects), 11 empty `abi-ops-demo-*` and 1 isolation-QA tenant. **No client tenant exists.** |
| Auth | 12 users; 0 `platform_user_invitations` ever; 0 `tax_profiles` |
| Supabase security advisors | 0 ERROR. WARN: 11 `SECURITY DEFINER` helpers executable by `authenticated` (boolean permission predicates and the invite activation RPC, by design); `enforce_docuseal_submission_id_uniqueness` executable by `anon` (a trigger function, so a direct RPC call errors); `vector` in `public`; **leaked-password protection off** (the historical PRD in root `CLAUDE.md`, §10.2, requires a breached-password check). INFO: 4 tables with RLS and no policy (3 in the Cortex backup schema, `project_retirement_requests`) |

### 2.2 Release-candidate gates on `main` `db4887c0`

The run started at 09:37Z. Claude Code stopped it about 30 minutes later because the workstation ran
critically low on memory, so the gates are **partial**.

| Gate | Result |
|---|---|
| Typecheck: shared-types, auth, database, operations, api, web | **6/6 pass** (exit 0) |
| Unit: shared-types | **729/729 pass** (96 files) |
| Unit: operations | **14/14 pass** (3 files) |
| Unit: database | **333 pass**, 0 fail; 215 skipped because they need a database (`DATABASE_URL` unset) |
| Lint (`eslint --max-warnings=0`, 7 packages) | **Not concluded.** ESLint exited 2 before linting: it could not load `eslint-plugin-react-hooks`, because the shell's working directory `D:\thirdcode\erp` differs in case from pnpm's store path `D:\thirdcode\ERP`. This is an environment fault, not a lint finding |
| Unit: api | **Interrupted.** `project-comments.controller.spec.ts` › "requires an idempotency key before reaching Core" timed out at 65 s while memory was short; the run was then stopped |
| Unit: web; CI contract gates; `pnpm audit --prod`; api and web builds | **Not reached** |

Earlier evidence on the same runtime code (from STATE): before the 2026-11-13 web promotion of
`ddacfb1b`, lint, the web typecheck and the web unit suite (2,889 passed, 6 skipped) passed on a clean
checkout of `main`. On 2026-11-13 the #144 branch at `f45a0a0a`, which contains `main`, passed lint, the
web and API typechecks and the unit suites (API 1,622, web 3,014).

Not run, and why:
- **GitHub Actions CI** is blocked: every job is refused with "recent account payments have failed or
  your spending limit needs to be increased" (main CI run 43379471191, 2026-11-13). No CI has run on
  `main` since `5d223726`.
- **Database suites, migration replay from zero and E2E**: they need PostgreSQL and a browser target.
  This workstation has no Docker (no hardware virtualization) and no local PostgreSQL. The last
  full-database evidence is from 2026-11-11, on rebuilt local databases: #147 branch, verifier 183
  migrations, database suite 111 files / 576 tests (STATE).
- **`smoke-prod.yml` and the release E2E suites**: their credentials exist only as GitHub secrets.
  Last green smoke: run 41823866906 on `8293f798` (2026-11-04). **The live web revision `ddacfb1b` has
  never been smoke-tested,** and the fixed invite path (#151) has never been exercised in production.

## 3. Open risks at the freeze

| ID | Risk | Severity for the pilot | Disposition |
|---|---|---|---|
| E1 | `audit_log` is readable through the Supabase client by every signed-in user of a tenant (row images with budgets, vendor contacts, stock movements). `audit.read` is enforced only in server code. | High: same-tenant confidentiality; real budgets go in during the trial | **Day-0 fix:** #147 (security PASS, code APPROVE) revokes client SELECT and forces RLS. Item D0-1 |
| E2 | The takeoff import (`/api/bom/takeoff-import`) parses `.xlsx` with ExcelJS on the request thread. A crafted workbook from a user holding `bom.generate` can pin a web function until the platform timeout. Traced today: this is the only reachable in-process ExcelJS reader. Togal and the vision spreadsheet readers have no production caller, and document intake uses SheetJS 0.20.3, which caps the cells it reads. | Medium: availability only, no data exposure; needs an authenticated, malicious insider | **Accepted for the pilot, time-boxed** to whichever comes first: #144 merge or 2026-12-15. Response if it fires: identify the user from Vercel logs, suspend the account, redeploy |
| E3 | Cortex nodes of deleted rows keep their old attributes, including vendor email, phone and address, which every tenant role can query | Medium: same-tenant PII | **Day-0 fix:** #147's scrub, per `docs/runbooks/cortex-substrate.md` on that branch. Item D0-1 |
| E4 | Money policy Q1–Q10 is unanswered, so D-1, D-2, D-3, D-6 (recoupment), D-7, D-9, D-10, D-11 and D-12 are unfixed. Example: D-2 can put VAT inside H and add VAT again on the invoice. | High if the numbers are used as the books | **Trial rule R1:** billing, invoices, VAT, EWT, retention and BIR 2307 run in parallel with the company's current process and are never the system of record until §6 G2 is met |
| E5 | CI is blocked, so every fix during the trial merges under the owner override with local gates only | Medium: process risk | Owner applies the GitHub Team upgrade (already chosen) in week 1. Item W1-1 |
| E6 | No error monitoring (no Sentry), no uptime alerting, no restore drill; the last full dump is `20261104T055240Z` | High for a trial holding real data | Day-0: fresh backup and uptime alerts (D0-4, D0-5). Week 1: restore drill and error monitoring |
| E7 | SEC-M7: five Cortex mirror functions copy 11 finance, cash, bank and inventory tables by denylist, without redaction | Low for a single-tenant pilot (same-tenant only) | Owner and date set at GA (§6 G4) |
| E8 | B1 invite fix is live but unexercised; the #151 Medium (a sign-up racing an invite) depends on "Confirm email" being on | Medium | D0-3: confirm the setting, then a supervised first invite |

## 4. Day-0 checklist (all done before the first trial user logs in)

| # | Item | Who | Acceptance |
|---|---|---|---|
| D0-0 | Finish the release-candidate gates that §2.2 left partial: lint (run from `D:\thirdcode\ERP`), the API and web unit suites, the CI contract gates, `pnpm audit --prod`, and the api and web builds. Use a machine with enough free memory, or CI once Actions runs | Agent | All exit 0; results added to §2.2 |
| D0-1 | Roll out #147: fresh Cortex and `audit_log` backup, runbook preflight (the runtime role is superuser or BYPASSRLS), the three migrations, merge #147 directly after, backfill dry-run, page-size-50 backfill, scrub until every table reports changed 0 and skipped 0, embed jobs paused during the scrub (#147 security LOW-1), then deploy web | Agent executes; the owner stays at the screen for the Supabase connector confirmations (they expired twice on 2026-11-12) | Client `SELECT` on `audit_log` denied for `authenticated`; scrub report all zero; `/api/health` reports the new revision; drop `erp_backup_20261112` once verified |
| D0-2 | Authenticated production smoke on the live revision | Owner (runs `pnpm smoke:prod` locally with the `buildops-e2e` credentials, or `smoke-prod.yml` once Actions runs) | Smoke passes. Rollback target if it fails: `thirdcode-31jl07njo` (`f212c9df`) |
| D0-3 | Provision the client tenant in `/platform-admin/tenants`. Turn on Supabase Auth "Confirm email" and leaked-password protection. Make the first invite a supervised test | Owner, with the agent observing read-only | The invitee lands in the client tenant with the intended role; no new tenant is created; `platform_user_invitations` row bound |
| D0-4 | Fresh full production backup before the client enters data | Agent (`backup-production.yml` when Actions runs; until then a Supabase dashboard backup by the owner) | Backup id and time recorded in STATE |
| D0-5 | Uptime alerts on web `/api/health`, API `/ready` and CAD `/health`, to the Discord deploy channel or email. Free tier only; no new paid service | Owner creates the monitor account; agent configures | A stopped check raises an alert |
| D0-6 | Trial operating rules (§5) accepted by the owner and the client's sponsor | Owner | Written acceptance, linked in STATE |

## 5. Trial shape

**Scope.** One client tenant, up to 10 named users, one or two live projects. Flows in use: CRM pipeline →
project → BOM/BOQ → purchase orders → receiving and stock → site progress → progress billing and invoices
(parallel run only, R1) → documents, approvals, tasks and dashboards.

**Off for the pilot** (flags stay at their documented defaults): `ERP_TENANCY_ENABLED` (tax settings),
`ERP_CATALOGUE_ENABLED`, and the roadmap tax statutory outputs. No flag hides a whole module
(gap report §1), so scope is held by the rules below and by role assignment, not by code.

**Operating rules.**
- **R1, parallel run:** every peso amount the ERP produces for billing, VAT, EWT, retention or BIR 2307 is
  checked against the company's current process and never filed or sent to a client from the ERP until
  §6 G2 is met.
- **R2, freeze:** only fixes for defects found in the trial merge to `main`. Each needs security PASS and
  code APPROVE, plus local gates while CI is blocked. #144, #146 and #149 continue on their branches and
  ship behind their flags only after G1.
- **R3, support:** one named on-call engineer and a written issue log with 24-hour triage. Severities:
  SEV-1 = production down, data loss or a security breach (page on-call at once); SEV-2 = a trial flow
  broken (respond within 1 hour); SEV-3 = degraded (4 hours); SEV-4 = cosmetic (backlog). A SEV-1
  follows `docs/erp/RUNBOOK.md` §2: roll back web first, never the database.
- **R4, data safety:** a backup before every production migration, as before (RUNBOOK §3), and a weekly
  backup during the trial.
- **R5, takeoff files:** prefer CSV for takeoff imports while E2 is open; a `.xlsx` that hangs the upload
  is reported as a SEV-2.

**Exit after 4 weeks**, or earlier on the owner's call: 0 open SEV-1, every SEV-2 fixed, the client's
finance team has compared one sample billing month against R1, and §6 G1–G3 are met.

## 6. Gates for commercial launch (GA)

| # | Gate | State on 2026-11-13 |
|---|---|---|
| G1 | CI restored and green on `main`; branch protection on; `smoke-prod.yml` and the release E2E suites green on the live revision | Blocked: GitHub Team upgrade chosen, not applied |
| G2 | Q1–Q10 answered; D-1..D-12 fixed with worked examples as tests; client finance signs a sample billing month | Q1–Q10 open since 2026-11-04 |
| G3 | E2 closed (#144 merged), restore drill into a scratch database recorded, error monitoring (Sentry or equal) live | Open |
| G4 | SEC-M7 redaction; `SECURITY DEFINER` helper review; contract release that drops the unreachable write policies (SEC-01/02 residuals) | Open |
| G5 | Lawyer's confirmation of the clean-room approach before selling (STATE, licensing decision); RA 10173 pack (privacy notice, DPA, retention policy) | Open |
| G6 | Decide the parked work: re-port #126's reserved-stock integrity (ADR-042) and upload quota (ADR-043), #121 award task scope and #127 turnover polish (all need restamped migrations), and Dependabot #145 | Parked |

## 7. Work parked by the freeze

- Mandate PHASE 2 module queue: `approvals` → `contacts` → `cost-db` → `assemblies` → `boq` → `contracts`.
- Cortex coverage batch 2 (deal management).
- #144 (BOQ Excel, fix loop 8), #146 and #149 (catalogue; need the owner's licensing answers). They
  continue on their branches under R2.
- #121, #126, #127 and #145, as in G6.

## 8. Release identity at the freeze

| Surface | Revision | Rollback target |
|---|---|---|
| Web (Vercel) | `ddacfb1b` (deployment `thirdcode-jzhgfv5c9`) | `thirdcode-31jl07njo` (`f212c9df`). A rollback brings back invite defect B1 |
| API (Railway) | `f212c9df` | `aa79f2b7` (`c45bc64c`) |
| CAD worker | `8293f798` | unchanged since |
| Database | ledger 180, head `20261104195001` | never rolled back; fix forward |

The merge commit of this report is tagged `v1.0.0-rc.1`, the trial release candidate. Its runtime code
is that of `db4887c0`, because this report changes only docs. The tag `v1.0.0-trial` goes on the commit
that records D0-0..D0-6 as done in STATE. That commit will carry #147.
