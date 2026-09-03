# ABI OPS functional-completeness work state

Last updated: 2026-09-03 (Asia/Singapore)

## Delivery contract

Goal: verify and repair existing ABI OPS functionality for the repository's
thirteen-role authorization vocabulary, one end-to-end workflow at a time.
Password management, legacy project-chat authorization, project-detail
authorization, legacy route-policy alignment, fail-closed dashboard routing,
Material search/destination alignment, opportunity CSV export hardening, and
the atomic Won-to-Project handoff, all-stage atomic Pipeline transitions, and
Project-detail Opportunity create/transition, atomic daily-task completion,
atomic PPRF submission, and atomic site-inspection/RFI creation are the thirteen
completed local implementation slices; all remain `PARTIAL`
under the strict live-data definition of done.

Current work-order scope:

- authoritative role, route, API, navigation, and action inventory;
- account recovery from sign-in;
- self-service password change at `/settings/profile` for every role;
- automated and real-browser verification;
- evidence-backed RBAC and functional status.

Out of scope for this slice: schema changes, UI redesign, invented modules,
provider configuration mutations, and production deployment before the
repository's release gates pass.

## Verified inventory baseline

| Measure | Count | State |
| --- | ---: | --- |
| Authoritative persisted roles | 13 | VERIFIED from source and migrations |
| Supplied browser-test accounts | 11 | VERIFIED from the request and E2E helper |
| Missing browser identities | 2 | BLOCKED: `estimator`, `pm` |
| Next.js page routes | 118 | VERIFIED by source inventory and production build |
| Session/recovery-protected page routes | 104 | VERIFIED by route inventory + middleware policy |
| Explicit HTTP operations | 175 | Prior source inventory plus the mounted daily-task completion command (134 Nest, 41 Next) |
| Protected role/resource matrix records | 1,456 | VERIFIED as 16-column syntactically readable CSV records |
| Automated-tested role/resource matrix records | 197 | VERIFIED from parsed CSV rows whose `Automated test` result is not `NOT TESTED` |
| Verified role/resource combinations | 0 | Strict full-route definition not yet met; tested rows remain PARTIAL or BLOCKED |
| Failed role/resource combinations | 0 | No FAILED matrix rows remain after route-alias and project-audit reconciliation |
| Needs-decision role/resource combinations | 32 | Parsed CSV total; existing product-policy decisions remain open |
| Not-tested role/resource combinations | 1,071 | Parsed CSV total |
| Partial role/resource combinations | 331 | Parsed CSV total after site-inspection/RFI workflow closeout |
| Blocked role/resource combinations | 22 | Prior blocked coverage plus Daily-task, PPRF, and site-inspection/RFI workflow rows for the missing `estimator` and `pm` identities |
| Browser-blocked matrix records | 279 | Parsed CSV total; includes all 13 atomic site-inspection/RFI workflow rows and the 13 inspection-history route rows |
| Live-not-run matrix records | 145 | Parsed CSV total; includes all 13 atomic site-inspection/RFI workflow rows and the 13 inspection-history route rows |
| Prioritized functional workflows | 13 | Password management, project-chat boundaries, project-detail boundaries, legacy route-policy alignment, fail-closed dashboard routing, Material-search alignment, opportunity CSV export hardening, atomic Won-to-Project handoff, atomic all-stage transitions, Project-detail Opportunity create/transition, atomic daily-task completion, atomic PPRF submission, and atomic site-inspection/RFI creation |
| Verified workflows | 0 | Strict live-data definition not yet met |
| Partial workflows | 13 | All implemented and locally tested with explicit live/browser/persistence evidence limits |
| Failed workflows | 0 | No known implementation failure after focused QA |
| Completed modules | 0 | NOT TESTED |
| Modules remaining | 13 user-facing modules | NOT TESTED |

## Authoritative role vocabulary

`owner`, `estimator`, `pm`, `admin`, `sales`, `commercial`, `design`,
`sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`, `viewer`.

Runtime identity comes from `public.users.role`. The shared application policy
is `packages/shared-types/src/authorization.ts`; Web route visibility now
preserves every persisted role except the explicit owner-as-super-admin
inheritance in `apps/web/src/lib/operations/nav-config.ts`.

## Completed local implementation slices

### Self-service password recovery and password change

Implemented locally and independently reviewed. The slice remains `PARTIAL`
because inbox delivery/recovery-link completion and one real persisted password
rotation could not be verified in the available browser environment.

Implemented behavior:

- sign-in links to an enumeration-safe Supabase password-recovery request;
- the callback uses an exact redirect allowlist and accepts update-password only
  for a recent provider recovery exchange;
- middleware requires a short-lived HttpOnly recovery marker bound to the
  verified user, session, token, and recovery timestamp;
- recovery and Settings/Profile changes validate 12 to 128 characters and
  update through the authenticated Supabase client;
- Settings/Profile reauthenticates the same account with the current password
  before updating and signs the local session out afterward;
- all routes include loading and error surfaces; all thirteen roles use the
  same own-account flow without role-specific denial;
- no password, access token, or service-role value is written to repository
  evidence or browser artifacts.

### Legacy project-chat data boundaries

Implemented on the stacked `agent-05/ai-chat-data-boundaries` branch and
independently reviewed. The slice remains `PARTIAL` because the AI provider was
deliberately disabled during browser verification; no data-bearing live model
response was requested.

Implemented behavior:

- strict bounded Zod validation runs before quota, database, audit, or provider
  work;
- project, BOM, invoice, and PO context uses the existing central policy for
  every one of the thirteen roles;
- denied-domain branches issue no query and cannot enter the system prompt;
- every query remains tenant/project scoped and context row/field counts are
  bounded;
- responses are private/no-store and internal failures remain generic;
- audit attempts contain actor/tenant/project/message-count/granted-domain
  metadata before provider work;
