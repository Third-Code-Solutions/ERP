# Next Actions

## Immediate hosted release gate

Do not apply the seven pending Supabase migrations or deploy Railway/Vercel
until the owner supplies:

1. The canonical `AUDIT_RECOVERY_TENANT_ID` UUID for the audit-chain planner.
2. A record-level decision for the one duplicate Purchase Order-number group
   (`12` demo records, one tenant, one project). Do not auto-renumber issued
   records; preserve a reviewable mapping and rollback plan.

Then run the read-only planners again. Only when migration ledger, duplicate
review, audit recovery, Railway readiness, and Vercel readiness are all clear:

- apply the seven migrations in timestamp order with a captured ledger;
- run the disposable and hosted verification gates;
- deploy exactly one reviewed source SHA to Railway and one controlled Vercel
  production build, after confirming the billing impact;
- verify live revision identity, readiness, protected flows, browser behavior,
  database state, logs, and rollback before calling production green.

Current source SHA: `ef1021f0df799014bff79fe782a31507f33969f5` on
`origin/agent-02/third-code-erp-landing`, authored by `kurtgav`.

## Exact next product action

Add idempotent automatic-RFQ notification delivery to NestJS/BullMQ without
enabling production cutover:

1. Write the original notification outbox, delivery, retry, dead-letter,
   observability, and rollback contract before code.
2. Store notification intent in PostgreSQL in the same transaction as a newly
   created automatic RFQ. Exact RFQ replay must create no second intent.
3. Keep recipient resolution tenant-scoped and server-derived. Do not put
   unrestricted business content or credentials in Redis.
4. Deliver through BullMQ with bounded retry and one durable terminal-failure
   record. Notification failure must never roll back or repeat the official RFQ
   transaction.
5. Preserve Inngest as the only production producer while the automatic Nest
   gate is absent/false.
6. Prove creation, replay, tenant denial, delivery retry, dead-letter, Redis
   restart, one RFQ, one RFQ audit, and one notification intent against
   disposable PostgreSQL 17 and Redis 7.4.9.
7. Leave `ERP_RFQ_AUTO_DISPATCH_VIA_API` and its tenant allowlist unset.
8. Do not reconnect Vercel Git or trigger a frontend build.

## Frontend deployment remains approval-gated

- Keep Vercel Git disconnected. Do not create a preview.
- Retain production deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Reconfirm zero newer deployments before any future action.
- Recheck billing and disclose the exact expected charge.
- Obtain explicit user approval for one queued Standard production build.
- Never duplicate a queued or running build.

## Standing M1 controls

Complete remaining M1 controls without enabling production writes:

1. Treat hosted Supabase migration `20260729162944` as the current 54/54
   baseline. Do not replay it or edit applied migration history.
2. Treat organization type as constrained tenant profile data only. Never use
   it for roles, capabilities, memberships, approvals, or tenant access.
3. Keep deployed tenant-canary source at
   `ERP_PROJECT_WRITES_VIA_API=false`; leave the tenant allowlist empty.
4. Obtain explicit approval for one unused user-controlled email identity.
   Through live `/auth/signup`, create and confirm the account; do not use
   direct SQL or a service-role provisioning script.
5. As that new Admin, create one non-critical reversible E2E Project through
   `/projects/new`. Do not repair or waive existing tenants' historical audit
   mismatches.
6. Run `pnpm plan:project-cutover -- --require-ready` against that exact target.
   Capture the complete mutable Project baseline in a restricted release
   artifact; keep identifiers and business values out of Git and logs.
7. Before any paid frontend build, confirm the exact expected Vercel charge
   and obtain user approval. Do not reconnect Git or create a duplicate
   preview.
8. After approval, perform the provider-level enable/rollback drill for the
   controlled tenant:
   capture provider configuration, enable exact `true`, prove one compatible
   Web-to-Nest demo command and reconciliation, restore exact `false`, and
   prove the legacy branch is selected.
9. Record provider release IDs, runtime logs, final data reconciliation, and
   the tested rollback procedure before starting M2.
10. Keep transient runner registration, processes, credentials, and work
    directories at zero after every disposable verification run.
