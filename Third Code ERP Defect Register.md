# Third Code ERP Defect Register

## Cortex release provider gate — 2026-09-05

Cortex usability fixes deployed614395fc3b96 and browser verified. Remaining
P2 operational gate: recovery request throttled by Supabase email quota429 during
workflow33967263740. No Auth code/config changed in Cortex release. Rotation
proof skipped after failure. Do not bypass limits or purchase upgrade automatically.

## Cortex usability repairs — local 2026-09-05

Implemented and browser verified: overlapping graph labels/tiny initial fit,
detail overlay and horizontal relationship overflow, activity-first hierarchy,
mobile clipped chat actions/focus title, missing malformed-graph retry, compact
source links looping back to the same focused graph. Bounded light workspace,
collision-aware graph, accessible Records view and expanded sources now available.
Not deployed. No production data deletion or AI-provider capability expansion.

## Settings release status — 2026-09-05 19:29 +08:00

LIVE9a6b87816499: Finance tab strip removed; Settings team and project
invoice/payment links connected; owner/admin integration configuration status;
saved notification display preferences applied to bell. Mobile bell clipping
fixed and regression-tested at320/390/768/1024/1440 widths.

P2 EXTERNAL SETUP: Email/SMS activation still needs provider credentials/sender
configuration. Resend question pending user response. Integration status panel
reports configuration presence, not connectivity or end-to-end delivery. Existing
Inngest free setup retained. Optional DocuSeal has existing canvas fallback.

EXCLUDED BY REQUEST: subscription billing. No payment gateway added or money
transferred. Existing invoice/cash backend reused, not claimed as a newly built
accounting subsystem. DraftPR32 excluded because unrelated gates remain failing.

P3 KNOWN, NOT FIXED IN THIS RELEASE: React419 recoverable breadcrumb-navigation
diagnostic from invalid/missing-record Cash/Journals pages. Direct route renders
pass; this does not certify the extended navigation edge case.


## FINAL status — 2026-09-05 18:07 +08:00

RESOLVED AND LIVE: journal collection404, prior UUID page crashes, project entry
links, print layouts, Inngest production signing configuration, Railway CLI
skip/hang handling and root.npmrc upload omission. Release e8c1b481607c; all
mandatory release gates passed. Final132page direct sweep has no failed row.

REMAINING (not hidden by that result):

1. P3 shared React419 recovery diagnostic on client navigation away from invalid
   record screens. Strict zero-error breadcrumb test fails, but destination renders
   correctly. Proven on Cash and Journals; no server500 or data failure observed.
2. Production business email provider not configured (RESEND_API_KEY, EMAIL_FROM).
   Existing Inngest registration does not make email delivery operational.
3. Optional DocuSeal configuration absent; native canvas fallback exists. Full
   provider signature workflow not certified.
4. Coverage:27page cases guard-only,15mutation-only handlers not executed; positive
   portal/token/detail and broad production mutations remain unverified. Nine
   Inngest jobs registered, but only validation-only execution proof performed.
5. Platform draftPR32 remains excluded: failing checks and additional migration
   are not part of this verified code-only release.
6. P2 merge enforcement: PR36 auto-merge request merged immediately before checks;
   subsequent checks passed. PR37 explicitly waited for all successful gates.
   Repository enforcement configuration needs separate policy verification.

This is a successful deployment with explicit remaining limitations, not proof
that every requirement in the original pasted prompt is implemented end-to-end.


## Superseding production findings — 2026-09-05 17:20 +08:00

18:06 follow-up: journal collection404 RESOLVED in livee8c1b481607c. Collection,
new journal and invalid-ID guard each pass the unchanged full route-audit checks
(HTTP200, expected content, zero console/page errors during navigation).