- viewer, finance, and commercial passed safe production-build browser/API
  checks with the provider disabled; the assistant UI advertises only generic
  project questions.

### Project-detail data boundaries

Implemented in stacked PR #17 and independently reviewed. The slice remains
`PARTIAL` because browser identities for `estimator` and `pm` are unavailable
and the database-backed budget write trigger could not run in the local QA
lane.

Implemented behavior:

- one typed projection derives project, BOM, PO, cost, billing, delivery,
  audit, and access visibility from the existing policy registries for all
  thirteen roles;
- overview cards, tabs, links, and queries omit denied domains independently;
- Cost, Budget, Billing, and Audit do not load or derive hidden BOM/PO values;
- BOM/Togal, Cost/Budget, Billing, Audit, and Access deep links call the
  not-found boundary before protected database reads;
- every allowed query remains tenant/project scoped and mutation capabilities
  are unchanged;
- budget saves now validate tenant/draft/BOM ownership, lock the draft, preserve
  stable line identity, fail closed on affected-row mismatches, and audit only
  after successful commit;
- all eleven supplied identities passed the 66-route browser matrix; the final
  denial UX rerun passed 32/32 without protected markers or console, page,
  request, or dashboard-render errors.

### Legacy route-policy alignment

Implemented and independently reviewed. The slice remains `PARTIAL` because
the affected `estimator` and `pm` browser identities are unavailable.

Implemented behavior:

- owner remains the sole inherited route identity and keeps full Admin access;
- estimator no longer sees or directly enters unsupported `/inventory/**` or
  `/admin/**` routes;
- evidenced estimator BOM, permit, RFQ, PO, and claim reads remain visible;
- PM is explicit and retains its existing operational route projection while
  its distinct audit/mobilization authority remains capability-gated;
- sidebar and nested direct-route checks share the same role table;
- dashboard, profile-menu, Cortex, asset-rollout, settings/profile, and
  unknown-path behavior are regression-covered and otherwise unchanged;
- all eleven supplied identities passed login, sidebar, reload/history,
  representative Admin/Inventory direct routes, and sign-out in the production
  build with no page error, HTTP error response, or protected UI leak.

### Fail-closed dashboard route registry

Implemented and independently reviewed. The slice remains `PARTIAL` until the
stacked branch reaches an authorized reviewed environment.

Implemented behavior:

- the dashboard layout authorizes only the 99 page templates that actually
  exist under its route group; filesystem, production-registry, and independent
  expected-policy keys must remain exactly equal;
- dynamic `[param]` segments match exactly one non-empty path segment, static
  templates win at the same depth, and registered ancestors never authorize an
  unknown descendant;
- every template has an explicit thirteen-role outcome derived from its page
  gate or established read projection, including narrower Admin, project,
  create, Inventory, and Punchlist pages;
- unknown and misspelled dashboard paths fail closed, while `/api/**`,
  `/portal/**`, and `/auth/**` remain outside this dashboard registry;
- hidden redirect and secondary routes stay out of the sidebar, and owner
  inheritance, estimator/PM distinctions, Assets rollout, and existing
  page-local tenant/entity checks remain unchanged;
- focused/downstream tests passed 63/63, the full Web/E2E type checks, source
  lint, 89/89-page production build, secret scan, and independent 99-template
  authorization review passed;
- Viewer, Commercial, Finance, and Sales passed an isolated production-build
  browser matrix: allowed pages rendered, registered forbidden pages redirected
  without protected UI, and unknown/misspelled descendants returned a 404
  without dashboard navigation or forms.

### Material search/destination alignment

Implemented and independently reviewed. The slice remains `PARTIAL` because
the configured browser tenant has an empty Material catalog and the unavailable
Estimator/PM identities prevent a complete live positive/negative matrix.

Implemented behavior:

- Material search now admits only owner, admin, and commercial—the roles that
  can open the fixed `/admin/material-items` result destination;
- estimator, PM, Service Delivery, and Procurement retain every non-Material
  legacy search alias but no longer query or receive Material results;
- the Web compatibility route skips `material_items` before query construction
  for denied roles, while Core removes `material` from their graph node-type
  scope before database retrieval;
- shared tests cover the exact thirteen-role Material policy; independent QA
  checked all 13 roles across all 18 search types (234 outcomes) with no
  remaining dead-end destination;
- the positive Web regression proves Commercial receives the existing route
  and verifies the compiled Material tenant predicate and bound tenant value;
- live Procurement and Service Delivery searches returned no Material result
  or dead-end link, while an allowed vendor result remained usable. Commercial
  could open Material Items, but the page reported zero records, so a live
  positive Material hit could not be produced without prohibited fixture data.

### Opportunity CSV export hardening

Implemented, independently reviewed, and verified in an isolated production
build. The slice remains `PARTIAL` until the stacked branch reaches an
authorized deployed environment.

Implemented behavior:

- a central `opportunity.export` capability matches the ten roles whose
  executive dashboard renders the export; Safety, CX, and Viewer receive 403
  before filter parsing or database work;
- strict Zod parsing rejects unknown/duplicate keys, impossible dates,
  undeclared stages, and reversed ranges; date-only inputs use inclusive-start
  and exclusive-next-day Asia/Manila boundaries;
- Account, Project, and User joins require both ID and tenant equality;
  canonical Account name takes precedence with a legacy Project-client
  fallback;
- the query is deterministically ordered and limited to 10,001 rows, allowing
  exactly 10,000 while returning an explicit error instead of truncating a
  larger export;
- user-controlled text cells neutralize spreadsheet-formula prefixes while
  negative numeric values remain numeric; every response is private/no-store,
  cookie-varying, and `nosniff`;
- shared and focused export tests passed 63/63, full type/lint/build and secret
  checks passed, and independent QA returned `GO` with no P1/P2 finding;