11. Before M2 code, obtain owner sign-off for a dedicated `AGENTS.md`
    reconciliation: remove the missing PRD bootstrap dependency and replace
    obsolete pnpm 9, PostgreSQL 16, tRPC, and Inngest target rules with the
    approved architecture. Do not mix that governance rewrite into canary work.

## Prepared frontend release candidate

- Landing mobile QA correction is source-only. Keep Vercel Git disconnected.
- Before any frontend deployment, re-confirm zero new deployments, disclose the
  exact provider charge, and obtain explicit user approval.
- If approved, deploy the single reviewed green SHA once. Do not create a
  duplicate preview and production build.
- After deployment, repeat 1440/768/390 browser checks, metadata/JSON-LD,
  interactions, analytics, health/readiness, console, and exact release
  identity before calling the frontend slice complete.
- Include upload tenant-Project hardening in that same reviewed SHA. After
  deployment, verify same-tenant signed upload and document recording plus a
  non-mutating cross-tenant/missing-Project denial. Do not buy a separate build
  for this security candidate.
- Include document mutation authority in that same reviewed SHA. Use the
  controlled canary tenant to prove `viewer` denial, authorized signed upload,
  atomic document/audit creation, reversible deletion, deletion audit, and
  post-commit Storage cleanup. Do not exercise destructive proof against
  historical demo documents and do not buy another build.
- Include the canonical Cortex registry in that same reviewed SHA. After
  deployment, use authorized Admin, finance, procurement, estimator, sales,
  and viewer sessions to verify graph filtering, citation labels, record
  navigation, finance/inventory entity context, and non-enumerating denial.
  Do not buy a separate build for this source-only consistency change.
- Include grounded citation navigation in that same reviewed SHA. Verify the
  answer body remains plain text, new and restored citations open the exact
  authorized record, malformed/stale citations disappear, and a role downgrade
  removes now-forbidden sources. Do not buy a separate build.
- Include operational record context in that same reviewed SHA. Verify one
  populated and one empty record per role family across CRM, finance,
  procurement, inventory, claims, variation, punchlist, and warranty. Confirm
  exact links, Project-panel non-duplication, and non-enumerating denial. Do not
  buy a separate build.
- Include directional relationship meaning in that same reviewed SHA. Verify
  representative incoming/outgoing edges, origin labels, exact record links,
  unknown-edge fallback, role-downgrade omission, and responsive behavior. Do
  not buy a separate build.
- Include the Cortex evidence trail in that same reviewed SHA. Verify mutation
  evidence on an authorized populated record, all safe future origin labels,
  exact newest-first order, empty state, role-downgrade/cross-tenant denial,
  and absence of every raw provenance field. Do not buy a separate build.
- Include the focused Cortex neighborhood in that same reviewed SHA. Verify a
  real record backlink, exact server-derived focus, bounded one-hop response,
  restricted-role and cross-tenant non-enumerating denial, whole-graph
  compatibility, and 1440/768/390 console/overflow behavior. Do not reconnect
  Git or buy a separate preview.
- Include Cortex saved-conversation deep links in that same reviewed SHA.
  Verify exact-context and company-wide restore, foreign/revoked/mismatched
  denial, one-click cross-record history navigation, URL synchronization after
  create/load/new-chat, stale-response suppression, and absence of
  tenant/user/content data in URLs.
- Include Cortex recent-conversation search in that same reviewed SHA. Verify
  the visible recent-count boundary, title and human record-scope matching,
  company-wide and empty states, clear/reset, keyboard focus, 44px mobile
  targets, and absence of internal identifiers. Do not expand the API or buy a
  separate build.
- Include the permission-aware dashboard in that same reviewed SHA. Verify one
  authorized executive role retains pipeline analytics and one restricted role
  receives only assignee-scoped work and permitted links. Confirm no executive
  query/content leak, 1440/768/390 behavior, and session revocation.
- Include permission-safe universal search in that same reviewed SHA. Verify
  literal `%`, `_`, and backslash handling, private/no-store responses,
  joined-record tenant isolation, per-role result types, authorized normal
  search, command-palette navigation, and 1440/768/390 behavior. Do not expand
  result scope or buy a separate build.
