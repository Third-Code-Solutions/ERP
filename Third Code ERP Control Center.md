# Third Code ERP Control Center

## Latest Cortex deployment — 2026-09-05 21:14 +08:00

PR41 merged and deployed at614395fc3b963f23d0acf141ff7b16916db4f703.
Live Cortex UI is verified: focused browser PASS9.6s, hosted E2E10/10, health200.
Provider IDs in Deployment Record. Workflow33967263740 is FAILED only after
deployment on password-recovery email429, proven by Supabase Auth logs.
Password-rotation step skipped. No whole-workflow-green claim. No pending local
verification sessions; original user drafts preserved. Next unresolved item is
provider recovery verification after quota resets, not redeploying the Cortex UI.

## Cortex UI handoff — 2026-09-05 20:21 +08:00

Latest request: repair the entire Cortex UI/UX from the live screenshot. Implemented
in isolated `D:\thirdcode\ERP-route-release-20260904`, branch
`codex/cortex-workspace-ux`, commitbe37296a2f9410d0514ab6ee0484b4d22a999d30.
Pushed PR41: https://github.com/Third-Code-Solutions/ERP/pull/41 . Worktree clean.
Not merged/deployed; earlier production9a6b87816499 remains the live release.

PASS133 Cortex tests,1782 full Web tests plus2DB-gated tests separately, final
root lint, E2E types, final Web production build, staged gitleaks. Browser52.2s
passed at320/390/768/1024/1440 with no console errors/external/indexing requests.
Source/graph density fixtures are synthetic; local PostgreSQL/Auth route is real.
No business data deleted. No permissions, provider, billing or schema changes.
Current screenshots and complete evidence are recorded in the changeset and
handoff docs in the isolated worktree. No running task verification processes.
Next release step, if requested: check PR41 CI and follow protected release flow.

## FINAL live release — 2026-09-05 19:35 +08:00

Latest request delivered within stated scope: no subscription billing; connect
existing project invoice/payment workflows, integration configuration status and
saved notification presentation preferences. Finance tab removal and Settings
team entry included. PR38/39/40 pushed and normally merged after required CI.

Production9a6b87816499f226c671a9038229baf5e40e9d54, workflow33962508262 SUCCESS.
VercelREADY dpl_CUHqH35dVyQgSwnrf6XANdjWqvoF at https://thirdcode-erp.vercel.app .
Railway CAD deployedf4f5085a-90fa-4dd7-bb20-bbd1fd290a50; API healthy predecessor
retained after exact source/config equivalence. Full provider IDs/rollback in
Deployment Record. No database migration/restoration, paid upgrade or money transfer.

PASS local31Settings tests,1773Web+2separateDB tests,10Core finance tests,
lint/types/build, five-width real browser proof, all required PR/main CI.
PASS mandatory production10/10 authenticated tests plus recovery and controlled
password rotation/restoration. PASS live Settings canary24.9s with restored test
preferences. PASS final audit2tests4.8min:132pages=105renders+27guards;35handlers
inventoried,20GET probes,15mutation-only NOT RUN. Revision stable9a6, zero direct
page console/runtime errors. Local release worktree clean and identical tree to main.

External email/SMS provider setup remains missing, Resend question unanswered.
Integration panel is status/configuration-presence, not full connectivity proof.
Known prior P3 React419 on missing-record breadcrumb navigation remains uncorrected;
direct-page audit does not certify it. DraftPR32/user dirty work excluded.
See Verification Ledger, Route Ledger, Access Matrix and Defect Register for bounds.


## ACTIVE — 2026-09-05 18:59 +08:00

UPDATE19:08: PR40 CI33962033668 SUCCESS (all9 required jobs); normal squash
merge9a6b87816499f226c671a9038229baf5e40e9d54. Production workflow33962508262
dispatched on exactmainSHA, normal production environment approval next.
Branch4fc47c6a tree identical to main. Temporary Redis stopped. Live canary ready
in ignored apps/web/e2e/tmp/settings-production-release.spec.ts; use original
workspace's three Supabase keys via process env only (never print values),
PLAYWRIGHT_BASE_URL exactproduction, EXPECTED_RELEASE_REVISION=9a6b87816499.
It tests and restores the controlled admin's preferences; no payment writes.
Then rerun complete-route-audit.spec.ts with stable revision. No Resend reply yet.

Latest request: no subscription billing; project invoices/payments, integrations,
notifications; merge/push/deploy pending changes. PR38 (Finance strip removal)
merged1bbb83d6 and PR39 (team Settings) merged23f99ea5 after all CI passed.
New PR40 https://github.com/Third-Code-Solutions/ERP/pull/40 at4fc47c6a,
CI33962033668 running. Release worktree D:/thirdcode/ERP-route-release-20260904,
branch codex/settings-project-operations clean. No production promotion yet;
live remains healthy e8c1b481607c; Vercel rollbackdpl_HzoczMLJJimE6kdUU5ig9oSJiznr.