- Sales and Commercial each received a valid five-row CSV in the built app;
  Viewer and Safety saw no export control and direct requests returned hardened
  403 responses; five adversarial filter cases returned hardened 400 responses.

### Atomic Won-to-Project handoff

Implemented, corrected through three independent QA rounds, and verified in an
isolated production build. The slice remains `PARTIAL` because the configured
demo tenant has no safe Contract-stage opportunity for a positive browser
mutation and Estimator/PM browser identities are unavailable.

Implemented behavior:

- Won/Closed Won exits the Web action through the exact tenant rollout selector
  and Core stage-transition adapter before any local write; selector denial,
  Core error, unavailable adapter, or invalid success returns visibly with no
  local stage, audit, SLA, or legacy-conversion fallback;
- the Core transaction contains locked membership/opportunity validation,
  tenant-qualified Account validation, idempotency, KYC, stage/SLA/audit,
  Project/backlink, checklist/items, notifications, and request completion;
- PPRF opportunities require both approved tenant-scoped Finance tracks, while
  trackless legacy opportunities keep the Account-level KYC fallback;
- both Core mutation capabilities now grant exactly Owner/Admin/Sales at the
  central map, controller guard, and transaction service; the other ten roles
  are denied before persistent effects;
- linked Accounts must resolve by ID plus authenticated tenant before ledger,
  KYC, Project, or backlink work; a real PostgreSQL tenant-A opportunity with a
  tenant-B Account reference returned 409 and retained no handoff effect;
- deterministic command keys replay authorized retry/concurrency once, while
  current membership is rechecked and same keys remain tenant-isolated;
- `/pipeline/conversion` keeps all-role read access but renders the Actions
  column only for Owner/Admin/Sales; all other roles receive an accessible
  read-only notice with no stage controls;
- final QA passed 255/255 focused Web checks, 84/84 Core guard/service checks,
  32/32 shared authorization checks, both PostgreSQL integrations, full type,
  lint, builds, WO-13, gitleaks, and diff checks;
- all eleven supplied identities passed the final conversion/board visibility,
  data/link preservation, refresh/history, and sign-out browser matrix. Direct
  Core calls reached business validation for Owner/Admin/Sales and returned 403
  for every supplied denied role without data mutation.

### Atomic all-stage Pipeline transitions

Implemented, corrected through five independent QA rounds, and verified in a
production build with disposable local-Core browser probes. The slice remains
`PARTIAL` because no isolated database binding was available for a positive
persistence/rollback browser flow, no legacy `resubmission` fixture exists,
and Estimator/PM browser identities are unavailable.

Implemented behavior:

- all Won and non-Won stage commands leave the Web action through the exact
  tenant Core selector; the stage-first Web update, separate audit, swallowed
  SLA failure, and selected-Core fallback are removed;
- Core holds current membership and Opportunity locks, tenant-qualified linked
  Account/KYC validation, shared transition/Lost/regression rules, stage,
  semantic audit, SLA rollover, and idempotency completion in one transaction;
- missing Lost/Closed Lost reasons return `reason_required`; all 24 configured
  non-Won edges, exact 3-allow/10-deny policy, rollback boundaries, replay,
  key reuse, and serialized concurrency have focused coverage;
- both Pipeline callers classify every destination before a request. Lost and
  genuine regression use distinct accessible required-reason dialogs; blank,
  oversized, and duplicate pending submissions perform no action;
- returned and transport failures show accessible alerts, perform no optimistic
  stage move or refresh, and preserve retry. Stale alerts clear synchronously
  before `startTransition`, rather than being deferred with async work;
- the WO-11 gate structurally verifies authoritative Core KYC/transaction
  ownership and unconditional Web delegation/no fallback. A second AST gate
  protects actual component-to-classifier/dialog wiring and urgent clear order;
  both include in-memory mutation cases;
- final independent gates passed Core up to 128/128, Pipeline 70/70, focused
  Web/Core-client up to 230/230, shared 56/56, WO-11 5/5, full API 912 tests,
  TypeScript/lint/builds, 89/89 Web pages, gitleaks, and diff checks;
- all eleven supplied identities passed the browser role matrix. Disposable
  local-Core probes proved distinct pre-request reason UI, zero invalid calls,
  trimmed single submission, typed/transport failure, 32–34 ms retry-alert
  clearing, zero failure refresh, and one strictly shaped simulated-success
  refresh. No request reached hosted Core and demo counts stayed unchanged.

### Project-detail Opportunity create and stage transition

Implemented across PR #25, corrected through independent contract review, and
verified by focused tests and production builds. Independent browser QA began
from clean HEAD `b7a72d82bb317d22dddc380222e3ca0ff84d4943`. This tenth local workflow
remains `PARTIAL` under the strict browser/live/persistence definition: all
thirteen role rows lack authenticated browser evidence, and PostgreSQL
persistence was not run.

Implemented behavior:

- Project-detail creation and stage changes delegate only to Core through
  `POST /v1/crm/opportunities` and
  `POST /v1/crm/opportunities/[id]/stage-transition`; no local Opportunity
  writer, separate Web audit, SLA, conversion, or fallback remains on either
  mounted action path;
- Core rechecks current tenant membership and the exact role capability,
  validates the active Project and its Project-derived Account, applies the
  Account/KYC prerequisite, and commits Opportunity state, semantic audit,
  stage/SLA effects, and idempotency completion atomically as applicable;
- creation permits only `opportunity_creation`; TCV, signed GP, and weighted
  TCV use canonical decimal-centavo strings at API boundaries, with exact
  integer weighted math and explicit-offset Philippine closing dates;
- Owner, Admin, and Sales alone receive create/transition controls and pass the
  Web/Core capability boundary. The other ten roles retain readable Project
  Opportunity data with no mutation controls and are denied before effects;