- Include the private Search-to-Cortex handoff in that same reviewed SHA.
  Verify explicit Search/Ask modes, zero Ask-mode search requests, opaque
  prompt-free routing, one-time/expiring browser state, exact composer prefill,
  zero chat request before Send, and 1440/768/390 behavior. Do not buy a
  separate build.
- Include atomic public canvas signing in that same reviewed SHA. Use a new,
  controlled, non-historical signing session to prove bounded PNG validation,
  one-shot locking, tenant-scoped source stamp, nullable-actor audit, exact
  document linkage, replay denial, and compensating Storage cleanup. Do not
  exercise destructive proof against existing signatures and do not buy a
  separate build.
- Include atomic RFQ auto-dispatch in that same reviewed SHA. Verify one
  controlled same-tenant approval creates one RFQ and one audit, a replay
  returns the same RFQ without duplicate notification, direct browser writes
  remain denied, and the current/manual compatibility contract is preserved.
  Do not buy a separate build.
- Include atomic RFQ quote/terminal workflow in that same reviewed SHA. Verify
  one controlled quote, exact retry, conflicting-key denial, full-coverage
  completion, invalid transition denial, actor-attributed audits, and
  post-commit notification behavior. Do not buy a separate build.

## Following milestone

M2: remove the Python `scope_items` direct-write path. Python returns immutable
processing evidence; BullMQ transports it; a new Nest command authorizes,
idempotently validates, and commits accepted changes.

Design is ready at
`docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`. First code
slice is inert M2.1: contracts, composite tenant constraints, durable
job/evidence state, explicit capabilities, and a Nest BullMQ processor with no
caller. Do not begin it until M1 canary and separate `AGENTS.md`
reconciliation gates pass.

## Next unblocked integrity slice

RFQ quote and terminal NestJS adapters are source-complete and disabled.
Next safe work:

1. Keep `ERP_RFQ_QUOTE_WRITES_VIA_API` and
   `ERP_RFQ_TERMINAL_WRITES_VIA_API` absent/false everywhere.
2. Do not enable either allowlist without an approved clean canary tenant,
   exact baseline capture, monitoring, reconciliation, and tested rollback.
3. Continue a different bounded backend authority slice that needs no
   provider write, frontend deployment, or governance bypass.
4. Preserve compatibility behavior and add real PostgreSQL evidence before
   removing any Next.js transaction service.
5. Do not begin broad finance migration, Python write removal, or M2 until
   their standing approval and canary gates are satisfied.

## Do not start yet

- No finance migration before M1 integration evidence.
- No broad Server Action replacement.
- No production feature-flag enablement.
- No new microservices.
- No external ERP source, schema, UI, or wording reuse.

## Exact next action after RFQ adapters

1. Keep `ERP_RFQ_QUOTE_WRITES_VIA_API` unset/false everywhere.
2. Keep `ERP_RFQ_TERMINAL_WRITES_VIA_API` unset/false everywhere.
3. Verify M1 Railway/Supabase readiness and a real tenant/auth canary account.
4. Present the exact tenant UUID, environment changes, monitoring, and
   rollback for approval.
5. If approved, canary quote and terminal adapters independently. Verify quote
   create/retry/conflict, covered completion, repeat conflict, cancellation
   reason evidence, logs, and reconciliation after each gate.
6. Do not enable wildcard routing or deploy Vercel without explicit approval.

Provider inspection result:

- No existing tenant may be used for the canary.
- Await explicit approval for one unused user-controlled email, then use normal
  signup and authenticated Project creation.
- Await explicit owner sign-off before reconciling root `AGENTS.md` from pnpm
  9/PostgreSQL 16/tRPC/Inngest rules to the approved pnpm 10/PostgreSQL
  17/NestJS/Redis/BullMQ modular-monolith architecture.
- Until both approvals exist, keep all cutover flags disabled and continue only
  source work that does not bypass those gates.

## Exact next action after public-origin portability

1. Keep Vercel Git disconnected and create no Vercel preview or production
   deployment.
2. Review a no-cost/self-hosted frontend target that can run this dynamic
   Next.js CSP-nonce architecture; static-only hosting is not equivalent.
