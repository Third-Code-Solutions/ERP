# Third Code ERP Deployment Record

## Cortex LIVE — 2026-09-05 21:14 +08:00

User requested deployment. PR41 merged normally after all PR gates passed.
Main614395fc3b963f23d0acf141ff7b16916db4f703; main CI33967263248 SUCCESS.
Production workflow33967263740 deployed Vercel READY
dpl_DuzPpjRmo3oVuQQ4XqAdYgAbFNik, artifact
https://thirdcode-a1oaz1coj-pavi-2e9809a4.vercel.app ; live
https://thirdcode-erp.vercel.app/cortex . Health/readiness200 exact614395fc3b96.
Railway CAD deployedc6a14cbb-2b47-4dbd-a773-a6db833213cb. API retained identical
8212c474-afc1-4798-bd29-3158a8833208, source5c38986c; not a new API deployment.
All five web/API/CAD health/readiness probes200. No database changes.

PASS authenticated production E2E10/10, focused Cortex canary9.6s at320–1440,
no browser errors; Vercel Cortex runtime-error scan empty for checked10minute window.
WORKFLOW FAILED AFTER DEPLOYMENT: password recovery provider429 at13:10:50Z,
confirmed Supabase Auth log "email rate limit exceeded". Subsequent password
rotation/restoration step NOT RUN. Do not call the whole release workflow green.
No blind retries, rate-limit changes, paid upgrades, or provider configuration edits.
Next: reverify recovery after provider quota resets or approved sender setup.
Rollback candidate priorVercel dpl_CUHqH35dVyQgSwnrf6XANdjWqvoF; no rollback
performed because UI/health are verified and Auth failure is provider throttling.

## Cortex review branch — 2026-09-05 20:21 +08:00

Pushed commitbe37296a2f9410d0514ab6ee0484b4d22a999d30 on
`codex/cortex-workspace-ux`; PR41 https://github.com/Third-Code-Solutions/ERP/pull/41 .
Local implementation/test/build complete; no merge or production deployment.
Production remains9a6b87816499, provider deployments below unchanged.
No migrations, paid upgrades, restoration or business-data deletion.

## LIVE Settings release — 2026-09-05 19:29 +08:00

- PR38, PR39 and PR40 merged normally after required CI. Main revision
  9a6b87816499f226c671a9038229baf5e40e9d54. Main CI33962506380 SUCCESS.
- Production promotion33962508262 SUCCESS:
  https://github.com/Third-Code-Solutions/ERP/actions/runs/33962508262
- Vercel READY dpl_CUHqH35dVyQgSwnrf6XANdjWqvoF; live
  https://thirdcode-erp.vercel.app ; artifact
  https://thirdcode-ijcb50gn9-pavi-2e9809a4.vercel.app . Live health/readiness
  independently returned200 and exact revision9a6b87816499 at19:28.
- Railway CAD deployed f4f5085a-90fa-4dd7-bb20-bbd1fd290a50.
  API retained-identical active8212c474-afc1-4798-bd29-3158a8833208,
  source5c38986c. Candidate upload6a3d68f0 was SKIPPED, NOT a new deployment;
  helper proved source/config equivalence. API health/readiness and CADhealth200.
- Authenticated production10/10, recovery1/1, controlled password rotation and
  restoration1/1 passed. Exact database target/157-ledger/dry-run passed.
  No database migration or restoration. No subscription billing or paid upgrade.
- Live Settings canary PASSED24.9s: saved/reloaded preferences, actual bell,
  integration status, four project invoice/payment page opens, no browser errors.
  Controlled account preferences restored; no business payment/invoice writes.
- New deployment runtime5xx query returned no matching logs at19:28.
- Rollback web: dpl_HzoczMLJJimE6kdUU5ig9oSJiznr at e8c1b481607c;
  CAD predecessor d68ba23e-ccfb-4020-a543-0dfba3f97bda. API unchanged.
- Full132page/35handler read-only audit PASSED (session59453,2tests4.8min):
 105renders/27guards,20GETprobes/15mutation-only NOT RUN; stable9a6revision,
 zero direct-page console/runtime errors. DraftPR32
  and original dirty worktree intentionally excluded. External email/SMS setup
  remains credential-dependent; configuration presence is not connectivity proof.