Implemented Settings links to existing project-finance workflows, restricted
redacted Web integration presence (NOT connectivity), own-account notification
display preferences persisted via Auth metadata and used by real bell, mobile
panel clipping fix. No email/SMS delivery suppression or subscription changes.
Missing Resend setup raised asynchronously; user reply pending. Do not invent
credentials or upgrade a provider. Original dirty workspace/draftPR32 preserved.

PASS1773 Web tests,2 separately run local database integrations,10Core finance
tests,31focused tests, lint/types/static gates, Core build. Local browser passed
save/reload/filter/read/audit/tenant isolation;0errors and bounds320/390/768/1024/1440.
Initial cold startup failures preserved; fixture boot budget120→240s, assertions
unchanged; final36.3s. Temp Redis erp-settings-redis-20260905 port6391 remains
running for local tests; do not touch other projects' containers. No active local
test sessions. Next: wait PR40 CI, normal squash merge, guarded production workflow,
approve only normal named environment gate, verify live Settings and full route audit.

## FINAL HANDOFF — 2026-09-05 18:07 +08:00

Production release e8c1b481607c is live and verified by promotion33958563228,
PR37CI33958056837 and mainCI33958553891 (all successful). Journal collection404
fixed through normal PR37. VercelREADY; API retained with identical-source/config
proof and healthy; CAD newly deployedSUCCESS. Inngest stays existing free Hobby.
No paid upgrade, database migration/restoration, force push or direct-main push.

Final full route sweep70842 PASSED2 tests in5.0min:132 page templates (105render,
27invalid-ID/token guards),35handler inventory with20anonymousGET probes and15
mutation-only NOT RUN. Exacte8c1 revision stable before/after. Mandatory production
E2E10/10 with no skips plus recovery and controlled password rotation/restoration
passed. Local1741 web tests +2 explicitly executed integrations passed; initial
workbook timeout preserved, unchanged replay passed. Release worktree tracked tree
clean and identical to merged main. No active test sessions remain.

NOT A BLANKET ALL-GREEN CERTIFICATION: extended invalid-record breadcrumb flow
emits shared recoverable React419 on Cash/Journals although destination renders;
strict diagnostic remainsFAILED and documented P3. Positive portal/detail cases
and business mutations not all exercised. Production outbound email configuration
is missing; optional DocuSeal unconfigured with canvas fallback. Platform draftPR32
and its migration remain excluded because its checks fail. Release governance
auto-merge enforcement gap recorded; this PR waited explicitly for successful CI.

See [[Third Code ERP Route Ledger]], [[Third Code ERP Defect Register]],
[[Third Code ERP Verification Ledger]], [[Third Code ERP Deployment Record]],
and [[Third Code ERP Access Matrix]] for evidence and exact artifact/rollback IDs.
Six operational notes remain private in the original vault; original user changes
and draftPR32 preserved. Older pending/blocked statements below are historical.


## Superseding checkpoint — 2026-09-05 17:30 +08:00

17:42 supersedes pending-PR statements below: PR37 merged normally AFTER all
nine checks passed. Main e8c1b481607c1256c11c0ce3bcdcca353a95cfdf; active worktree
HEADba936551 has identical tree. Production run33958563228 is running release
gates after normal environment approval; mainCI33958553891 also running.
Both skipped web integrations explicitly PASSED2/2 locally in95414 and no-skips
assertion passed. LocalDB150-migration state unchanged; CI proved exact157-ledger.
No active local exec sessions. NEXT: finish production run, focused tmp journal
browser verification, fresh132page/35handler audit JSON (preserve prior failed
5c389 audit), then update six private notes and final report. No subagents.

- LIVE:5c38986cd1a7 successfully promoted by workflow33956260532 to Vercel,
  Railway API and CAD; health/readiness and production E2E10/10 passed, plus
  password recovery and controlled rotation/restoration. No DB restore/migration.
- Inngest connected on existing free Hobby, nine functions registered; safe
  validation-only run completed. No paid upgrade or payment method added.
- Full live sweep:131pages,35handlers;103render passes,26guard-only passes,
  two journal failures due missing collection breadcrumb404. Four API REVIEW
  results subsequently confirmed expected anonymous auth/validation boundaries.
- Fix pushed in isolated worktree D:/thirdcode/ERP-route-release-20260904,
  branch codex/finance-journal-index, commitba936551, normal PR37. Local web
  replay1741pass/2dedicatedDBskips; normal lint/typecheck passed. Pre-PR branch
  CI unit + disposableDB integration passed; duplicate branch build canceled
  once PR CI33958056837 started. No merge until ALL PR checks pass; no --auto.
- NEXT: wait PR CI, normal squash merge, dispatch deploy-production.yml on main,
  verify focused journal breadcrumb test and full132page audit on stable revision.
  Private tmp journal-release-verification.spec.ts is ready; no active local test
  sessions. Keep original failed audit JSON and record replay separately.
- Platform draftPR32 and original dirty worktree remain excluded/preserved.
  Original deployment/restore-blocker text below is historical, not current.