3. Before any alternative-host build, set its canonical
   `NEXT_PUBLIC_SITE_URL` and verify metadata, structured data, robots,
   sitemap, auth callback allowlists, portal links, CSP, and Supabase redirect
   URLs against that exact hostname.
4. Keep the retained Vercel production artifact as rollback until the
   alternative passes authenticated browser, API, database, Redis, logs, and
   tenant-isolation proof.
5. Do not cut traffic, reconnect Git, or remove Vercel until explicit approval.

## Exact next action after standalone runtime preparation

1. Keep Vercel Git disconnected. Create no preview or production deployment.
2. Select an already-owned Linux host with Docker and a controlled test
   hostname; do not purchase infrastructure without explicit approval.
3. Build and scan `apps/web/Dockerfile` on that host using the exact reviewed
   SHA and test hostname.
4. Add the test hostname to Supabase Auth redirects, then verify health,
   readiness, authenticated login, tenant isolation, portal links, Cortex,
   browser console, responsive layouts, logs, restart behavior, and rollback.
5. Present exact DNS, redirect, monitoring, rollback, and cost impact before
   any traffic cutover. Retain Vercel throughout the proof.

## Exact next action after RFQ notification outbox

1. Keep `ERP_RFQ_AUTO_DISPATCH_VIA_API`,
   `ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false.
2. Do not add `RESEND_API_KEY`, `EMAIL_FROM`, or `ERP_WEB_BASE_URL` for this
   disabled path until a controlled canary is approved.
3. Prepare a read-only purchase-order creation authority audit: current
   Server Actions, direct writes, approval states, money types, tenant
   constraints, audit behavior, notification side effects, tests, and rollback.
4. Specify the smallest disabled NestJS purchase-order adapter. Preserve
   current API/UI behavior and prohibit browser writes to sensitive tables.
5. Require a clean PostgreSQL 17/Redis lane, full repository gates, and exact
   provider evidence before deployment.
6. Keep Vercel Git disconnected. Create no preview or production frontend
   deployment.

## Exact next action after the controlled production release

1. Keep Vercel Git disconnected. Do not reconnect automatic deploys.
2. Create no Vercel deployment for documentation-only commits. The next
   frontend release requires changed application source, full green gates, and
   explicit production authorization.
3. Keep `ERP_RFQ_AUTO_DISPATCH_VIA_API`,
   `ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false.
4. Begin the read-only purchase-order transaction-authority audit: Server
   Actions, direct writes, approval state machine, exact money types, tenant
   constraints, audit, notifications, idempotency, tests, and rollback.
5. Specify only the smallest disabled NestJS purchase-order adapter after the
   audit. Preserve current UI and API behavior.
6. Continue using Supabase project `aqqrtkmtcsfkbyyqxowv` as the source of
   truth. Apply only migrations proven missing from its ledger.