- the fail-closed mounted contract inventories the two stage-transition
  actions and Project creation, follows supported local aliases/imports and
  re-exports, rejects local update/insert/audit/SLA/conversion fallbacks, and
  passed twice at 29/29 mutation-sensitive cases;
- shared create/transition tests passed 20/20, focused Project Web tests passed
  312/312, Core creation/stage tests passed 93/93, root typecheck/lint and both
  API/Web builds passed, and Web generated 89/89 pages;
- independent Chromium 147.0.7727.15 verified the accessible unauthenticated
  login on loopback Web `127.0.0.1:3317` with fake Core `127.0.0.1:3318`:
  1440×900 loaded in 1,586 ms and 390×844 in 1,321 ms, with zero
  console/page/request failures, zero non-GET calls, and zero fake-Core
  create/transition calls. Both loopback servers were stopped afterward.

Browser status is `BLOCKED` for every role because no secure reusable isolated
authenticated session was available and QA correctly refused the daily
browser. The eleven supplied roles therefore remain `PARTIAL`; Estimator and
PM remain `BLOCKED` because their identities are also missing. Live status is
`NOT RUN`. The protected PostgreSQL canary remains blocked because its database
binding and explicit opt-in are unavailable; no live persistence or hosted
mutation is claimed.

### Atomic daily-task completion

Implemented and independently contract-reviewed at source HEAD
`cab3af16cc8c6061024e4d34e5f08a7cfd1b6fb4`. This eleventh local workflow is
`PARTIAL` under the strict authenticated-browser/live/PostgreSQL definition.

Implemented behavior:

- all thirteen roles retain `/tasks` reads limited to the current tenant and
  authenticated assignee; Owner/Admin do not gain a tenant-wide read list;
- completion capability is exactly Owner, Admin, Service Delivery PM/PE, PM,
  and Safety. The latter three complete only their assigned task, Owner/Admin
  have a same-tenant command override, and the other eight roles receive no
  completion control and are denied before effects;
- the Web action accepts only strict normalized notes, sends one authenticated
  `POST /v1/daily-tasks/[id]/completion` request through the explicit tenant
  selector, validates the complete returned scope, logs redacted outcomes, and
  refreshes only after success. Selector absence or denial fails closed, and no
  local task writer, audit, SLA helper, or fallback remains;
- Core locks and rechecks current membership, tenant, role, assignee, and
  pending state, then atomically records exact completion metadata, closes all
  matching open legacy daily-task SLA rows, and appends one semantic audit;
- the required semantic audit also acts as the durable tenant/key-hash receipt,
  with advisory serialization and a normalized command hash. Raw keys and notes
  are excluded from that receipt; replay, conflict, rollback, and concurrent
  single-effect behavior are automated;
- toolbox meeting logs require meaningful trimmed notes, while authorized
  already-done tasks return the canonical persisted completion with no new
  effect and skipped tasks fail closed;
- the mounted source contract passed 22/22 including 19 hostile mutation
  groups; independent shared, Core, and Web suites passed 35/35, 33/33, and
  42/42 respectively—132/132 total—with root lint/typecheck and source diff
  checks passing. No introduced P0-P2 source defect was found.

Safe unauthenticated HTTP/SSR evidence used local Next.js 15.5.23 Web
`127.0.0.1:3317` and fake Core `127.0.0.1:3318`. The Web request normalized by
HTTP 307 to `http://localhost:3317/auth/login`, then returned 200; cold response
was 9.155 seconds and warm response 0.584 seconds. Fake Core observed zero
calls, no hosted write was attempted, and both local servers were stopped with
their ports free. This was not a real browser-render, console, interaction, or
accessibility assertion.

Browser result remains `BLOCKED` for all thirteen rows: only the engineer's
daily Opera session was exposed and correctly left untouched, isolated browser
providers were unavailable, and no secure reusable authenticated session was
available. The eleven supplied-role rows are therefore `PARTIAL`; Estimator and
PM are `BLOCKED` because their identities are additionally missing. Live result
is `NOT RUN`. The protected PostgreSQL canary remains 1/1 skipped because its
isolated binding and explicit opt-in are absent; no database was contacted.

### Atomic PPRF submission

Implemented and independently contract-reviewed at source HEAD `d4ec9791`.
This twelfth local workflow is `PARTIAL` under the strict authenticated-browser,
live, and real-PostgreSQL definition.

The `/crm/opportunities/new/pprf` intake route is exact Owner/Admin/Sales. The
existing `/crm/opportunities/[id]/proposal/pprf` detail remains readable for all
thirteen roles, with submit/resubmit controls projected only to those same
three and an accessible read-only prior-version state for the other ten. Both
actions enforce the central capability independently and call the atomic PPRF
service exactly once; the service rechecks current membership and tenant scope
and owns Account, Opportunity, PPRF version, dual KYC, semantic audit, SLA,
notification, and durable replay effects in one transaction.

Independent QA discovered a P1 after the first integration: the intake
action's exact field allowlist required `area_sqm`, while the mounted form
omitted that control, making every native intake fail before service entry.
Commit `421bfacf` closed the defect with an accessible optional positive-
integer Opportunity-area control kept distinct from required decimal PPRF
`floor_area_sqm`. Agent 12 then hardened the source verifier against missing,
unknown, duplicate, spread-hidden, swapped, and parser-divergent mounted
fields. Final evidence passed WO-11 59/59 twice, mounted PPRF 74/74, service
42/42, Web typecheck/lint, the 89-page Web build, diff checks, and gitleaks;
independent contract QA returned `GO` with the P1 closed.