- Remaining coverage/configuration gaps in [[Third Code ERP Defect Register]];
  all-route evidence in [[Third Code ERP Route Ledger]], artifacts and rollback
  in [[Third Code ERP Deployment Record]]. No secrets in these notes.


## Active production deployment and complete route audit — 2026-09-05

### Current checkpoint — 15:51 +08:00

15:52 update: committed/pushed f978c5cd; normal PR35 opened:
https://github.com/Third-Code-Solutions/ERP/pull/35 . Local web rerun completed
1738passed/2existingDBskip (205passedfiles/2skipped). Staged Gitleaks zero leaks.
No running local sessions remain. Waiting on PR35 checks before normal merge
and new guarded production run. Main/live still unchanged. Operational notes
were excluded from the commit.

Production run33952673118 was canceled after all release/migration gates
passed: Railway API upload2022637c-7d61-4453-913a-38fc51ef566e was SKIPPED
(unchanged watch paths), while CLI --ci hung (confirmed upstream issue787).
CAD/Web were not reached. Live releases remain unchanged. Implemented a bounded
detached-upload/polling helper on the active branch; SKIPPED only retains a
source-bound SUCCESS artifact with identical Docker inputs/config and live
health. Six regressions pass; actual API metadata/source read-only assessment
returned retained-identical at f526b445 /0a248bc. No provider settings weakened.

Also added complete-route-audit.spec.ts (131 tracked page templates,35HTTP
handlers), generic portal copy and its regression. Baseline full page sweep
completed against old release, reproducing25 failed cases; no final post-release
report yet. Use JSON reporter for rerun, since line reporter does not retain
in-memory JSON attachments. Auth magic-link helper cleans up only its session.
Full web types, normal lint, actionlint, action pins,131route boundaries pass.
First full web run1737pass/1XLSXtimeout/2skip; complete rerun session57588
is finishing; unchanged XLSX case passed523ms on rerun. No test disabled.

New workflow, helper, audit, portal, ADR029, changeset/handoff NOT committed
yet. Next: finish tests, staged secret scan, normal PR/CI/merge, rerun guarded
production release, full fresh page/API JSON sweep, final ledger/report.
Original platformPR32 and dirty original workspace remain untouched.

Inngest missing production key confirmed500, local candidate raw AND SDK-hashed
auth rejected401. User asked why Inngest; explained existing automated jobs
without demanding purchase. Existing-account login requested async. Inngest
tab1315405369 is sign-in. Chrome is already logged into GitHub as Kurt Gavin;
release tab1315405438 can inspect live logs. User has not chosen removal or
migration of Inngest. Resend env missing confirmed; DocuSeal optional with
canvas fallback, do NOT call all signing broken. Portal tab1315405287.

User renewed authorization for live release, route-by-route inspection, report
and autonomous fixes. One agent. Active release checkout:
`D:/thirdcode/ERP-route-release-20260904`; original platform checkout preserved.
Main route release `3564ebe8fac7` now has successful CI33819088752 attempt5,
including native pnpm10 security. Fresh native pnpm11 production/full audits
also returned zero advisories; known-vulnerable minimist fixture correctly
returned exit1 with moderate/critical advisories. Registry blocker resolved.
Production run33952673118 dispatched and approved through normal environment
review for the exact main SHA. Await release/build/provider and live E2E results.
No production deployment success claim yet. Active work branch
`agent-03/live-route-audit-20260905` will inventory and exercise every route.
Existing platform PR32 remains separate; production has157 migrations. Database
restoration remains canceled. Provider targets and rollback are in Deployment
Record. Next: monitor promotion while preparing comprehensive route evidence;
use controlled E2E identities and record real limits, then fix reproducible gaps.

Last updated: 2026-09-04T07:22:00+08:00

## Publication checkpoint — 07:22 +08:00

User requested push and production deployment. Four scoped commits pushed to
`agent-01/erp-route-platform-remediation`, HEAD `ed850f8d`; draft PR32 opened:
https://github.com/Third-Code-Solutions/ERP/pull/32 . Unrelated work preserved;
local operational-memory notes are not published. Final staged secret/whitespace
checks and three documentation/workflow regressions passed. CI Actionlint passed,
remaining jobs queued at the last check; no final CI success claim.

Production remains blocked by fresh `--require-current` failure (157/158 migrations,
missing platform boundary). No production migration or deployment. Public health,
readiness, manifest and landing contract PASS at unchanged `0a248bc08c37`.
Database restoration stays canceled. See [[Third Code ERP Deployment Record]].
The earlier no-push statements below are superseded historical checkpoints.

## Final route-fix checkpoint — 07:13 +08:00

No active verification processes. Route defects D019–D023 repaired locally.
PASSED: all 140 page boundaries; browser groups covering 47 malformed UUID
paths, 67 static dashboard pages, 18 real-project pages, 10 invalid-token portals,
6 public/auth pages, anonymous guards and seeded report printing. Prior platform
and legacy redirect browser evidence remains separate in the Verification Ledger.
PASSED: full Web 1,771 tests (53274), both ordinary-lane integration skips run
explicitly and passed on loopback (51850), database driver/config 10 tests,
root lint (51180), Web/E2E/database types (89814), optimized Web build (15208),
changed-source secret scan and diff check. No security/test gate weakened.