7. Retain Vercel deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` and Railway
   deployment `50fad0aa-8506-457a-a405-152dc31d2340` as rollback evidence.

## Exact next action after 2026-08-01 PO authority milestone

1. Keep Vercel Git disconnected. Create no Vercel preview or production
   deployment; this milestone hardened server-only PO actions and added a
   disabled backend contract, with no release authorization.
2. Keep `ERP_PO_CREATE_WRITES_ENABLED` absent/false. Do not allow any tenant
   to call provisional Nest PO route until it has durable idempotency and a
   committed transaction implementation.
3. Design one tenant-composite idempotency migration for standalone PO create;
   replay full 56-migration candidate set in disposable PostgreSQL 17 and
   prove duplicate-request, rollback, tenant-isolation, audit, and budget
   assertions before applying hosted SQL.
4. Implement Nest standalone PO transaction with row locks, exact money
   calculation, same-tenant references, line inserts, audit, and original
   result replay. Python remains advisory only.
5. Add server-only tenant allowlist and Next fail-closed client for standalone
   create command. Canary one approved demo tenant only after Railway
   readiness, logs, reconciliation, and rollback evidence pass.
6. Migrate PO approval, issuance, receiving, and BOM/grouped generation as
   separate bounded slices. Do not combine them with frontend redesign or a
   Vercel deployment.

## Exact next action after standalone PO transaction seam (2026-08-01)

1. Keep both PO write flags false and keep Vercel Git disconnected; create no
   Vercel preview/production deployment and no Railway release.
2. Start disposable PostgreSQL 17 and Redis when Docker is available, replay
   all 56 repository migrations, and run real API probes for first commit,
   exact retry replay, conflicting key, rollback, cross-tenant rejection,
   audit, concurrent number allocation, and centavo bounds.
3. Compare the disposable schema and migration ledger with Supabase project
   aqqrtkmtcsfkbyyqxowv without applying SQL. Resolve any preflight duplicate
   PO numbers before considering a hosted migration.
4. After review and readiness/log/reconciliation/rollback evidence, enable the
   Nest and Next gates for one approved demo tenant only. Keep the legacy path
   available and revert flags immediately on any mismatch.

## Exact next action after landing regression milestone (2026-08-01)

1. Keep Vercel Git disconnected and do not create a preview or production
   deployment while this source-only milestone is being reviewed.
2. Keep both PO write flags false; do not apply the candidate migration to
   hosted Supabase project `aqqrtkmtcsfkbyyqxowv`.
3. Use an already available owned Linux or CI runner (no new paid service) to
   replay all 56 migrations against PostgreSQL 17 with Redis and run the real
   PO commit/replay/conflict/rollback/cross-tenant/audit/number-concurrency/
   centavo probes.
4. Reconcile the disposable schema with Supabase's 55/55 ledger, review the
   migration preflight warnings, then request explicit release approval for a
   one-tenant canary only after Railway readiness, logs, reconciliation, and
   rollback evidence are green.

## Exact next action after disposable authority proof (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED` and the matching Next gate false; do not
   apply migration 20260801090000 to hosted Supabase yet.
2. Obtain a read-only hosted Supabase migration/catalog comparison and resolve
   the known 55/56 ledger difference plus defensive-constraint review.
3. Re-authenticate Railway as `kurtgavin.design@gmail.com` and Vercel with the
   `kurtgav` account; verify exact project/service identity, current rollback
   deployment, readiness, logs, and spend controls.
4. Only after those checks, request an explicit one-tenant canary approval;
   deploy one controlled release, verify protected HTTP/browser/data flows,
   then enable flags for that tenant. Keep legacy Server Actions as rollback.

## Exact next action after PO approval workflow slice (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED` and
   `ERP_PO_WORKFLOW_WRITES_ENABLED` absent/false; keep both tenant allowlists
   empty. Existing Server Actions remain the rollback path.
2. Reconcile Supabase project `aqqrtkmtcsfkbyyqxowv` read-only against all 57
   repository migrations. Apply no SQL until the ledger, duplicate checks,
   constraint review, and RLS/grant evidence are recorded.
3. Authenticate Vercel and Railway with `kurtgav`
   (`kurtgavin.design@gmail.com`), verify exact project/service identity,
   current revision, readiness, runtime logs, and spend controls.
4. Run the full local gates again on the reviewed SHA. If a canary is approved,
   deploy once, verify protected HTTP/browser/data/audit behavior, then enable
   only the selected tenant workflow flag. Roll back flags first on mismatch.
5. Keep SCM issuance/email, receiving, BOM/grouped creation, and UI cutover as
   separate milestones; do not bundle them into this release.

Hosted read-only evidence now exists: Supabase is PostgreSQL 17 at 55 applied
migrations, while this branch is 57/57. Only the two reviewed candidate
suffixes are missing; no hosted migration was executed. Provider identity and
canary approval remain the next external gates.

The client seam is ready but intentionally unused. Before enabling it, add
transactional notification intent/recipient parity in Nest, replay that lane,
then canary only the first four workflow transitions for one tenant. Keep SCM
issuance and supplier email on the legacy path until separately migrated.