Browser result is `BLOCKED` for all thirteen workflow rows because no secure
reusable isolated authenticated session was available. The eleven supplied
identities remain `PARTIAL`; Estimator and PM are `BLOCKED` because identities
are additionally missing. Live status is `NOT RUN`, and real PostgreSQL
rollback/concurrency/trigger execution remains blocked without an explicitly
isolated binding. Existing in-app recipient sets are preserved, while the
recipient-role taxonomy remains `NEEDS DECISION`. The bounded P2 historical
receipt-reader issue also remains: `.passthrough()` accepts unknown keys,
although current writes and returned known fields are bounded and privacy-
verified.

### Atomic site inspection and RFI creation

Implemented and independently contract-reviewed at source HEAD `4c3ccafd`.
This thirteenth local workflow is `PARTIAL` under the strict authenticated-
browser, offline-storage, live, and real-PostgreSQL definition.

The `/crm/opportunities/[id]/proposal/inspection` route remains a tenant-scoped
inspection/RFI history surface for all thirteen roles. Owner, Admin, and
Commercial alone receive both mutation forms; the other ten receive accessible
read-only history without controls. Both Web actions enforce central
`site_inspection.submit` independently and call the atomic service exactly
once. The service owns inspection, safe photo links, mandatory semantic audit/
receipt, Design-handoff SLA, and durable Design notifications in one
transaction, or RFI plus its mandatory audit/receipt in one transaction. Stable
full-key replay, conflict, and concurrency checks remain tenant scoped.

Independent QA closed the two original P1s: inspection could formerly return
failure after partial durable success, while RFI could formerly persist without
its audit and lacked durable idempotency. Three later P2 discoveries are also
closed: the obsolete literal verifier was replaced by AST/mutation proof;
replay now compares the original recipient digest/count with correlated
persisted notifications instead of mutable current Design membership; and the
notification adapter preserves nullable-row cardinality so null or invalid
recipients fail closed before uniqueness/count/hash validation. Final evidence
passed WO-12 77/77 twice—four authoritative/benign positives and 73 hostile
mutations—and 146/146 focused service/mounted tests. Web and root typechecks,
Web lint, the 89-page production build, diff checks, and gitleaks also passed.
No P0-P2 remains in the verified source contract.

Browser/IndexedDB/Storage evidence is `BLOCKED` for all thirteen roles because
no safe reusable isolated authenticated session or storage lane was available;
Estimator and PM are additionally identity-blocked. Hosted/live and real
PostgreSQL execution are `NOT RUN`. HTML report archival intentionally remains
best-effort after committed success with an honest repair warning; selecting a
durable automated or manual repair path remains a bounded follow-up decision.

Acceptance criteria and ordered agent handoffs are recorded in
`docs/handoffs/2026-09-02-functional-completeness.md`,
`docs/handoffs/2026-09-02-ai-chat-data-boundaries.md`,
`docs/handoffs/2026-09-02-project-detail-authorization.md`,
`docs/handoffs/2026-09-03-legacy-route-policy-alignment.md`,
`docs/handoffs/2026-09-03-unknown-dashboard-route-denial.md`,
`docs/handoffs/2026-09-03-material-search-route-alignment.md`,
`docs/handoffs/2026-09-03-opportunity-export-hardening.md`,
`docs/handoffs/2026-09-03-won-project-atomic-handoff.md`,
`docs/handoffs/2026-09-03-atomic-opportunity-stage-transitions.md`,
`docs/handoffs/2026-09-03-project-opportunity-core-cutover.md`,
`docs/handoffs/2026-09-03-atomic-daily-task-completion.md`,
`docs/handoffs/2026-09-03-atomic-pprf-submission.md`, and
`docs/handoffs/2026-09-03-atomic-site-inspection.md`.

## Agent state

- Principal Agent 1: route/RBAC cartography complete; the workflow-13
  functional ledger and final evidence boundary are synchronized.
- Principal Agent 2: continuous read-only workflow audit complete; latest
  P1 findings—the non-transactional Won-to-Project handoff and non-Won stage
  writer, the Project-detail Opportunity writer, and the non-atomic daily-task
  completion path, post-commit PPRF failure boundary, post-commit inspection
  failure boundary, and unaudited/non-idempotent RFI writer—are repaired. The
  independently discovered mounted PPRF field-inventory P1 and inspection
  verifier/roster/null-row P2s are also closed.
- Principal Agent 3: sole application-source editor; auth, AI chat, project
  detail, legacy route-policy, and fail-closed route-registry implementations
  complete; Material-search Web/Core alignment and opportunity-export
  hardening complete; atomic Core/Web handoff and conversion visibility fixes
  complete; all-stage Web/Core cutover and retry-alert UX complete;
  Project-detail Opportunity create/transition and daily-task completion Core
  cutovers complete; atomic PPRF integration and mounted field repair complete;
  atomic inspection/RFI integration and honest archival boundary complete.
- Principal Agent 4: independent code/test/security review complete; `GO` for
  all thirteen implemented source slices. Three atomic-handoff rounds, five
  all-stage transition rounds, and the Project-detail Opportunity contract
  remediation plus daily-task, PPRF, and inspection/RFI mutation contract
  reviews are complete. Authenticated browser acceptance for the thirteenth
  workflow remains blocked.