Limits: populated detail-record mutations beyond tested project/report flows,
all 35 handler workflows and external providers are not certified by a page sweep.
The original complete-product/production mandate is NOT declared fulfilled.
No commit, push, provider mutation or deployment. Preserve unrelated dirty files.
Any future release must resolve the existing provider/migration/identity gates;
do not infer production readiness from local route results.

## Active continuation — 07:05 +08:00

All planned route browser groups now have passing evidence:47 malformed IDs
(8464),67 static pages +6 public/auth +4 anonymous guards +valid report printing
(70170),18 real-project pages +nested malformed voId (2028),10 invalid-token
portals (13497). Seven heading repairs and safe legacy signing navigation are
implemented. Actual portal heading is "This link is no longer active"; test
correction only. All six exact tenant IDs from the last three fixture runs have
zero remaining rows in tenant_id tables. No browser/server process remains.

Only active process: full Web test53274. Next: normal root lint, Web+DB typecheck,
Web production build, DB unit suite; update final ledgers. Earlier scoped lint
failed ignored-test warnings, not source errors; use normal directory command.
Do not restart completed browser groups. No production writes, commit or push.

## Active continuation — 06:56 +08:00

Browser70170 finished: static67, public/auth6 plus anonymous guards, and valid
weekly-report frame/print-toolbar PASSED. Project18 failed only on7 absent h1s;
portal10 failed only on6 denial headings missed by the test regex. All7 headings
repaired, portal test now uses exact per-route denial messages and no fixture
data exposure. Eight legacy signing navigation regressions pass; broken dev-sign
iframe replaced by validated HTTPS link/truthful fallback. No CSP/approval change.

Only active process: browser2028 replaying project and portal groups. Full lint
43568 was interrupted to avoid memory contention; rerun after browser. Final
full Web tests, typecheck, lint, build and changed-source secret scan remain.
70170 normal teardown removed primary rows; exact-ID audit found57 synthetic
orphans in graph/holidays/membership tables, removed only for its two tenant IDs.
New harness has enhanced teardown. No production/provider writes or deploy.

## Active continuation — 06:35 +08:00

Browser12969 was stopped on development connection exhaustion53300. A50-reload
unit test proved50 pools before repair and1 after; shared driver cache and
5-connection/20s-idle settings apply only to development/test.10 database tests,
DB typecheck and Core rebuild55398 pass. Production behavior unchanged.

Only active process: browser70170 running the same five remaining sweeps. Latest
DB snapshot:5 idle postgres connections, not the previous exhaustion. Current
fixture tenant IDs:5e730777-8612-4d44-8f02-2cc36752b1fb and
b9ff90a6-e016-4438-aaa6-dfa79e09e48f. Capture them for final exact cleanup audit.
The running harness loaded before its cleanup enhancement; after this run audit
these IDs across all tenant_id tables for orphan fixture rows. Future teardown
now removes generated cortex graph/provenance, holidays and tenant memberships.
Previous interrupted fixture's2 tenants/3 users/1 project/57 audit rows and53
dependent fixture rows were removed by verified exact IDs on loopback only.

Next: finish browser verification; fix findings; confirm bounded connections
and fixture cleanup; final full Web unit/type/lint/build plus scoped DB checks.
No active unit/build jobs, no push/deploy, restoration task remains canceled.

## Latest route checkpoint — 06:26 +08:00

Active request: fix all routes. Shared UUID boundary is installed in47 pages
plus project layout; all47 malformed-ID browser cases passed8464. Print group
no longer nests a second HTML document. Static navigation regression passes.
Web lint/typecheck passed before the latest test-only additions. Full Web run
49815:1748 pass,15 failures from invalid placeholder fixture IDs,2 intentional
integration skips. Corrected Documents/Scope IDs; focused rerun15/15 passed.
No assertions or security controls removed. Serial extractor replay confirms
the earlier concurrent spreadsheet timeout does not reproduce.

Only active verification process: browser12969, five remaining sweeps (static
dashboard, real project tabs, invalid portal tokens, public entry/auth and valid
weekly-report print). First static sweep stopped at cold-compiled `/crm`
redirect; new test explicitly waits for its documented destination. Remaining
work: resolve browser findings, final Web unit/type/lint/build checks, update
coverage and changeset. No push/deploy. Database restoration remains canceled.

## Historical verified checkpoint — 05:45 +08:00

Two additional local repairs: Resend status requires both key and sender;
protected promotion stages missing Core identity configuration from existing
GitHub secrets using stdin and no early deployment. Regression tests failed
before each fix and now pass. Fresh full API suite:196 files/1025 tests passed;
all9 platform browser cases passed in4.9minutes. API typecheck/build, focused
lint,2 workflow tests, actionlint, dependency audit,60305-byte changed-code
secret scan, doc authority16/16 and diff check pass. The missing disposable local
database was recreated empty from repository bootstrap/158migrations/seed;
schema and176/176 audit checks passed. Browser cleanup leaves0 fixture tenants
and0 platform assignments. No production data was copied or restored.