## Exact next action after PO workflow notification parity (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED`, `ERP_PO_WORKFLOW_WRITES_ENABLED`,
   `ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false; keep all matching
   tenant allowlists empty. Existing Server Actions remain rollback authority.
2. Reconcile Supabase project `aqqrtkmtcsfkbyyqxowv` read-only against all 58
   repository migrations. Review the three linear candidates, hashes, duplicate
   PO numbers, constraint behavior, RLS, and service grants; execute no SQL.
3. Authenticate Vercel and Railway as `kurtgav` /
   `kurtgavin.design@gmail.com`. Verify exact project/service identity,
   current revision, readiness, runtime logs, rollback identity, and spend
   controls before any release.
4. If explicitly approved, deploy one controlled SHA once, verify protected
   HTTP/browser/data/audit/notification flows, then enable only one tenant's
   workflow and notification flags. Roll back flags first on mismatch.
5. Keep SCM issuance, supplier-side email, receiving, BOM/grouped creation,
   and UI delegation as separate milestones.

## Exact next action after read-only project canary audit (2026-08-01)

1. Keep every PO/project/notification write gate and tenant allowlist
   absent/false; keep Vercel Git disconnected and create no deployment.
2. Open a separate, read-only audit-recovery review for the 2 predecessor-link
   and 151 hash mismatches. Do not rewrite audit history or add permissions in
   this milestone; establish provenance and a reviewed repair procedure first.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`, then verify identity, readiness, logs,
   rollback, and spend controls. Provider auth remains unresolved.
4. Re-run the canary planner with an explicitly approved actor that has the
   required capability only after audit integrity is resolved. Do not deploy
   or enable flags while the planner is blocked.

## Exact next action after audit hash parity hardening (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists
   absent/false. The parity code prevents new divergence but does not repair
   historical rows.
2. Prepare a read-only audit recovery report explaining the 2 link mismatches,
   151 historical hash mismatches, affected writer eras, and an immutable
   verification/repair strategy. Do not rewrite `audit_log` in this milestone.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`; verify identity, readiness, logs, rollback,
   and spend controls before any release.
4. Re-run the canary planner with a capability-appropriate actor only after
   audit recovery review passes. Keep provider deployment and flag enablement
separate and explicitly approved.

## Exact next action after read-only audit recovery planner (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists
   absent/false. Treat the hosted planner's `review_required` status as a hard
   release blocker.
2. Use the sanitized day/system-label buckets to identify which historical
   writers produced the 151 hash mismatches and 2 link mismatches. Produce a
   reviewed, immutable recovery procedure; do not rewrite `audit_log` yet.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`; verify exact project/service, readiness, logs,
   rollback, and spend controls. No deploy while either session is unresolved.
4. Only after audit recovery approval and provider evidence, re-run the planner
   with a capability-appropriate actor and request one controlled canary.

## Exact next action after audit hash profile verification (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists
   absent/false. The 111 unknown rows and 2 link breaks are hard blockers.