## FINAL verified production — 2026-09-05 18:07 +08:00

- Release e8c1b481607c1256c11c0ce3bcdcca353a95cfdf, normal PR37.
- Promotion33958563228 SUCCESS: https://github.com/Third-Code-Solutions/ERP/actions/runs/33958563228
- VercelREADY dpl_HzoczMLJJimE6kdUU5ig9oSJiznr, live https://thirdcode-erp.vercel.app
  and https://thirdcode-erp-pavi-2e9809a4.vercel.app ; artifact
  https://thirdcode-kyyktxsm8-pavi-2e9809a4.vercel.app . Exact live revisione8c1b481607c.
- Railway API retainedSUCCESS8212c474-afc1-4798-bd29-3158a8833208 at5c38986c;
  source/config equivalence and live health proven by helper. New upload5e02b635
  wasSKIPPED, not a new success. CAD d68ba23e-ccfb-4020-a543-0dfba3f97bdaSUCCESS.
- Web health/readiness200; API health/readiness200; CADhealth200. Mandatory live
  authenticated10/10 no skips, recovery1/1, controlled rotation/restoration1/1.
- Final route audit132page checks PASS;105render/27guard.35handlers inventoried,
 20GET boundaries checked. Extended missing-record navigation diagnostic remains
  P3 as documented separately; do not imply every workflow is certified.
- Inngest existing free Hobby/nine functions retained, no purchase or upgrade.
- DB157-ledger parity and dry-run passed; no migration or DB restoration.
- Rollback web dpl_Bao35cB7y9xYpo4LgCWBEiN17oPE at5c38986c; priorCAD
  cdc0c20f-70ee-4b28-8288-a0ca4396d3b5. API unchanged and already healthy.
- Original platform draftPR32 intentionally not part of this release.


## Journal collection follow-up — 2026-09-05 17:23 +08:00

18:00 FINAL PROMOTION SUCCESS33958563228 at e8c1b481607c1256c11c0ce3bcdcca353a95cfdf.
Live web revisione8c1b481607c and readiness200; API health/readiness200; CADhealth200.
Exact log evidence: API outcome retained-identical active8212c474 predecessor5c38986c;
authenticated production E2E10/10 executed without skips; password recovery1passed
(5.0s); controlled rotation/restoration1passed(28.6s). MainCI and PR37CI passed.
Focused journal browser replay93959 running before the fresh full route audit.

17:56 provider steps passed in33958563228; live authenticated E2E running.
Vercel dpl_HzoczMLJJimE6kdUU5ig9oSJiznr, production URL
https://thirdcode-kyyktxsm8-pavi-2e9809a4.vercel.app, SHAe8c1b481.
Railway API upload5e02b635-0eb9-425a-b5cc-0b9a8a2c23ce SKIPPED because inputs
unchanged; helper verified and retained SUCCESS8212c474-afc1-4798-bd29-3158a8833208
from5c38986c. Do not describe the skipped upload as a new successful build.
CAD d68ba23e-ccfb-4020-a543-0dfba3f97bda SUCCESS at e8c1b481.
MainCI33958553891 SUCCESS. Migration ledger/current-target checks and dry run
passed; no production database write or restoration. Final route replay pending.

17:39: PR37 all nine CI checks PASSED33958056837; two local web integration
tests explicitly PASSED2/2 with no skips. Normal squash merge e8c1b481607c1256c11c0ce3bcdcca353a95cfdf.
Production workflow33958563228 dispatched against that exact main commit; main
CI33958553891 also running. Existing Production environment approval submitted
through its normal reviewer API using the user's explicit deployment authorization;
current_user_can_approve was true. No protection rule altered or bypass used.
Current live5c38986cd1a7 remains rollback target until promotion completes.

Current live release remains5c38986cd1a7 (all three components successful).
Completed exhaustive page/handler audit exposed journal breadcrumb404; repair
commitba936551b6eabc7aa78d0642b55c17ecd7e3a8a9 pushed to
codex/finance-journal-index in the isolated release worktree. No direct-main push.
Branch CI33957743185 running before PR creation; lint/security/invariants/typecheck
passed so far. Targeted route/auth/navigation tests9/9; local full web run hit an
unrelated workbook extraction timeout and remains running; isolated replay pending.
Only guarded redirect, inherited states, authorization registry and tests changed.
No follow-up deploy yet. Production DB restoration remains canceled.