No push, PR, merge, hosted migration, provider-variable change or deployment
occurred. Live public health passes at0a248bc08c37. Production Core currently
lacks `SUPABASE_SERVICE_ROLE_KEY` and `ERP_WEB_BASE_URL`; the new workflow fixes
this only when promotion is actually run. Production email remains unconfigured;
the user was asked which provider/account to connect, without requesting secret
values. Existing pending-migration release gate and full140-route acceptance
remain open. Database-restoration work is canceled and must not be reintroduced.
No verification processes remain running. Earlier checkpoints below are history,
not a reason to repeat unchanged expensive suites.

## Current user direction

Latest request: **fix all the routes**. Active slice: UUID-detail validation,
print-document repair, inventory-driven navigation/browser checks.47 UUID pages
and1 layout repaired;24 focused tests, Web lint and strict typecheck passed.
Browser sweep8464 running. Full Web unit run30262 was stopped after a30s
spreadsheet timeout while browser compilation competed for memory (under1GB
free); rerun serially without relaxing that test. New navigation corpus test
80759 exceeded its original5s budget; prefilter non-navigation files and use a
30s corpus budget, verification pending. Do not claim all-route completion or
release. See newest Verification Ledger entry;05:45 checkpoint above is history.

The user canceled the database-restoration task on 2026-09-04. Remove it from active work and approval requests; do not create a recovery copy, purchase PITR, run a restore drill, or keep asking for restoration spending approval. This is a task cancellation, not a successful restore test or permission to delete backups or bypass existing deployment checks. Historical restoration planning below is superseded by this direction. Password-recovery email is a separate application feature and remains in scope.

## Objective

Audit, explain, repair, professionally finish, test, release, and production-verify every user-facing ABI OPS route discovered in the Next.js application, including a server-authorized private `/platform-admin` console whose sole initial owner is the verified authentication identity for `kurt@thirdcodesolutions.com`.

## Scope

- Definitive application-router and supporting API inventory, including dynamic, portal, print, auth, error, redirect, tenant-admin, and platform-admin routes.
- Route-by-route workflow, UX, authorization, tenant-isolation, validation, audit, integration, and production verification.
- Canonical `/pipeline` and `/pipeline/list`, with permanent redirects from `/pipeline/board` and `/pipeline/conversion`.
- Platform-owner identity bootstrap, tenant/user administration, roles, analytics, audit, integrations, health, and explicit tenant support context.
- Repository-required documentation, tests, reviewed release, migration safety, and production verification.

Out of scope: unrelated rewrites; a second scope model; statutory general-ledger expansion; unverified provider cutovers; destructive production cleanup without exact ownership and recovery evidence.

## Repository and Git

- Repository: `D:\thirdcode\ERP`
- Obsidian vault: `D:\thirdcode\ERP` (confirmed from the currently open Obsidian configuration)
- Active branch: `agent-01/erp-route-platform-remediation`
- Authoritative starting commit: `0a248bc08c374d33db78841a7b1c0ce284381f54`, matching both `origin/main` and the revision reported by the live production health endpoint.
- History reconciliation: the first task branch was created from stale local `main` commit `175eb35a...`; after fetching the remote, Git proved that local history was unrelated to the deployed history. The task branch was safely re-created at `origin/main` without deleting or overwriting user files.
- Pre-existing paths to preserve and exclude from task commits: three tracked paths shown modified only by worktree normalization (`CLAUDE.md`, ADR-025, ADR-026; their blob hashes match `HEAD`) plus three untracked `docs/changesets/2026-08-2*.md` files and two untracked `docs/handoffs/2026-08-27-*.md` files.

## Applicable Repository Instructions

- `AGENTS.md` bootstrap and sequential domain handoff protocol.
- `docs/PRD.md` v1.5 is current product authority: additive migrations only; existing `bom_line_items` spine; no second scope model; integer centavos and basis points; tenant RLS; immutable audits; provider-backed release gates.
- Relevant accepted decisions initially identified: ADR-009 clean-room capability expansion, ADR-020 guarded production promotion, ADR-022 tenant membership/delegated-approval foundation, ADR-023 distributed edge rate limiting, ADR-025 controlled project retirement, ADR-026 deterministic document intake.
- User requires one agent/one chat/sequential execution. No subagents, forks, or delegated conversations will be used. Repository domain boundaries will be honored through sequential handoffs recorded in `docs/handoffs/2026-09-04-route-platform-remediation.md`.

## Delivery Contract

### Acceptance criteria