P3 SHARED RENDERING DIAGNOSTIC, OPEN: extended navigation AWAY FROM an invalid-ID
missing-record screen emits two React419 recovery errors, then reaches the correct
destination. Reproduced3/3 strict journal breadcrumb tests (84050), preserving the
initial93959 failure. Phase-isolated diagnostic8244 confirms the same behavior on
Cash and Journals: initial guard render has no errors; source HTML contains the
intentional NEXT_HTTP_ERROR_FALLBACK;404 digest; clicking breadcrumb emits419 but
finishes on Cash/Finance with correct heading. No server error/fatal log found.
This is not a claim that the strict zero-error breadcrumb test passed. No assertion
or error handler was suppressed. It is separate from the fixed missing-route404.
React explains419 as an unfinished server Suspense boundary switching to client
rendering: https://react.dev/errors/419 . Navigation succeeds; no P0/P1 impact
observed. A framework-level recovery change needs a dedicated regression scope;
do not weaken notFound/auth guards or rewrite shared navigation simply to hide it.

- P2 RELEASE GOVERNANCE: requesting auto-merge on PR36 merged immediately before
  checks finished. All checks subsequently passed and the production workflow
  independently gated release, but automatic waiting was not enforced. Current
  mitigation: explicit inspection of all successful checks before normal PR37
  merge; never use --auto as evidence of a test gate. Repository enforcement
  settings need a separate verified policy review, not assumed protection.

- RESOLVED: Inngest signing configuration is now valid; nine functions registered,
  safe validation-only run completed, free Hobby tier retained. Earlier missing-key
  HTTP500 below is historical. All nine real business workflows are not certified.
- RESOLVED: main release 5c38986cd1a7 deployed successfully to Vercel and both
  Railway services; mandatory production tests passed. Prior route/print fixes live.
- P2 OPEN: 131-page production sweep returned 103 successful renders, 26 guard-only
  passes and two journal navigation failures. Both journal documents actually
  return HTTP200 with correct headings; browser captured HTTP404 from their shared
  `/finance/journals` breadcrumb. Guarded collection redirect is in local follow-up
  branch codex/finance-journal-index, with nine targeted tests passing. Not deployed yet.
- COVERAGE GAP: valid records/tokens unavailable for 26 guard-only cases; no broad
  business mutations run in production. All35 handlers inventoried,20 anonymous GET
  boundaries probed,15 mutation-only handlers not executed by this sweep.
- CONFIGURATION GAP: production RESEND_API_KEY and EMAIL_FROM missing; actual
  outbound business email remains unverified. Optional DocuSeal configuration
  missing; canvas fallback exists, so this is not a claim that all signing is broken.
- EXCLUDED: platform draft PR32 remains unmerged because its checks fail. Its extra
  migration and eight platform pages were not part of the release. Preserve worktree.


## Live audit findings — 2026-09-05 (in progress)

- P1 background integration: `/api/webhooks/inngest` returns HTTP500 on
  production revision `0a248bc08c37`. Vercel runtime log explicitly identifies
  missing `INNGEST_SIGNING_KEY`. Production env-name inventory confirms no
  Inngest keys. Existing local signing credential rejected by official Inngest
  `/v2/apps` with HTTP401. Do not copy that invalid credential or enable dev
  mode. Browser tab opened at Inngest sign-in; requested existing-account login
  asynchronously. Background-job registration/delivery not verified.
- Baseline reproduced missing project entry pages and invalid UUID server
  errors. These are already fixed in pending release `3564ebe8fac7`; do not
  duplicate changes. Full baseline audit still running, then rerun live.
- New exhaustive audit harness uses controlled admin identity and only RLS
  reads of entity IDs; no business forms submitted, tokens enumerated, or
  mutations claimed. Distinguishes positive render from guard-only coverage.


Linked from [[Third Code ERP Control Center]].

Last updated: 2026-09-04T07:12:00+08:00

## Superseding user direction

### Route repair pass — 2026-09-04 06:10 +08:00

- D-022 P2 repaired and browser-verified locally: real-project sweep found no level-one heading on Audit, Billing, Checklist, Comments, Cost, Permits and Scope. Added/promoted semantic headings, preserving existing styles and authorization. All18 project pages now pass. Removed unsupported target on the Weekly Reports server-action form; existing report links still open separately.
- D-023 P2 repaired locally: legacy BOM signing iframe linked to nonexistent `/portal/dev-sign/...` and conflicted with the existing frame policy. Complete credential-free HTTPS URLs now open as external links; slugs/invalid URLs show truthful guidance. Approval authorization is unchanged, development links remain disabled, and no security policy was relaxed. Eight render regressions pass after reproducing failures. Removed an unverified email-delivery promise.