2. Trace the 40 legacy-JSON rows and 111 unknown rows to reviewed writer
   versions and provenance using read-only evidence. Do not infer or rewrite
   immutable history from counts alone.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`; verify exact project/service, readiness, logs,
   rollback, and spend controls. No deploy while sessions are unresolved.
4. Only after a reviewed recovery decision and provider gates pass, rerun the
   profile verifier and canary planner with an authorized actor, then request
   one controlled release.

## Exact next action after controlled hosted release gate (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED`, `ERP_PO_WORKFLOW_WRITES_ENABLED`,
   `ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false; keep all tenant allowlists
   empty. Do not promote the Vercel preview or redeploy Railway production.
2. Obtain an owner-approved, reversible remediation for the one duplicate
   tenant/PO-number group (12 demo records). Do not rename/delete records or
   weaken the uniqueness guard by inference.
3. After remediation approval, rerun the read-only planner and preflight, then
   apply the unchanged three migrations atomically with ledger recording and
   verify schema, RLS, grants, and readiness. Roll back the transaction on any
   mismatch.
4. Resolve the independent audit recovery blockers (111 unknown historical
   hash rows and 2 predecessor-link breaks), rerun the canary planner with a
   capability-appropriate actor, and only then request one controlled SHA
   promotion under spend limits.

## Exact next action after duplicate-remediation planner (2026-08-01)

1. Give the owner the opaque duplicate report and obtain an explicit,
   reversible decision for the 12 demo records. Do not infer a canonical row,
   rename records, delete records, or weaken the uniqueness guard.
2. Design one forward data-remediation migration from that approved decision;
   replay it in disposable PostgreSQL 17 and verify audit/tenant references.
3. Re-run `plan:purchase-order-duplicates --require-clear` and the hosted
   migration planner. Only when both are clear, apply the unchanged three PO
   migrations atomically and verify ledger, schema, RLS, grants, and readiness.
4. Keep all PO/notification flags false and do not promote Vercel or redeploy
   Railway until the independent audit recovery and canary gates clear.

## Exact next action after clean-room branding guard (2026-08-01)

1. Keep the runtime branding test in the normal web test suite. Any future
   clean-room capability or UI slice must pass it before release review.
2. Continue the owner-approved duplicate remediation path and independent
   audit recovery path; do not use branding evidence as a production-release
   substitute.

## Exact next action after controlled release gate aggregator (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists absent or
   false; do not create a Vercel preview, promote production, or redeploy
   Railway.
2. Obtain an owner-approved, reversible decision for the one duplicate
   tenant/PO-number group containing 12 demo records. Do not infer a canonical
   record or rename/delete data.
3. Set `AUDIT_RECOVERY_TENANT_ID` only to the explicitly approved tenant UUID,
   rerun `plan:controlled-release --require-clear`, and review the sanitized
   audit findings. Do not rewrite immutable audit rows from counts alone.
4. When the gate is clear, apply the unchanged three candidate migrations in
   one transaction, verify ledger/RLS/grants/readiness, and request one
   controlled SHA promotion. Record rollback identity and spend evidence.

## Exact next action after Stock Receipt draft authority (2026-08-01)

1. Keep `ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED` absent/false and its
   tenant allowlist empty. Keep all PO/workflow/notification/project flags
   false; existing Server Actions remain the rollback path.
2. Do not apply `20260801120000_stock_receipt_create_idempotency.sql` (or the
   three earlier PO candidates) to Supabase until the owner-approved duplicate
   remediation and independent audit recovery are complete. Current hosted
   ledger is 55/59; candidate migrations are not a production release.
3. Re-run `node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs
   --json` with an explicitly approved `AUDIT_RECOVERY_TENANT_ID`; require a
   clear result before any provider action. Readiness 200 alone is not enough.
4. Keep Vercel Git disconnected and create no preview/production deployment;
   keep Railway production on its current healthy rollback deployment. A
   future release must be one reviewed SHA, one provider action, and a
   browser/API/data/logs verification under the spend limit.
5. After hosted gates clear, apply the unchanged migrations atomically,
   verify RLS/grants/ledger/readiness, then request a separate one-tenant
   receiving canary. Do not remove the Server Action until parity and rollback
   evidence are recorded.

## Exact next action after CAD parser authority boundary (2026-08-01)

1. Keep the worker evidence-only in every environment; do not restore
   `DATABASE_URL`, `psycopg`, or a Python ERP write helper.
2. Add a NestJS CAD evidence-commit adapter that reuses the shared response
   contract and transaction invariants. Prove tenant isolation, replacement,
   exact totals, audit evidence, malformed response rejection, and rollback in
   disposable PostgreSQL before enabling any flag.
3. Keep the current Next transaction path as the compatibility/rollback path;
   no UI change, hosted SQL, Railway deploy, Vercel deploy, or worker promotion
   is authorized by this source milestone.
4. Independently resolve the existing hosted migration, duplicate Purchase
   Order, and audit recovery blockers before any production promotion.

## Exact next action after NestJS CAD evidence-commit adapter (2026-08-01)

1. Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED` absent/false and its tenant
   allowlist empty. Keep Python evidence-only and do not grant it database
   credentials.
2. Keep the Next CAD transaction as the compatibility/rollback path. Build a
   separate parity/canary test before routing any tenant to Nest authority.
3. Do not apply `20260801130000_cad_evidence_commit_idempotency.sql` (or the
   earlier candidate migrations) to Supabase until the owner-approved
   duplicate PO remediation and audit recovery clear the controlled gate.
4. Do not create Vercel previews, promote production, or redeploy Railway.
   The next hosted action is one read-only controlled-release plan using an
   explicitly approved `AUDIT_RECOVERY_TENANT_ID`; readiness 200 alone is not
   release evidence.