- Principal Agent 5: auth verification complete for all eleven supplied
  identities; AI chat safe browser/API smoke complete for viewer, finance, and
  commercial; project-detail browser matrix complete for all eleven supplied
  identities; legacy Admin/Inventory route matrix complete for all eleven
  supplied identities with no mutation or provider call; fail-closed route
  checks passed for Viewer, Commercial, Finance, and Sales in an isolated
  production build; Material-search negative live checks passed for Procurement
  and Service Delivery, while the Commercial positive hit is fixture-blocked.
  Opportunity-export browser/API checks passed for Sales, Commercial, Viewer,
  and Safety without persisting CSV data. Atomic-handoff Core/API checks and
  final conversion/board UI checks passed for all eleven supplied identities;
  a real positive Won mutation is fixture-blocked. All-stage transition role
  and dialog/error/retry checks passed for all supplied identities plus safe
  local-Core probes; positive persistence remains isolated-fixture blocked.
  Project-detail Opportunity anonymous desktop/narrow smoke passed with no
  request or console failure, but the authenticated eleven-identity panel and
  mutation matrix did not run because no isolated session was available.
  Daily-task completion independent source QA passed 132/132 checks; its safe
  HTTP/SSR login probe issued zero fake-Core calls, while real-browser role and
  mutation coverage did not run because only the daily Opera session was
  exposed and no isolated authenticated provider/session was available. PPRF
  independent contract QA closed the mounted `area_sqm` P1 and passed WO-11
  59/59 twice, mounted PPRF 74/74, and service 42/42; its authenticated browser
  and real-PostgreSQL lanes remain blocked. Inspection/RFI independent source
  QA closed the two original P1s and the verifier/roster/null-row P2 sequence;
  WO-12 passed 77/77 twice and focused service/mounted tests passed 146/146.
  Its authenticated browser, IndexedDB/Storage, and real-PostgreSQL lanes remain
  blocked or not run.

## Git state

- Primary repository: `D:/thirdcode/ERP`; current stacked worktree:
  `D:/thirdcode/ERP-inspection-20260903`.
- Current stacked branch: `agent-05/atomic-site-inspection`, based on the PPRF
  stack. Final inspection/RFI source/contract review HEAD was
  `4c3ccafd889f4f3a2352f3b7a1a706931c292c93` before this ledger closeout.
- Finance/security release-gate branch: PR #18 at commit `4369a01a`; all
  protected checks pass.
- Auth PR branch: `agent-03/auth-password-workflows-20260902`; PR #15 at
  commit `dfa190ba`.
- The worktree was clean at the final source/contract HEAD before this docs-only
  ledger closeout; no user-owned changes were overwritten.
- Current work-order file:
  `docs/handoffs/2026-09-03-atomic-site-inspection.md`.

## Checks executed