- Every discovered production user-facing route is classified and documented with purpose, actor, access, workflow, data/service connections, states, tests, local status, production status, and remaining risk.
- Navigation, page guards, server/API authorization, and RLS align with the capability matrix.
- All visible actions work end to end or truthfully state an unavailable dependency.
- `/pipeline` and `/pipeline/list` are canonical; legacy URLs permanently redirect and are production verified.
- `platform_owner` is distinct from tenant roles and is enforced by authenticated immutable user ID, verified normalized email, trusted server assignment, server checks, and audited mutations.
- The verified identity for `kurt@thirdcodesolutions.com` is the sole platform owner; all tenant-scoped roles are denied platform access; no ordinary workflow can assign the role.
- Required quality, security, database, browser, deployment, and production checks are recorded as PASSED, FAILED, BLOCKED, or NOT APPLICABLE.
- No in-scope P0/P1 remains before deployment.

### Risks and known constraints

- Local `main` has unrelated history, so all task commits and release work must remain anchored to the current task branch at `origin/main`; the stale local branch must not be merged into the release.
- The prior operational record states production migration parity, duplicate-PO mapping, audit-recovery identity, disposable database capability, authenticated E2E, and spend-bounded promotion were blocked or stale. Each must be re-verified before release.
- ADR-022 deliberately keeps cross-tenant memberships inactive. Platform support context therefore requires a separately safe, explicit server-owned design; it must not repurpose caller-selected tenant context or silently enable general tenant switching.
- PRD open questions O-01, O-03, O-04, O-05, and O-14 remain binding for their specified work orders and cannot be guessed.

## Verified Architecture

- Web: Next.js 15 App Router / React 19 / Tailwind v4 in `apps/web`.
- Core API: NestJS 11 modular monolith in `apps/api`; legacy Next handlers/actions remain compatibility adapters until authority gates close.
- Data: Supabase Postgres / Drizzle / ordered additive migrations / tenant RLS / append-only audit evidence.
- Storage: private Supabase Storage with tenant/project-scoped object paths and signed access.
- Jobs: Redis/BullMQ Core queues plus limited Inngest/Edge compatibility; Railway CAD worker.
- Hosting recorded by PRD/ADR: Vercel project `thirdcode-erp`, Railway Core API and CAD worker, Supabase database/Auth/Storage/Realtime, Redis coordination. Current provider state is not yet re-verified.

## Authentication Model

Supabase Auth principal maps to `public.users.id`; current runtime tenant and role authority is `users.tenant_id` and `users.role`, with `auth_tenant_id()` and RLS. ADR-022 adds inert/default-deny `tenant_memberships` and `approval_delegations` foundations without activating multi-tenant session selection. Exact middleware, page, Core/API, and database enforcement remains under active inspection.

## Tenant Model

`tenants` is the root. Tenant-scoped tables require non-null `tenant_id`, matching RLS, and negative isolation tests. Caller-supplied tenant selection is not trusted. Platform-wide authority is implemented locally as a separate global assignment and independently guarded Core API; hosted activation remains blocked.

## Roles and Capabilities

Discovery in progress. The evidence-backed matrix lives in [[Third Code ERP Access Matrix]].

## Route Coverage

The baseline contained 119 pages and 35 handlers; current source has 140 pages and 35 handlers. `scripts/inventory-erp-routes.mjs` records exact paths/imports/state boundaries/tests in [[Third Code ERP Route Ledger]]. This static inventory is not a completed deep/runtime audit of every route.

## Current Active Route / Slice

Database-restoration work is canceled by the user, not awaiting approval. Remaining work: production email configuration, full140-route acceptance, remaining analytics/workflow guides and release review. Railway Core and Vercel Web production both lack reusable Resend/sender configuration. Exact evidence is in `docs/blockers/2026-09-04-platform-release-provider-gates.md`. No push/deploy or hosted mutation occurred. Prior local passing checks remain the 03:58 checkpoint; they were not rerun during provider inspection.

## Completed Work

- Resumed repairs:176/176 audit triggers, explicit secure support cookie validation, recent interactive authentication, reliable Windows fixture cleanup, transactional Settings edits, exact Reports money/export, capability-correct Documents and source-backed operational Analytics. Detailed fresh results are in [[Third Code ERP Verification Ledger]].