- D-021 P2 repaired and browser-verified locally: browser12969 reached Postgres53300 on Inventory/Pipeline after many page compilations. A minimal50-module-reload test created50 pools before the fix and1 after. Cache driver pools by full configuration in development/test only, rebuild ORM schema per module, and release idle sockets with bounded dev/test pools.10 focused tests and database typecheck pass; production/Vercel settings unchanged. All67 static and18 project pages pass, sampled connections5–8 rather than exhaustion.

- D-019 P2 repaired locally: malformed UUID detail URLs reached database queries and crashed the workspace. Reproduced `/claims/invalid-id` in real Next/Postgres with SQLSTATE22P02 (browser session9923). Shared Zod validation now precedes route-param consumption in all47 UUID pages and the project layout.21 unit/inventory tests and all47 malformed-ID browser paths pass (8464,7.4min). Public bearer tokens are deliberately not treated as UUIDs.
- D-020 P2 repaired and browser-verified locally: print group nested html/head/body inside the root document. Render regression failed, then passed after replacing the duplicate document with a scoped print wrapper. All5 print pages consume the repaired layout; valid weekly-report frame content and print-toolbar hiding pass in the real browser.

Database-restoration work and its spending-approval request are canceled by the user. C-004 is not an instruction to perform or propose a restore. Existing migration-release checks remain unchanged and require separate release review; no canceled verification is marked passed. Password-recovery email (D-006) remains in scope.

## Current disposition — 2026-09-04 03:10 +08:00

### Follow-up review — 2026-09-04 05:43 +08:00

- D-017 P2 repaired locally: Resend integration status incorrectly reported configured for key-only setup without `EMAIL_FROM`, while actual delivery requires both. Regression reproduced the bug, then all four configuration/redaction cases passed. No provider health is fabricated.
- D-018 P1 release setup gap repaired in source, not applied: live Core lacks `SUPABASE_SERVICE_ROLE_KEY` and `ERP_WEB_BASE_URL`. The protected promotion now provisions them on the exact Core service after gates, via stdin for the existing GitHub secret and `--skip-deploys`. The regression failed before the change; both workflow contract tests and actionlint pass. SMTP remains separate.
- Local browser startup failure was an absent disposable fixture database, not a production database failure. An empty source-only replay is complete; current full browser/API results are pending in the Verification Ledger.

### Resumed repairs — 2026-09-04 03:35 +08:00

Latest03:53update supersedes pending proof below: D009Windows teardown and D010support browser proof passed, and fixture rows are0. D012Settings browser save/clear/audit passed98159. D013Reports exact-money/real export/truthful labels fixed and browser67010passed. D014Documents role controls/misleading worker claims fixed;13role tests and responsive owner/viewer browser67010passed. D015recent platform authentication gap fixed with20unit tests and Core/browser proof. D016available job/document/KYC operational metrics missing from console: now implemented, two-tenant Core integration/response validation/typechecks passed; browser pending28101. None of these are deployed claims.

- D-008 repaired locally:176/176 audit-trigger coverage, nine focused SQL tests and full442-test DB replay pass. Global state events stay out of tenant audit; failed audit rolls back state.
- D-010 repaired locally: secure/HTTP-only/strict-samesite expiring cookie and Core session validation; missing/expired/ended/wrong-actor/wrong-tenant/malformed denial cases pass. Browser rerun pending.
- D-009 explicit Playwright global teardown implemented; cleanup proof pending browser rerun.
- D-011 P1 repaired locally: a unique trace-ID audit index prevented multi-event invitation workflows. Trace index is now non-unique; event IDs remain unique and audit append-only. Regression passes.
- D-012 P2 repaired locally: Settings allowed row commit before audit, failed to clear blank optional fields, and exposed unusable Edit controls to read-only roles. Transactional audit, Zod bounds/null clearing, role-correct UI and verified platform entry added. Sixteen focused tests pass; browser proof pending.