## Production release deployed — 2026-09-05 17:08 SGT

Release SHA: 5c38986cd1a7136615a01ec84ab544b0ddb76a18. PR35 merged normally after all checks. PR36 fixed an evidenced Railway CLI upload failure: tracked root .npmrc was excluded by .gitignore. Regression reproduced then seven deployment tests passed. GitHub merged PR36 immediately when auto-merge was requested (branch rules did not wait); its subsequent PR CI33956242305 and main CI33956251234 both passed, and all production release gates reran successfully. Do not use auto-merge as evidence that CI gates are enforced.

Production workflow33956260532 SUCCESS: https://github.com/Third-Code-Solutions/ERP/actions/runs/33956260532

- Vercel dpl_Bao35cB7y9xYpo4LgCWBEiN17oPE READY, https://thirdcode-5f6ln624m-pavi-2e9809a4.vercel.app, live alias https://thirdcode-erp.vercel.app. Health and readiness both200, revision5c38986cd1a7.
- Railway API8212c474-afc1-4798-bd29-3158a8833208 SUCCESS, exact release SHA in CLI label.
- Railway CADcdc0c20f-70ee-4b28-8288-a0ca4396d3b5 SUCCESS, exact release SHA in CLI label.
- Exact database target and current157-migration ledger passed; dry-run only, no database migration/restoration.
- Authenticated production E2E10/10 passed with no skips, including role, route and CAD scenarios. Password recovery1passed; profile password rotation/restoration1passed.
- Inngest production keys retained; existing free Hobby plan unchanged.

Earlier workflow33955656749 FAILED on missing /.npmrc in API upload a45295af-40b7-4ac2-9a81-8627588cb5da; this failure is not hidden. API Git autodeploy91f5cf7a-d189-4fbd-8ce1-29a4d6cedf61 had independently succeeded at8a5e998d. PR36 resolved the CLI upload path and the complete workflow then passed.

Rollback web artifact with working Inngest configuration: dpl_42iijGXYbFZYjHiQq1BZ8aWcwa87 (revision0a248bc08c37). Previous API91f5cf7a-d189-4fbd-8ce1-29a4d6cedf61; previous CADd1bbbde4-e5b9-405e-aa65-905e5817bd85.

Full131-page/35-handler audit started against the new stable revision; results pending. Platform draftPR32 remains excluded because its checks fail and its additional migration is not released. No claim that all original product requirements or all business mutations are verified.

## Inngest connected on free plan — 2026-09-05 16:34 SGT

User explicitly approved the existing Inngest production environment after requiring no paid subscription. Billing UI verified Third Code Solutions Inc / Hobby, next subscription payment Free, 50,000 monthly executions, five concurrent steps, and no payment method configured. No plan, payment method, key rotation, or new key was created.

Existing INNGEST_SIGNING_KEY and INNGEST_EVENT_KEY saved as Secret, Production-only variables in Vercel project thirdcode-erp (PAVI). Values were not printed or persisted to repository files. A configuration-only redeploy of the existing production artifact completed:

- New Vercel deployment: dpl_42iijGXYbFZYjHiQq1BZ8aWcwa87, READY.
- URL: https://thirdcode-jbsq4vgaq-pavi-2e9809a4.vercel.app
- Live health: https://thirdcode-erp.vercel.app/api/health returned ok:true, unchanged revision 0a248bc08c37.
- Previous artifact retained for rollback: dpl_5JNwb2pCNxxS8fbATpAwNu9WWBdc. That older artifact lacks the newly deployed Inngest environment configuration.
- Railway and database unchanged; no restoration or migration.

Inngest app third-code-erp synced successfully at 16:31:51 SGT to https://thirdcode-erp.vercel.app/api/webhooks/inngest, SDK4.18.1, nine functions registered. Scheduled jobs are now registered as configured in the existing release. Anonymous endpoint GET changed from missing-key500 to401, not a public-health failure.