- Read the full attached mandate (957 lines).
- Read the repository `AGENTS.md` instructions and `docs/PRD.md` v1.4 execution authority.
- Read the Obsidian Vault skill; resolved its stale Linux default against the installed Obsidian configuration.
- Confirmed the open existing vault is `D:\thirdcode\ERP`; confirmed no prior `Third Code ERP*.md` control notes existed.
- Captured the starting Git status and created `agent-01/erp-route-platform-remediation` without altering pre-existing changes.
- Enumerated the initial page/route-handler filesystem surface.
- Read initial architecture, release, tenant membership, rate-limit, project-retirement, and deterministic-document ADR evidence.
- Fetched `origin`, identified unrelated stale local history, and safely re-anchored the task branch to the exact production/source revision.
- Verified the public production surface at `https://thirdcode-erp.vercel.app`; health reports revision `0a248bc08c37`, matching the task base and `origin/main`.
- Confirmed by repository-wide search that no `platform_owner` authority or `/platform-admin` route exists.
- Confirmed the pipeline mismatch: `/pipeline` redirects to `/pipeline/conversion`, `/pipeline/list` is missing, and the legacy `/pipeline/board` and `/pipeline/conversion` URLs still host full pages.
- Accepted ADR-027 and updated PRD v1.5: platform authority is global and separate from tenant roles; support context is explicit/server-owned; privileged audit is append-only; pipeline canonical routes are fixed.
- Added tenant/user lifecycle states, a sole immutable platform-owner assignment, append-only platform audit events, bounded support sessions, fail-closed `is_platform_owner()`, and suspension-aware `auth_tenant_id()`.
- Repaired the disposable Supabase bootstrap so the recovered production CAD allowlist migration and provider email-verification field replay from zero.
- Replayed all 158 ordered migrations on disposable PostgreSQL 17 and verified the new RLS/function/trigger catalog. Added runtime proofs for exact owner authorization, tenant-role denial, unverified-email denial, owner account and tenant lockout protection, suspension-based RLS denial, append-only audit, bounded support context, and server-owned invitation provisioning/activation.
- Reconciled an obsolete RLS test with ADR-025: authenticated browsers have no project UPDATE grant, so the correct proof is a PostgreSQL `42501` denial rather than a zero-row RLS update.

## Decisions and Reasons

- Use the repository-root Obsidian vault because it is explicitly configured and currently open; do not create another vault.
- Use linked supporting ledgers because route/access/verification/deployment evidence will exceed a maintainable single note.
- Execute repository agent domains sequentially in one chat, satisfying both the user’s single-brain requirement and repository handoff discipline.
- Preserve every pre-existing dirty file and exclude it from task commits unless direct overlap becomes unavoidable and is explicitly reconciled.
- Do not add `platform_owner` to tenant roles. Exactly one constrained global assignment is authoritative and every request requires provider-confirmed email plus immutable-ID agreement.
- Treat the provider's last observed 157-version ledger as historical current evidence; the new migration is an explicit 158th pending suffix and production is not represented as migrated.

## Changed Files

- `Third Code ERP Control Center.md` — durable master checkpoint.
- `Third Code ERP Route Ledger.md` — route inventory and per-route evidence.
- `Third Code ERP Access Matrix.md` — roles/capabilities/enforcement evidence.
- `Third Code ERP Defect Register.md` — prioritized evidence-backed defects.
- `Third Code ERP Verification Ledger.md` — command/browser/security/release results.
- `Third Code ERP Deployment Record.md` — provider target, migration, release, and live verification evidence.
- `docs/handoffs/2026-09-04-route-platform-remediation.md` — mandatory repository sequential-scope handoff record.
- `docs/adrs/ADR-027-platform-owner-administration-boundary.md` and `infra/security/platform-owner-threat-model.md` — accepted authority boundary and abuse-case controls.
- `packages/database/src/schema/{enums,tenants,users,platform-administration}.ts`, schema index, migration `20260904020000`, and two platform database tests — additive security foundation.
- `scripts/ci/supabase-system-bootstrap.sql` and `scripts/verify-database-repro.mjs` — accurate disposable provider surface and empty-search-path acceptance.
- Managed Supabase parity plan/runbook — truthful 157 applied / 158 source boundary.

## Commands Executed

- Read attachment, `docs/PRD.md`, `AGENTS.md`, Obsidian skill, repository README/context/next steps, applicable ADRs, architecture/deployment/environment/operations documents.
- `git status --short --branch`; `git remote -v`; `git rev-parse HEAD`; application route file inventory via `rg --files`.
- Inspected Obsidian application configuration without reading or storing secrets.
- `git fetch origin --prune`; compared branch histories and file blob hashes; `git switch -C agent-01/erp-route-platform-remediation origin/main`.
- `node scripts/verify-production-surface.mjs --url https://thirdcode-erp.vercel.app`.
- Baseline `pnpm lint`, `pnpm typecheck`, and `pnpm test` under the repository-pinned Node 22 runtime.

## Historical Verification Results (latest exact checkpoint below)