- D-001: eight platform pages/Core service/schema/bootstrap implemented locally. Browser and database/guard tests passed. Hosted migration, bootstrap, email delivery and release remain blocked.
- D-002: canonical pages implemented; real browser caught streamed200 redirects; Next routing now guarantees308 and preserves queries.
- C-005: all eleven project selectors implemented and browser-verified with a real tenant project.
- New D-005 P2: platform lists were capped at100 with no navigation. Search/pagination and invitation-tenant search added; latest five-case browser rerun passed.
- New D-006 P1 release blocker: server-initiated recovery used a PKCE-only callback. Provider-verified token-hash receipt added with14 passing callback/binding tests. Hosted recovery template still uses ConfirmationURL; SMTP is not configured. Requires coordinated provider release.
- New D-007 P2: platform command logs were `unknown.command` and audit generated unrelated trace IDs. Added named operation mapping, propagated request trace ID,43 passing guard/observability tests.
- New D-008 P1 audit gate: local `verify:audit-coverage` reports172/176 tables. Missing audit triggers: pre-existing `document_upload_reservations`, `project_retirement_requests`; new global `platform_support_sessions`, `platform_user_invitations`. Platform service writes are explicitly transaction-audited, but the generic trigger gate and all lifecycle paths require reconciliation/proof. Do not suppress the gate or assert complete audit coverage.
- New D-009 P2: Windows browser-runner shutdown killed the harness before signal cleanup. Verified synthetic fixture records were removed manually from the disposable loopback database and zero remaining browser tenants confirmed. Add reliable teardown before the next harness run.
- New D-010 P1 acceptance gap: ADR027 requires opaque HTTP-only support-session binding and revalidation for supported cross-tenant operations. Current persistent actor-scoped support banner/session is not that full binding. Tenant RLS was not widened; do not claim support-context acceptance until implemented and negatively tested.
- Confirmed C-004: managed daily backup exists2026-09-03 17:24:58UTC; PITR disabled; Storage recovery/isolated restore drill unproven. See [[docs/blockers/2026-09-04-platform-release-provider-gates]].

## Initial discovery (current disposition above is authoritative)

| ID | Severity | Defect | Evidence | Status |
| --- | --- | --- | --- | --- |
| D-001 | P1 | Required `/platform-admin` API/Web console is absent | ADR-027, schema, migration, and database controls are now locally verified; all eight pages and independently guarded APIs remain to implement | In progress |
| D-002 | P2 | Pipeline route contract is inverted/missing | `/pipeline` redirects to `/pipeline/conversion`; `/pipeline/list` is absent; `/pipeline/board` and `/pipeline/conversion` are full pages | Confirmed; queued after security foundation |
| D-003 | P1 | Fresh database replay was broken by an incomplete disposable Supabase surface | Recovered `20260901141949` used `storage.buckets.allowed_mime_types`, absent in CI bootstrap | Fixed locally; 158-migration replay, 438 database tests, 64 API integration files, and schema immutability now pass |
| D-004 | P2 | RLS isolation proof expected obsolete browser project UPDATE access | ADR-025 already revoked all authenticated project DML; the stale test failed on the stronger `42501` denial | Fixed locally; test now proves the intentional fail-closed Core-only mutation boundary |

## Candidates

| ID | Severity | Candidate | Evidence needed | Status |
| --- | --- | --- | --- | --- |
| C-003 | P2 | Some routes may lack complete loading/error/permission states | Route-state inventory and browser tests | Investigating |
| C-004 | P1 | Existing production migration-release checks require reconciliation for migration158 | Current planner and sole-owner bootstrap | Restoration task canceled by user; workflow unchanged; local disposable replay is green |
| C-005 | P2 | Eleven supplied project-context entry routes are absent | Trace each to existing project feature routes and implement safe selectors | Confirmed missing; workflow mapping in progress |

## Severity

- P0: critical outage, data-loss, or active cross-tenant/security exposure.
- P1: broken core workflow, release blocker, or major authorization/integrity defect.
- P2: important functional, UX, or operational defect.
- P3: lower-priority improvement.