| Check | Result | Evidence |
| --- | --- | --- |
| Focused auth/middleware baseline under Node 22.23.2 | PASSED | 4 files, 10 tests |
| Final focused auth/middleware tests under Node 22.23.2 | PASSED | 6 files, 55 tests |
| Web TypeScript | PASSED | `pnpm --dir apps/web exec tsc --noEmit` |
| E2E TypeScript | PASSED | `pnpm --dir apps/web exec tsc --noEmit -p e2e/tsconfig.json` |
| Web source lint | PASSED | `pnpm --dir apps/web lint` |
| E2E ESLint | NOT RUN | Flat ESLint config has no matching E2E configuration; TypeScript gate passed |
| Production build | PASSED | Next.js 15.5.23; 89/89 static pages generated |
| Built-app auth browser suite | PASSED | Chromium; 6/6 tests |
| Git diff whitespace check | PASSED | `git diff --check`; line-ending warnings only |
| Browser account matrix | PASSED | 11/11 supplied identities logged in and rendered `/dashboard` plus `/settings/profile`; ordinary `/auth/update-password` access was denied safely |
| Live reset request | PASSED | One real Supabase SDK recovery request returned the enumeration-safe success state |
| Hosted reset email delivery and recovery link | BLOCKED | No mailbox access was supplied |
| Live persisted password rotation | BLOCKED | Guarded Linux Chromium lane could not complete its initial login; external parent verified the original credential after every attempt and no account remained changed |
| AI chat focused route tests | PASSED | 21/21 tests including all 13 roles and domain policies |
| AI chat independent type/lint/secret scan | PASSED | Web TypeScript; source lint; gitleaks 8.30.1 |
| AI chat production build | PASSED | Next.js 15.5.23; 85/85 static pages |
| AI chat safe browser/API smoke | PASSED | Viewer/Finance/Commercial project UI; private 401/400/503; no external provider request |
| AI chat live provider response | NOT RUN | Provider deliberately disabled to avoid sending data/cost before release |
| Project-detail focused tests | PASSED | 16 files, 108 tests; all 13 role-policy cases |
| Project-detail direct-route denial | PASSED | 6/6 automated cases; denial before DB access |
| Project-detail independent QA | PASSED | `GO`; no in-scope P1/P2 confidentiality or integrity finding |
| Project-detail browser matrix | PASSED | 11/11 supplied identities; 66/66 direct-route assertions |
| Project-detail denial UX rerun | PASSED | 32/32 denied routes; not-found boundary and zero console/page/request errors |
| Project-budget database trigger execution | BLOCKED | Database integration binding unavailable in local QA; compiled ordering and failure-path tests pass |
| Finance/security release-gate PR | PASSED | PR #18 final run 33660836777: Actionlint, type, lint, Security Scan, BUILD OPS, unit, PostgreSQL 17 reproducibility, build, and trusted E2E |
| Legacy route-policy focused tests | PASSED | 6 files, 90 tests across all roles and downstream consumers |
| Legacy route-policy independent QA | PASSED | `GO`; no P1/P2 least-privilege or parity finding |
| Legacy route-policy browser matrix | PASSED | 11/11 supplied identities; login, sidebar, direct Admin/Inventory policy, reload/history, and sign-out |
| Legacy route-policy affected identities | BLOCKED | No `estimator` or `pm` account supplied or seeded |
| Fail-closed route-registry focused tests | PASSED | 4 files, 63 tests; exact 99-template registry and 13-role policy oracle |
| Fail-closed route-registry independent QA | PASSED | `GO`; all 99 role sets match an independently derived page-gate matrix, with adversarial unknown/over-grant probes denied |
| Fail-closed route-registry type/lint/build/security | PASSED | Complete Web/E2E TypeScript, Web source ESLint, 89/89-page production build, gitleaks over 1,747 commits, and whitespace checks |
| Fail-closed route-registry browser lane | PASSED | Viewer, Commercial, Finance, and Sales: allowed pages rendered; registered denials redirected without protected UI; three unknown descendants returned expected 404 states without dashboard chrome or forms |
| Material-search focused tests | PASSED | Shared 17/17, Web route 19/19, Core service 8/8; independent downstream totals Web 73/73 and Core 12/12 |
| Material-search independent QA | PASSED | `GO`; 234/234 role/type outcomes match and no universal-search dead-end destination remains |
| Material-search type/lint/build/security | PASSED | Shared/API/Web/E2E TypeScript, affected source ESLint, API build, Web 89/89-page build, gitleaks over 1,750 commits, and whitespace checks |
| Material-search live negative matrix | PASSED | Procurement and Service Delivery: no Material API/palette result or Admin dead-end; allowed vendor result remained usable; no unexpected browser/API error |
| Material-search live Commercial positive hit | BLOCKED | Commercial can open `/admin/material-items`, but the configured tenant contains zero Material records; no fixture mutation was permitted |
| Opportunity-export focused tests | PASSED | Shared authorization 19/19; route/query/CSV 44/44; independent focused rerun 61/61 |
| Opportunity-export independent QA | PASSED | `GO`; exact 10-role policy, compiled tenant joins, Manila bounds, 10,001-row sentinel, formula protection, headers, and generic errors verified |
| Opportunity-export type/lint/build/security | PASSED | Shared/Web/E2E TypeScript, affected source ESLint, 89/89-page Web build, gitleaks over 1,753 commits, and diff checks |
| Opportunity-export built-app matrix | PASSED | Sales/Commercial 200 CSV with five data rows; Viewer/Safety hidden control + 403; five invalid filter cases 400; same-day filter 200; no export request/server errors |
| Atomic-handoff shared/Core tests | PASSED | Shared authorization 32/32; focused Core up to 87/87; neighboring CRM 68/68; all-role controller/service and retry/rollback coverage |
| Atomic-handoff PostgreSQL 17 integrations | PASSED | Stage/conversion 2/2 with outer rollback; dual-track success/failure, conversion rollback, tenant-A tracks plus tenant-B Account rejection, replay authorization/isolation, and zero retained effects |
| Atomic-handoff Web tests | PASSED | Pipeline action 14/14; final page/route/nav/inventory/action/Core-client 255/255; exact all-role control visibility and no local Won fallback |
| Atomic-handoff independent QA | PASSED | Round 1 found role and Account-tenant blockers; remediation passed rounds 2 and 3 with no remaining in-scope P1/P2 |
| Atomic-handoff type/lint/build/security | PASSED | Shared/API/Web/E2E TypeScript, direct full source ESLint, API build, Web 89/89 pages, WO-13 contract, gitleaks over 1,767 commits, and diff checks |
| Atomic-handoff direct Core account matrix | PASSED | Owner/Admin/Sales reached non-mutating 409 business validation; eight supplied denied roles received 403 on both endpoints; database counts unchanged |
| Atomic-handoff final built-browser UI matrix | PASSED | 11/11 supplied identities; Owner/Admin/Sales controls present; eight denied roles preserve three rows/links with read-only status and zero controls; board parity and navigation pass |
| Atomic-handoff positive Won browser mutation | BLOCKED | No Contract-stage demo opportunity; the Negotiation fixture has an existing Project but no Account/KYC or signed/legacy contract and was left unchanged |
| All-stage Core tests | PASSED | Stage service 63/63; focused Core/auth up to 128/128; full API 187 files/912 tests; all 24 non-Won edges, exact roles, tenant/KYC/reason, rollback, replay, key reuse, and concurrency |
| All-stage Web and Pipeline tests | PASSED | Web action 27/27; Pipeline up to 70/70; focused Web/Core-client up to 230/230; no local stage/audit/SLA writer or fallback |
| All-stage mutation contracts | PASSED | WO-11 5/5 plus actual-TSX caller/order AST validator; removals, severed dialog/router wiring, and reordered urgent clears fail in memory |
| All-stage independent QA | PASSED | Five rounds closed Lost UX, stale WO-11 oracle, conversion regression wiring/evidence, and retry alert timing; final round returned GO |
| All-stage type/lint/build/security | PASSED | API/Web/E2E/shared TypeScript as applicable, full source lint, API build, Web 89/89 pages, gitleaks through 1,791 commits, and diff checks |
| All-stage supplied-account browser matrix | PASSED | 11/11 identities; exact Owner/Admin/Sales controls and eight supplied denied-role read-only projections; login/identity/navigation/refresh/history/sign-out |
| All-stage safe local-Core browser probes | PASSED | Distinct reason dialogs, invalid zero-call, trimmed single-submit, typed/transport failure, 32–34 ms retry clears, zero failure refresh, one simulated-success refresh; hosted counts unchanged |
| All-stage PostgreSQL persistence browser proof | BLOCKED | No explicitly isolated database binding or disposable legacy resubmission fixture; no hosted mutation attempted |
| Project-detail Opportunity contract | PASSED | WO-11 baseline and mutations 29/29 twice; exact three Core authorities, 3-allow/10-deny policy, create stage/money/panel wiring, and local writer/fallback challenges |
| Project-detail Opportunity focused tests | PASSED | Shared 20/20; Project Web/action/panel/Core-client 312/312; Core creation/controller/stage 93/93 |
| Project-detail Opportunity type/lint/build | PASSED | Root typecheck 5/5 tasks; configured source ESLint; API/Web builds 2/2; Web 89/89 pages; Gitleaks and diff checks |
| Project-detail Opportunity anonymous browser smoke | PASSED | Chromium 147.0.7727.15; accessible login at 1440×900 and 390×844; zero console warnings/errors, page errors, failed requests, non-GET calls, or fake-Core mutations; loopback servers stopped |
| Project-detail Opportunity authenticated role/mutation browser matrix | BLOCKED | No secure reusable isolated authenticated session; daily browser correctly refused; Estimator/PM identities additionally unavailable |
| Project-detail Opportunity PostgreSQL canary | BLOCKED | `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` unavailable; live result NOT RUN |
| Daily-task independent source QA | PASSED | Clean `cab3af16`; no introduced P0-P2; contract 22/22 in 24.889 s, shared 35/35 in 2.962 s, Core 33/33 in 10.402 s, Web 42/42 in 6.219 s (132/132 total) |
| Daily-task static gates | PASSED | Root lint 19.000 s; root typecheck 5/5 cached in 1.563 s; diff check 82 ms; source build evidence retained from Agent 03/12 |
| Daily-task unauthenticated HTTP/SSR smoke | PASSED | Next.js 15.5.23 on `127.0.0.1:3317`; 307 normalized to `http://localhost:3317/auth/login`, then 200; cold 9.155 s, warm 0.584 s; fake Core `127.0.0.1:3318` received 0 calls; servers stopped and ports free |
| Daily-task authenticated browser/interaction/accessibility matrix | BLOCKED | HTTP/SSR was not a real browser/console/a11y assertion; only daily Opera was exposed and untouched; isolated providers and reusable authenticated session unavailable; Estimator/PM identities additionally missing |
| Daily-task PostgreSQL canary | BLOCKED | Protected HTTP integration 1/1 skipped in 7.766 s; isolated database binding and explicit opt-in unavailable; no database contacted and live result NOT RUN |
| PPRF independent contract QA | PASSED | WO-11 59/59 twice after P1 closure; exact mounted twenty-field inventory; 49 PPRF-specific and 72 total hostile mutations |
| PPRF focused source tests | PASSED | Mounted action/form/page 74/74; atomic service 42/42; all thirteen roles and exact three-role mutation projection |
| PPRF type/lint/build/security | PASSED | Web typecheck; zero-warning lint; 89-page production build; diff checks; gitleaks over 1,831 commits |
| PPRF authenticated browser matrix | BLOCKED | No secure reusable isolated authenticated session; all thirteen rows blocked and Estimator/PM identities additionally unavailable |
| PPRF live/PostgreSQL proof | NOT RUN | No hosted/demo mutation or explicitly isolated PostgreSQL binding; rollback/concurrency/trigger behavior remains unexecuted against real PostgreSQL |
| Site-inspection/RFI independent contract QA | PASSED | WO-12 77/77 twice: four authoritative/benign positives and 73 hostile mutations covering the mounted and atomic source contract |
| Site-inspection/RFI focused source tests | PASSED | Service/actions/forms/page 146/146; exact three-role mutation projection and ten-role read-only history |
| Site-inspection/RFI type/lint/build/security | PASSED | Web and root typechecks; Web lint; 89-page production build; diff checks; gitleaks |
| Site-inspection/RFI authenticated browser/offline/Storage matrix | BLOCKED | No safe reusable isolated authenticated session or storage lane; all thirteen rows blocked and Estimator/PM identities additionally unavailable |
| Site-inspection/RFI live/PostgreSQL proof | NOT RUN | No hosted mutation or explicitly isolated PostgreSQL binding; rollback/concurrency and durable Storage archival remain unexecuted live |
| Deployment/live smoke | NOT RUN | ADR-020 requires the reviewed stack on `main` and green checks on that exact SHA |