Authenticated no-write smoke run 01M1RB5C6DSG4W5BRTCCSNE4CR completed in1.326s. Explicit empty-data invocation of the RFQ function returned {skipped:true, reason:"bomId, tenantId, or actorId invalid"}, matching the deployed source's pre-database guard. This proves authenticated execution and validation only, NOT successful RFQ creation/email delivery/all nine workflows. Run: https://app.inngest.com/env/production/runs/01M1RB5C6DSG4W5BRTCCSNE4CR

PR35 head f2ac51e5416e4150732721bc1b3ba661a6fbb394 now has all nine required CI jobs successful, including trusted PR E2E. It remains OPEN and has NOT been deployed by this configuration-only release. Earlier route/platform gaps remain separate. Production email credentials remain missing; no positive email, survey, or AI workflow was triggered for this smoke test. Future complete-route audits must classify authenticated Inngest GET401 as a guard, not require anonymous200.

Linked from [[Third Code ERP Control Center]].

## Active release status — 2026-09-05

Main3564ebe8 route release passed CI attempt5. Production workflow33952673118
passed all release/build/migration-parity gates, then was canceled because
Railway CLI5.28 --ci hung after upload2022637c-7d61-4453-913a-38fc51ef566e was
SKIPPED. No CAD or Vercel promotion was reached. This was NOT a deployed release.

Follow-up PR35 is open. Head f2ac51e5 adds complete page/API audit, shared portal
copy, bounded Railway deployment-state handling, source/config identity guards,
and missing packages/ai/.npmrc watch paths. The watch-path change requires a
fresh API build, not retention. Six state-machine tests pass; full web1738passed
with two explicitly skipped local DB-only tests. Await fresh PR CI and guarded
promotion. Original platformPR32 remains separate.

Rollback/current live artifacts before the resumed release:
- Vercel dpl_5JNwb2pCNxxS8fbATpAwNu9WWBdc, revision0a248bc08c37.
- Railway Core f526b445-e039-4b86-a078-13b9fc732ef7, SUCCESS, source0a248bc.
- Railway CAD d1bbbde4-e5b9-405e-aa65-905e5817bd85, SUCCESS.
- Supabase157migrations; no restoration or migration performed.

Inngest account now signed in to Third Code Solutions Inc, but no app is
registered. Asked confirmation to connect production keys to the named Vercel
project and register existing jobs. No keys changed, no jobs registered, no plan
purchase. Production email configuration absent; optional DocuSeal absent but
in-app canvas signing exists and is not certified by an invalid-token check.

Linked from [[Third Code ERP Control Center]].

Last updated: 2026-09-04T07:22:00+08:00

## Publication checkpoint — 07:22 +08:00

Pushed four scoped commits to `agent-01/erp-route-platform-remediation`, remote
HEAD verified `ed850f8d61c6d61acd8dc07d2317739a9a917cae`. Draft PR:
https://github.com/Third-Code-Solutions/ERP/pull/32 . Unrelated edits and local
operational-memory notes were excluded from this public publication. Staged
Gitleaks/whitespace checks and three documentation/workflow tests passed.
GitHub CI Actionlint passed; remaining CI queued at the last snapshot.

Production NOT deployed. Fresh read-only gate exits 1: 157/158 migrations;
platform assignment table absent. The new API requires that lifecycle schema.
No migration, bootstrap, provider setting or production application was changed.
Fresh public surface check PASSED at unchanged revision `0a248bc08c37`.
Restoration remains canceled; no recovery purchase or drill is requested.

Earlier no-commit/no-push entries below are historical and superseded by this
checkpoint. Release-blocking evidence is committed in the production preflight
changeset; do not merge or promote the draft while that boundary is unresolved.

## Route-fix handoff — 07:13 +08:00

The route fixes have passed local browser sweeps, Web unit/integration tests,
scoped database regressions, lint, types and optimized build. No commit, push,
hosted mutation or deployment occurred. Source branch remains
`agent-01/erp-route-platform-remediation`, HEAD `0a248bc08c374d33db78841a7b1c0ce284381f54`.
These results do not certify the entire original product brief or hosted flows.

## Superseding user direction