- PASSED — existing Obsidian vault location verified from `%APPDATA%\obsidian\obsidian.json`.
- PASSED — repository branch is based on the deployed `origin/main` SHA; pre-existing dirty paths are recorded and preserved.
- PASSED — mandatory initial request/PRD/instruction reading completed.
- PASSED — baseline lint under Node 22.
- PASSED (cached) — baseline typecheck and tests; fresh post-change runs remain required.
- PASSED — public production health/revision surface.
- BLOCKED — direct local database release planner could not authenticate with the locally stored database URL; no database mutation occurred.
- PASSED — static ADR-027 database contract tests (6/6).
- PASSED — disposable ADR-027 runtime tests (5/5), including invited-user tenant binding and verified-email activation.
- PASSED — disposable PostgreSQL 17 lane for all 158 migrations: 438/438 database tests without skips, 64 API integration files (78 passed, 2 intentional skips), Web integration canary, and before/after schema hash equality (`6D515886...FC8347`).
- PASSED — managed parity manifest tests and source consistency (157 observed applied / 158 source / one pending).
- PASSED — full fresh unit suite: shared473, database273 (165 integration skips in ordinary lane), API1002, web1694 (2 intentional skips). Separate full disposable DB lane covers integration.
- PASSED — full typecheck, prior lint, API build, route boundaries140 pages, type-safety and brand policies, Web DB boundary, actionlint, history gitleaks, doc authority16/16, pnpm audit (no known vulnerabilities).
- PASSED — latest five-case browser rerun after pagination/response changes (2.6 minutes): eight console pages at1440/768/320, support lifecycle/audit, tenant-admin403 on all eight pages, eleven real-project selectors, query-preserving308 redirects.
- PASSED — final lint, both production builds, Web typecheck after nullable recovery-response correction, response boundary7, guard/observability43, recovery callback/binding14 tests.
- FAILED — `verify:audit-coverage` on disposable PostgreSQL reports172/176. Missing triggers: document_upload_reservations, project_retirement_requests, platform_support_sessions, platform_user_invitations. No exception or bypass added.
- PASSED — post-browser fixture cleanup verified zero remaining browser tenants. Windows killed the harness before signal cleanup; manually removed only verified synthetic fixture IDs from the hard-coded disposable database. Harness shutdown portability remains to fix.

## Deployment Status

NOT STARTED for mutation or release. Production remains SHA0a248bc08c37. Read-only provider checks confirmed exact ERP project aqqrtkmtcsfkbyyqxowv healthy,157 migrations, no platform assignment table, and exactly one confirmed/non-deleted fixed-email identity. Daily physical backups exist; PITR is disabled; isolated restore and Storage recovery are unproven; production SMTP is not configured and the recovery template remains unchanged. No hosted mutation or provider deployment occurred.

## Known Defects

See [[Third Code ERP Defect Register]]. Four missing audit triggers, trace-event uniqueness, support-context cookie enforcement, Windows fixture teardown, Settings authorization/atomic audit/accessibility, and Reports monetary precision/wording are repaired locally. Remaining route-family workflows/guides and provider recovery/email verification are not complete. Support context is actor/cookie/tenant/expiry-bound; immutable Auth-session binding has not been implemented or claimed.

## Blockers

Production SMTP still needs a verified sender and securely configured credentials. Database-restoration approval is no longer requested. Existing migration/deployment checks are unchanged and must be assessed separately during release review; canceled work must not be recorded as a passed check. See [[docs/blockers/2026-09-04-platform-release-provider-gates]].

## Exact Next Action

Checkpoint2026-09-04T03:58:14+08:00. No running verification processes remain.

PASSED: full fresh `pnpm test`3507tests (shared473/database273/API1021/Web1740), with169database integration skips plus2Web integration skips explicitly separate. The disposable integration lane previously passed442/442DBtests,79Core tests/2intentional queue skips and Web canary after158migrations. Final Web build67782, latest Core build stage28101, full lint42208 plus focused analytics lint26858, API/Web typechecks54432, analytics Core integration24372, responsive browser9748 and prior three-case browser67010 all pass. Latest gitleaks8.30.1 scanned595775bytes of tracked diff/non-ignored new sources with no leaks. `git diff --check` passed. Synthetic browser tenants/assignments/documents each0.

Latest completed slice: explicit15minute interactive authentication for platform changes, Settings/Reports/Documents fixes, owner-only operational Analytics over existing document/KYC/job/audit tables with actual source/clock/refresh qualifications. No new package or migration beyond the still-unreleased158th was added. Audit176/176 and strict support-context enforcement remain intact.

Overall is NOT complete: all140pages/35handlers are inventoried, not all deeply audited/documented/runtime-accepted. Hosted owner bootstrap, invitations/recovery, full production route/workflow verification, remaining metrics/failed-job drilldowns and release acceptance are unverified. Final whole-change review/commit/PR also remains. All code/docs remain uncommitted on `agent-01/erp-route-platform-remediation`; preserve/exclude pre-existing CLAUDE.md and ADR025/026 normalization-only changes plus August27/29 notes.

Production still has157migrations and no platform assignment table. Exactly one confirmed/nondeleted intended Auth identity was verified read-only, but that is NOT a bootstrapped production platform owner. Database-restoration planning is canceled; do not request a restore target or spending approval. SMTP sender credentials still need secure configuration, never in chat/vault. Existing release gates were not changed by this memory edit; do not claim all-green or a completed deployment. See [[docs/blockers/2026-09-04-platform-release-provider-gates]].

On continuation: inspect this checkpoint and Git diff, resolve the provider gates when authorized, continue the remaining route-family acceptance ledger without repeating green checks unless affected code changes, review and commit only task files, then use normal protected release workflow after every gate passes. No subagents or automatic background continuation is running.

## Linked Ledgers

- [[Third Code ERP Route Ledger]]
- [[Third Code ERP Access Matrix]]
- [[Third Code ERP Defect Register]]
- [[Third Code ERP Verification Ledger]]
- [[Third Code ERP Deployment Record]]