## Confirmed high-priority RBAC findings outside the completed slices

1. Viewer read breadth still conflicts with the narrower checked-in policy and
   requires a product decision for sensitive modules.

These are queued sequentially after the completed local slices and must be
reproduced before repair.

## Pre-existing non-blocking integrity queue

- The generic database audit trigger can include `completion_notes` in its
  generic row diff in addition to the deliberately redacted semantic completion
  receipt. This is a pre-existing audit-minimization concern, not an introduced
  daily-task regression; review it with the schema/audit owners before changing
  trigger behavior.
- Existing `daily_tasks.project_id` and `daily_tasks.assignee_id` foreign keys
  are not tenant-composite. The Core command still validates tenant/current
  membership and scopes the locked task, but schema-level cross-tenant integrity
  hardening remains a separate Agent 04 decision.
- Real PostgreSQL rollback, receipt replay, and concurrent single-effect proof
  remains unavailable until an explicitly isolated database lane is supplied.
  The opt-in canary stayed skipped and unit/AST evidence is not relabeled as
  persistence proof.
- PPRF notification recipient-role taxonomy remains `NEEDS DECISION`; this
  slice preserves the existing intake and resubmission recipient sets exactly.
- PPRF historical receipt parsing remains a bounded P2 because
  `receiptSchema.passthrough()` accepts unknown keys. Current receipt writes and
  returned known fields remain bounded and privacy-verified.
- Inspection HTML report archival intentionally remains best-effort after the
  atomic commit. The UI exposes an archive warning rather than false submission
  failure, but a durable background or manual repair path remains a bounded
  product/operations decision. Browser IndexedDB and Storage proof is blocked.

These findings pre-date or sit outside the bounded implementation and do not
change the independent conclusion that the slice introduced no P0-P2 source
defect.

## Exact next action

Run site-inspection/RFI authenticated browser role, retry, offline-draft, and
archive-warning coverage only in a safe reusable isolated session with a
disposable Storage lane, and run rollback/concurrency proof only against an
explicitly isolated PostgreSQL binding. Keep inspection report-repair policy,
PPRF recipient taxonomy, and Viewer-sensitive permissions as `NEEDS DECISION`;
keep the PPRF historical receipt-reader strictness as its bounded P2 follow-up.
Production deployment remains blocked by ADR-020 until the reviewed stack
reaches `main` and every required release check is green on that exact SHA.