## Exact next action after NestJS CAD processing-job intake (2026-08-01)

1. Keep `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED` absent/false and its tenant
   allowlist empty. Do not enqueue production jobs; the queue has no worker
   bridge yet by design.
2. Implement the private Nest-to-Python evidence adapter with short-lived
   Storage URLs, signed request context, schema validation, and explicit
   queued/processing/succeeded/failed transitions. Add retry, stalled-job,
   duplicate-delivery, and restart integration proof before enabling a flag.
3. Keep the current Next CAD transaction as compatibility/rollback path and
   do not apply `20260801140000_document_processing_jobs.sql` (or earlier
   candidates) to Supabase until duplicate-PO and audit recovery gates clear
   the controlled release planner.
4. Do not create a Vercel preview, promote production, redeploy Railway, or
   reconnect Vercel Git. A future hosted release must be one reviewed SHA,
   one controlled provider action, and browser/API/data/log evidence within
   the spend limit.

## Exact next action after signed CAD evidence bridge (2026-08-01)

1. Keep `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED`,
   `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED`, and
   `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED`, and
   `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` absent/false; keep every
   matching tenant allowlist empty. Do not enqueue production processing jobs.
2. Implement durable source/evidence persistence and the separate idempotent
   Nest draft-BOM command before enabling the bridge or accepting
   `createDraftBom=true`; never mark a partial scope-only result complete for a
   request that asked for a BOM. Keep Next CAD parsing as rollback authority.
3. Re-run the read-only controlled-release planner. The current hosted ledger,
   duplicate PO group, and audit recovery blockers still prohibit Supabase SQL,
   Railway deployment, Vercel deployment, or any flag enablement.
4. After owner-approved duplicate remediation, explicit audit selector/recovery
   review, and provider identity/spend confirmation under `kurtgav`, apply one
   reviewed SHA only. Verify database/RLS/readiness/API/browser/log evidence;
   roll flags back first on any mismatch.

## Exact next action after durable CAD evidence and atomic draft BOM (2026-08-01)

1. Keep `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED`,
   `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED`,
   `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED`, and
   `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` absent/false; keep all matching
   tenant allowlists empty. Do not enqueue production processing jobs.
2. Keep the Next CAD transaction as compatibility/rollback authority. The
   source candidate now persists immutable attempt evidence first, then joins
   scope and requested BOM writes atomically in Nest; run a dedicated canary
   only after hosted schema parity and provider gates clear.
3. Re-run the read-only controlled-release planner with an explicitly approved
   `AUDIT_RECOVERY_TENANT_ID`. Current hosted migration drift, duplicate PO
   numbers, and missing audit recovery selector still prohibit Supabase SQL,
   Railway deployment, Vercel deployment, or flag enablement.
4. Once the planner is clear, apply one reviewed migration/SHA release, verify
   RLS/grants/ledger/readiness plus protected API/browser/log evidence, and use
   one reversible provider action under the `kurtgav` spend limit.

## Exact next action after CI run 30707238189 (2026-08-01)

1. Obtain the canonical owner-approved `AUDIT_RECOVERY_TENANT_ID` UUID.
2. Obtain explicit record-level remediation for the one 12-record tenant/PO
   duplicate group; do not renumber issued records automatically.
3. Re-run `node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs --json`.
4. Only if status is `clear`, apply one reviewed SHA to Supabase, then deploy
   Railway and one Vercel production build with spend limits; verify live
   readiness, protected API/browser flows, logs, and exact release identity.

## Exact next action after M2.5 processor canary (2026-08-02)

1. Keep all document-processing, evidence-commit, and draft-BOM flags absent or
   false; keep tenant allowlists empty.
2. Keep the new recovery entry point dormant. Design a periodic recovery
   scheduler with explicit flag/tenant gates and observability before enabling
   it; keep the Next compatibility path authoritative.
3. Obtain the owner-approved audit tenant UUID and record-level PO duplicate
   remediation, then rerun the controlled-release planner.
4. Only a `clear` planner result authorizes one reviewed Supabase migration
   release followed by one spend-bounded Railway/Vercel production action.