Database-restoration work is canceled. Earlier restore proposals and approval requests below are historical, not active tasks. Do not create a recovery copy or request restoration spending approval. No backups, live data, migrations or deployment checks were changed. Cancellation is not successful verification.

## Recorded Target (Source Documentation; Provider Re-verification Required)

- Repository: `Third-Code-Solutions/ERP`
- Web: Vercel project `thirdcode-erp`
- Core API and CAD worker: Railway
- Database/Auth/Storage/Realtime: Supabase
- Queue/readiness: Redis/BullMQ
- Promotion: manually dispatched GitHub workflow on `main`, protected by the GitHub `production` environment (ADR-020)

## Current Status

No hosted mutation, migration, provider-setting change, or production deploy has occurred in this task. Read-only verification passed for the public production surface at `https://thirdcode-erp.vercel.app`; it reports revision `0a248bc08c37`, exactly matching `origin/main` and this task branch base.

## Provisional Gates

- Identify exact provider projects/services/domains/accounts and current deployed SHA.
- Reconcile Git branch/history and review the final scoped diff.
- Re-run migration parity, duplicate-data, audit-recovery, target-identity, backup/PITR, rollback, health/readiness, and environment-name checks.
- Prove platform-owner identity binding/sole-owner state and tenant-negative access before promotion.
- Pass required source, database, security, browser, and production-build gates.
- Deploy via the guarded promotion workflow; verify exact SHA, canonical routes, redirects, auth denials, representative mutations, persistence, audit, isolation, console/network, and secrets boundary.

## Deployment Events

2026-09-04T05:45:00+08:00: no release performed. Fixed two additional source gaps (email status and secure Core identity-variable provisioning). API1025tests, browser9cases, build/type/lint/workflow/actionlint/audit/scoped secret scan pass; exact evidence in [[Third Code ERP Verification Ledger]]. Live health still0a248bc08c37. Required GitHub credential names exist; Core service-role/Web-origin variables will be supplied by the new workflow only when authorized gates allow promotion. Email-provider account selection, existing migration boundary and full route acceptance remain open. Database-restoration task stays canceled.

2026-09-04T05:29:26+08:00: read-only provider inspection verified PAVI Pro/Micro target and obtained the isolated restore quote (USD10.18/month). Final creation was not submitted; PITR remains unchanged. Exact Railway Core and Vercel Web production configuration checks found no Resend/sender configuration. No secret values were printed or saved. Account decisions remain required; separate Storage recovery and route acceptance remain open. See `docs/blockers/2026-09-04-platform-release-provider-gates.md`.

2026-09-04T03:58:14+08:00 checkpoint: latest local3507unit tests, final Web/Core builds, audit176/176 and focused browser proofs pass. No push, PR, merge, hosted migration/bootstrap/configuration or deployment has occurred. Production recovery/SMTP gates and full route acceptance remain open. Current passing local results do not constitute a production release authorization bypass.

| Timestamp | Kind | Result | Evidence |
| --- | --- | --- | --- |
| 2026-09-04T01:49:41+08:00 | Read-only production surface verification | PASSED | Public health/readiness/version checks passed; deployed short SHA `0a248bc08c37` |
| 2026-09-04T01:49:41+08:00 | Local database release planner | BLOCKED | Locally configured Postgres password was rejected; planner made no changes |
| 2026-09-04T02:01:30+08:00 | Disposable PostgreSQL 17 release lane | PASSED | All 158 source migrations replayed; catalog verifier and focused ADR-027 runtime proof passed |

Current source/provider boundary: last provider evidence records 157 applied through `20260901141949`; source contains 158 with `20260904020000` pending. No hosted migration has been applied in this task.

Read-only connector verification on 2026-09-04: exact ERP project `aqqrtkmtcsfkbyyqxowv` is ACTIVE_HEALTHY on PostgreSQL17.6. SQL aggregate proof confirms157 applied migrations, latest20260901141949, no platform assignment table, exactly one matching fixed-email Auth identity and exactly one verified/non-deleted match. No UUID, email list, secrets, or production records were extracted. This proves the intended identity exists, not that it has been bootstrapped or that restore/PITR gates are satisfied.
