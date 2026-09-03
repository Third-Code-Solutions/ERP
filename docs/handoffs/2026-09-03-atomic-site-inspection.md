# Atomic site inspection and RFI creation

## Delivery contract

Goal: close two WO-12 P1 integrity failures without changing product policy.
Site-inspection submission must commit its required database effects together,
and same-screen RFI creation must commit the RFI and its mandatory semantic
audit together. Both commands must be tenant-safe, retry-safe, observable, and
recoverable from mounted UI failures.

This is a bounded transaction, authorization, idempotency, and UI-integration
repair. It is not a redesign of the mobile inspection, a notification-recipient
taxonomy change, a new report-delivery system, or a Core/API migration.

## Authority and source-backed defects

`docs/PRD.md` WO-12 requires a PPRF-prefilled mobile Site Inspection Report,
photo capture, and an RFI raised from the same screen. Automation A-44 requires
an immutable audit event for every state change. The requested repair is
consistent with both requirements, so the PRD is unchanged.

Current mounted behavior is in:

- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts`;
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx`;
- `apps/web/src/components/proposal/inspection-form.tsx`; and
- `apps/web/src/components/proposal/rfi-form.tsx`.

### P1 A — inspection submission can report failure after commit

`submitInspection` currently commits the inspection, allowed photo links, and
one semantic audit in a transaction. It then archives the report on a best-
effort path before separately opening `inspection.design_handoff` and calling
`notifyRoles(['design'])`. An SLA or notification failure therefore rejects
after the inspection is already durable. A retry replays only by tenant and
client UUID and compares only Opportunity identity; changed payload or photo
inputs can receive a false successful replay. The action also revalidates after
commit without classifying refresh failure as committed success.

The inspection form already keeps a stable UUID in its offline draft, but its
transition state is not a synchronous single-flight lock. The success copy
always claims Design notification and gives no honest warning when best-effort
report archival fails.

### P1 B — RFI can exist without its mandatory audit

`addInspectionRfi` verifies the tenant/Opportunity/inspection relationship,
inserts the RFI, and only afterward calls a separate audit transaction. Audit
failure leaves an unaudited RFI. The command has no idempotency key, so network
retries and double clicks can create duplicate RFIs. The page mounts the RFI
and inspection forms for every reader even though the central capability later
denies ten roles, and the RFI client does not catch a rejected action promise,
retain a stable retry key, synchronously block duplicate submission, or expose
its error as an accessible alert.

## Frozen product and authorization policy

The authoritative role vocabulary is:

`owner`, `estimator`, `pm`, `admin`, `sales`, `commercial`, `design`,
`sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`, `viewer`.

- `site_inspection.submit` remains exactly Owner, Admin, and Commercial.
- Those three roles may submit an inspection and create an RFI for a valid
  same-tenant Opportunity/inspection.
- The other ten roles retain the existing tenant-scoped inspection page read,
  inspection history, photos, and RFI list, but receive an accessible read-only
  state and no inspection or RFI mutation control.
- Every action independently calls `can(role, 'site_inspection.submit')` before
  the service. The service re-resolves and locks current membership and applies
  the same capability; neither UI visibility nor a stale profile is authority.
- Inspection submission still requires an existing same-tenant PPRF.
- The service verifies the Opportunity belongs to the authenticated tenant.
  RFI creation additionally verifies that the locked inspection belongs to
  that exact tenant and Opportunity.
- Missing and cross-tenant targets fail closed with the same not-found result;
  they must not disclose whether a foreign record exists.
- The notification recipient remains the existing `design` role only. Resolve
  all current tenant members with that exact role and create durable in-app
  rows. Do not add Owner, Admin, Commercial, email, SMS, or provider work.
  Recipient-taxonomy redesign is out of scope. A tenant with no Design member
  preserves the current valid zero-recipient behavior; recipient lookup failure
  is not absence and rolls back the command.

## Agent 05 — atomic service boundary

### Ownership

Agent 05 owns, and edits first:

- `apps/web/src/server/crm/site-inspection-workflow-service.ts`;
- `apps/web/src/server/crm/site-inspection-workflow-service.test.ts`.

Consume the existing transaction-aware audit contract and current SLA/
notification schema, but do not edit their helpers in this Agent 05 slice.

Do not edit pages, actions, forms, shared UI, schema, migrations, scripts,
dependencies, environment, data, provider configuration, or deployment. If
the existing inspection UUID/index plus append-only audit receipt cannot prove
strict replay, stop with evidence and hand off to Agent 04/01; do not silently
add schema.

### Strict commands

Export strict Zod command, result, and receipt schemas from the service. The
authenticated principal is a separate server argument and is never accepted
inside either command.

The inspection command contains only:

- `kind: 'inspection_submission'`;
- the complete client-stable UUID as `submissionId`;
- `opportunityId`;
- the existing bounded inspection payload fields; and
- a unique array of at most ten photo document UUIDs, matching the mounted
  form's existing `MAX_PHOTOS` boundary.

The RFI command contains only:

- `kind: 'rfi_creation'`;
- a stable per-mounted-form UUID as `submissionId`;
- server-bound `opportunityId` and `inspectionId`;
- a trimmed meaningful description of 2–2,000 characters; and
- priority exactly `minor` or `major`.

Unknown keys fail. Normalize optional text consistently before hashing. The
inspection photo IDs are a set: reject duplicates, sort the canonical list for
hashing, and never silently discard an invalid or unauthorized requested ID.
Dates and scalar payload fields retain their current persisted semantics; this
slice does not invent new inspection fields.

The canonical SHA-256 command hash covers the complete normalized command,
including kind, full submission UUID, Opportunity/inspection identity, every
payload field, priority, and the complete canonical photo-ID list. Never hash a
truncated projection. Bind authenticated tenant and actor identity into the
canonical hash envelope so another actor cannot recover a prior actor's result.
Derive a separate SHA-256 submission-key hash scoped by tenant. Raw submission
UUIDs, form bodies, inspection free text, RFI
descriptions, contact data, and photo IDs must not appear in receipts or logs.

### Transaction and replay

Both commands use one database transaction and a stable lock order:

1. parse the strict command and principal;
2. resolve and lock current tenant membership, then enforce the exact
   capability;
3. derive the full key and command hashes;
4. take a transaction advisory lock for tenant plus the full key hash;
5. lock and validate the same-tenant Opportunity and, for RFI, the exact
   inspection; and
6. strictly parse any existing receipt before effects.

Inspection replay may use the existing tenant/client-submission unique row to
locate the inspection, but success requires a matching strict semantic receipt.
The old Opportunity-only comparison is forbidden. A missing, malformed, or
scope-mismatched receipt for an existing token is an integrity error, never a
synthetic replay.

RFI replay is schema-free: the append-only semantic audit is its durable
tenant/key-hash receipt. The transaction advisory lock serializes same-key
calls; exact replay returns the recorded RFI result, while a matching key hash
with a different command hash returns a typed conflict. The same UUID in
another tenant is independent. Concurrent same-key calls produce one set of
effects and one replay.

Receipt schemas are versioned, strict, and bounded. Each receipt contains only
kind, schema version, key hash, command hash, tenant/actor/Opportunity/
inspection/result IDs, persisted status or priority, canonical timestamp, and
linked-photo count where applicable. It contains no raw key, description,
payload, contact value, note, document ID, credential, header, or request body.

### Inspection atomic effects

After authorization and replay checks, one inspection transaction must:

1. verify a same-tenant PPRF exists for the Opportunity;
2. insert one submitted inspection using the existing client submission UUID;
3. validate every requested photo document under the tenant and the current
   existing rule—linked to the Opportunity or its same-tenant Project—and
   insert exactly those links; any missing/foreign/duplicate input rejects the
   whole command;
4. append one mandatory semantic `site_inspection` create audit carrying the
   redacted receipt metadata;
5. preserve the current no-duplicate-open-clock behavior and ensure one open
   legacy `inspection.design_handoff` SLA row for the Opportunity using the
   existing one-business-day configuration; and
6. resolve tenant Design recipients and insert their existing in-app
   notification rows with the current subject, body, and inspection link.

The semantic receipt is part of the one required inspection audit, not an
extra business event. Inspection insert, photo links, audit/receipt, SLA, and
all resolved in-app notifications commit or roll back together. Query failure,
insert failure, missing returned identity, or malformed result is fatal.

Photo byte upload and its existing document-metadata command remain a prior,
separate operation. Inspection failure leaves those authorized Opportunity
documents available for the offline draft to retry; it must not delete or
re-upload them while attempting the atomic link command.

The stable inspection result is a strict discriminated union. Success includes
`kind`, tenant ID, actor ID, Opportunity ID, inspection ID, persisted
`submitted` status, canonical `submittedAt`, linked-photo count, and `replayed`.
It never includes the submitted payload or raw key.

### RFI atomic effects

After authorization and replay checks, one RFI transaction inserts exactly one
RFI under the locked inspection and appends exactly one mandatory semantic
`site_inspection_rfi` create audit carrying the redacted receipt. Both commit
or both roll back. No SLA or notification is added because current product
behavior defines neither for RFI creation.

The stable RFI result includes `kind`, tenant ID, actor ID, Opportunity ID,
inspection ID, RFI ID, persisted priority, canonical `createdAt`, and
`replayed`. It excludes description and the raw key.

### Agent 05 tests and failure injection

Write the service tests first and prove RED against the current split writers.
The final focused suite must cover:

- all thirteen roles for both commands: exact three allow and ten deny;
- missing/revoked/wrong-tenant membership and stale-role input;
- missing/foreign Opportunity, missing PPRF, and mismatched/foreign inspection;
- strict unknown fields, malformed UUIDs, trimmed/bounded text, priority, and
  unique max-ten photo lists;
- every requested photo accepted exactly once, plus invalid, duplicate,
  missing, foreign-tenant, foreign-Opportunity, and foreign-Project photo IDs;
- inspection rollback injected at inspection insert, photo-link insert,
  semantic audit/receipt, SLA read/insert, Design-recipient query, each
  notification insert, and result construction;
- RFI rollback injected at RFI insert and semantic audit/receipt;
- same-key exact replay, changed payload/description/priority/photo set/
  Opportunity/inspection conflict, same key across tenants, malformed receipt,
  full-hash sensitivity, and concurrent single-effect behavior;
- an existing open design-handoff SLA remains the valid single clock;
- zero Design recipients is valid, while lookup/insert failure rolls back;
- stable strict results and receipts reject missing, extra, or mismatched
  tenant/actor/entity/timestamp/status fields; and
- receipts and structured logs contain none of the prohibited sensitive data.

Use transaction doubles for deterministic failure injection. If an explicitly
isolated PostgreSQL binding already exists, add rollback/advisory-lock/
concurrency coverage there; otherwise mark it `BLOCKED` rather than treating
doubles as live persistence proof.

### Agent 05 acceptance

- Both services are the only durable authority for their required effects.
- No required effect occurs before or after the service transaction.
- Exact replay is honest; changed-command key reuse conflicts.
- Current Design-only in-app notification behavior is preserved.
- No schema, dependency, provider, environment, or deployment change is made.
- Focused tests, neighboring proposal/WO-12 tests, Web and root typecheck/lint,
  and source diff checks pass, with every unavailable gate reported exactly.

→ Handoff to Agent 03. Inputs: exported strict service schemas and tested
service methods. Expected output: replace the two mounted writers, project the
exact role policy, and implement recoverable accessible UI without creating a
second mutation authority.

## Agent 03 — mounted actions and read-only UI

### Ownership

Agent 03 runs only after Agent 05 commits and owns:

- the `submitInspection` and `addInspectionRfi` slices in
  `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts`;
- their direct tests in the same directory;
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx`
  and a direct page test;
- `apps/web/src/components/proposal/inspection-form.tsx` and direct tests; and
- `apps/web/src/components/proposal/rfi-form.tsx` and direct tests.

Do not edit the service, Core/API, shared policy, schema, migrations, scripts,
dependencies, data, environment, providers, or deployment.

### Action integration

- Authenticate and independently enforce `site_inspection.submit` in each
  action. Missing auth and denial return typed recoverable errors and never
  reach the service.
- Bind Opportunity identity from the mounted route/action closure. Bind RFI
  inspection identity from trusted server-rendered context. Do not accept
  tenant, actor, role, Opportunity, inspection, status, audit, SLA,
  notification, or result identity from arbitrary FormData.
- Accept the existing inspection retry UUID and the new RFI retry UUID only as
  idempotency material. Use exact allowlists; reject unknown and duplicate
  FormData fields instead of selecting an arbitrary value.
- Parse once through the exported service schema and call the relevant service
  exactly once. There is no local/fallback inspection, photo-link, RFI, audit,
  SLA, notification, or receipt writer.
- Strictly cross-check the returned kind, tenant, actor, Opportunity,
  inspection, status/priority, timestamp, linked-photo count, and replay flag
  against authenticated and mounted scope before declaring success.
- Emit exactly one structured redacted event for every outcome with
  `trace_id`, `tenant_id`, `actor_id`, `action`, and `outcome`. Do not log raw
  keys, payload/contact/free text, RFI description, photo IDs, credentials,
  tokens, headers, or bodies.
- Revalidate and refresh only after a strict committed result. A refresh or
  navigation failure after commit returns committed success with
  `success_refresh_failed`; it never becomes a submission failure. No refresh
  occurs for validation, auth, service, malformed-result, or scope-mismatch
  failure.

### Best-effort report archival boundary

HTML report archival remains explicitly outside the atomic database command
because it includes Supabase Storage. Attempt it only after a newly committed
inspection result; never let it roll back, duplicate, or relabel the inspection
or its Design handoff as failed. Exact replay must not create a second archived
document.

Return an explicit bounded archival state such as `archived` or
`needs_repair`. On archival failure, log only redacted IDs/error class and show
committed inspection success plus an accessible warning that the Document Vault
copy needs attention. Do not claim the report was archived. If an archived
document already exists, report that durable state honestly.

A durable automatic/manual report-repair mechanism is outside this slice and
remains a recorded decision: the runtime/product owners must choose a bounded
background reconciliation job or an authorized idempotent “Retry archive”
command. Do not invent a queue, schema, recipient, or retry policy here. This
does not block atomic inspection submission because report archival was already
best-effort product behavior.

### Mounted page and forms

- Keep the inspection page readable for all thirteen roles under its current
  tenant-scoped queries.
- Compute `canSubmitInspection` from central `can`. Owner/Admin/Commercial see
  inspection and RFI forms. The other ten see the existing records plus an
  accessible read-only notice and no submit controls.
- Preserve the inspection UUID through offline drafts, returned errors,
  rejected promises, retries, and duplicate clicks. Keep the same key until a
  strict committed result; generate a new key only after success.
- Generate the RFI form's initial UUID server-side per mount, retain it through
  failures and retries, and rotate/reset only after strict success.
- Both forms use a synchronous single-flight guard in addition to pending UI.
  A same-tick double click sends one action call.
- Catch returned and rejected errors, clear stale error on retry, retain all
  user input on genuine failure, and expose errors with `role="alert"`.
- Inspection committed success clears its offline draft and refreshes once.
  Honest replay copy must not claim a new inspection or notification. Report
  archival warning remains visible after success.
- RFI committed success resets description/priority, rotates its key, and
  refreshes once. Replay copy states that the existing RFI was recovered, not
  newly created.
- Add explicit accessible labels/help/error association to the RFI description,
  priority, and submit control; preserve keyboard operation and current mobile
  layout.

### Agent 03 tests and acceptance

Tests must cover all thirteen page/control projections and direct action calls;
missing auth; hostile/duplicate identity and unknown fields; stable key
serialization and sensitivity; exactly one service call; service returned/
thrown error; malformed and scope-mismatched success; synchronous double click;
retry with retained inputs/key; accessible labels and alerts; stale-error
clearing; success-only reset/refresh; replay messaging; refresh failure after
commit; archival success/failure/replay messaging; and absence of every local
durable writer or fallback in both action slices.

Run focused action/page/form/service tests, the neighboring proposal and WO-12
contract suites, Web/root typecheck and lint, Web build, diff checks, and
gitleaks as proportionate. Browser, database, hosted, and provider mutation
remain prohibited in this handoff unless a later owner explicitly authorizes an
isolated lane.

→ Handoff to Agent 12. Inputs: committed Agent 05 service and Agent 03 mounted
integration. Expected output: harden WO-12 verification so neither P1, role
overprojection, replay weakness, privacy leak, or false UI success can return.

## Agent 12 — independent verifier and security closeout

Agent 12 owns only:

- `scripts/verify-wo-12-contract.mjs`;
- `scripts/verify-wo-12-contract.test.mjs`; and
- append-only verification notes in this handoff and its changeset.

The verifier must trace actual mounted imports/calls into the Agent 05 service,
not search for reassuring strings. It must prove both actions have one service
delegate and no reachable local/fallback database, audit, SLA, or notification
writer. It must bind the exact three-role control projection to the central
capability and preserve all-role read-only page access.

Add hostile mutations that individually:

- move SLA, Design notification, or either semantic audit outside the service
  transaction;
- delete or weaken tenant/Opportunity/inspection/PPRF/photo validation;
- restore Opportunity-only inspection replay or omit any command field from
  the hash;
- truncate the key/hash, accept malformed receipts, reuse a key with changed
  input, or allow concurrent duplicate effects;
- change/add the Design recipient, make notification failure non-fatal, or
  duplicate Design rows on replay;
- allow an RFI insert without its audit;
- restore local action writers/fallbacks or call the service twice;
- expose forms to a denied role, trust browser identity, drop synchronous
  single-flight protection, reset input/key on failure, refresh on failure, or
  suppress accessible errors; and
- log or receipt a raw key, inspection payload/contact/free text, RFI
  description, photo ID, token, credential, header, or body.

The verifier must separately acknowledge the report archive boundary: archival
failure is committed success with an honest visible warning, never transaction
failure or a false archived claim. It must not require report Storage work
inside the database transaction.

Run every mutation against the verifier and record RED/GREEN counts. Re-run the
focused service/mounted suites, WO-12 contract, type/lint/build evidence as
appropriate for changed files, diff checks, and repository gitleaks. Report
static-analysis and transaction-double limitations explicitly. No browser,
database, hosted, schema, data, environment, provider, deployment, or remote
mutation is authorized by this handoff.

## Definition of done

- Both P1s have regression-first tests and one authoritative service boundary.
- Inspection, safe photo links, mandatory semantic audit/receipt, open design-
  handoff SLA, and all resolved Design in-app notifications are atomic.
- RFI and its mandatory semantic audit/receipt are atomic.
- Both commands provide tenant-scoped full-command replay/conflict/concurrency
  guarantees and strict stable results.
- Owner/Admin/Commercial alone receive mutation authority and controls; all
  thirteen retain the existing tenant-scoped read.
- Report archival remains best effort, is represented honestly, and has an
  explicit unresolved repair-path decision rather than a fabricated guarantee.
- All logs and receipts are redacted; no new dependency or schema is introduced
  unless Agent 05 proves the existing receipt design cannot satisfy the
  contract and formally hands off before changing it.
- Required focused and neighboring checks pass, or every unavailable runtime
  lane is reported as `BLOCKED`/`NOT RUN` without overstating evidence.

## Agent 05 implementation evidence — 2026-09-03

Status: **service boundary complete; ready for Agent 03 integration**.

Agent 05 added only the owned service and direct transaction-double suite. The
service exports strict, versioned Zod commands, results, and redacted receipt
schemas for both `inspection_submission` and `rfi_creation`. It re-locks the
current authoritative `users` membership row and applies central
`site_inspection.submit`, which remains exactly Owner/Admin/Commercial.

Inspection submission now has one transaction authority for the locked
same-tenant Opportunity/PPRF, exact safe photo set, submitted inspection,
append-only semantic audit/receipt, the single open one-business-day
`inspection.design_handoff` clock, and every resolved Design in-app
notification. Notification rows carry only a service/inspection durable
correlation payload so replay can prove the exact notification set instead of
mistaking an older Opportunity notification for this inspection.

RFI creation uses the handoff-approved schema-free receipt: the append-only
`site_inspection_rfi` audit diff contains the tenant-scoped full-key and full
command hashes plus strict durable result metadata. The advisory transaction
lock serializes same-key retries; exact replay loads and validates the RFI,
while changed command reuse conflicts. No report archival behavior moved into
the service.

Verification evidence:

- initial RED: the direct suite failed before collection because the service
  module did not exist;
- focused service: 60/60 passed, 0 failed, 0 skipped;
- neighboring proposal actions: 21/21 passed, 0 failed, 0 skipped;
- Web typecheck, including the listed E2E TypeScript projects: passed;
- focused ESLint: service passed with zero errors; the repository ignore rule
  reports the direct test as ignored (one warning, no error), while TypeScript
  and Vitest compile and execute it;
- gitleaks: **BLOCKED / NOT RUN** because the executable is not installed in
  this environment; manual changed-file inspection found no credential,
  token, key, or environment material;
- full build: not run in this service-only slice; defer to Agent 03 mounted
  integration so the unchanged application is not built twice.

The suite injects failure at inspection insert, photo-link insert,
audit/receipt, SLA read/insert, Design-recipient query, each notification
insert, strict result construction, RFI insert, and RFI audit/result
construction. It also covers all 13 roles for both commands, strict input/date
bounds, tenant/Opportunity/Project photo isolation, replay/conflict,
same-tenant-key concurrency, tenant independence, malformed receipts,
incomplete durable replay, existing SLA reuse, zero/duplicate Design
recipients, and receipt privacy.

Bounded limitation: atomicity and concurrency are proven with deterministic
transaction doubles. No explicitly isolated PostgreSQL lane was authorized or
available, so live PostgreSQL advisory-lock/rollback evidence is **BLOCKED / NOT
RUN** in this slice. Browser, Storage, hosted data, providers, deployment, and
report archival are also **NOT RUN** by scope.

→ Handoff to Agent 03. Reason: both atomic transaction authorities and their
strict contracts are now available. Inputs:
`siteInspectionWorkflowService`, the two exported command schemas, the shared
strict result schema, and this 60-test evidence. Expected output: replace the
two mounted writers with exactly one service call each, bind route identities,
project exact controls/read-only state, and preserve report archival as honest
best-effort post-commit work.

## Agent 03 mounted integration evidence — 2026-09-03

Status: **mounted integration complete; ready for Agent 12 verification**.

Runtime commit: `fbf68044` (`fix(proposal): mount atomic site inspection workflows`).

Agent 03 replaced both exported proposal writers with strict adapters to the
Agent 05 service. Each adapter authenticates independently, projects central
`site_inspection.submit`, accepts an exact duplicate-free text-field inventory,
binds tenant/actor/Opportunity/inspection identity outside browser input, calls
its service method exactly once, and validates the strict result plus mounted
scope before reporting success. The action slices contain no local database,
audit, SLA, notification, or fallback writer.

The inspection form retains its IndexedDB-backed UUID and draft across
returned/rejected failures, adds a same-tick single-flight guard, and emits all
ten accepted native fields exactly once without Opportunity identity. Strict
committed success alone clears the draft and rotates the key. Fresh success
states that the Design handoff was recorded; replay states that the existing
handoff was recovered. Best-effort HTML report failure is returned as a
separate accessible archive warning while committed inspection success is
preserved. Refresh failure likewise remains committed success.

The RFI form now receives a server-generated per-mount UUID, binds Opportunity
and inspection identity outside the form, retains controlled description/
priority/key through both returned and thrown failures, clears stale feedback
on retry, and uses a synchronous single-flight guard. It resets and rotates
only after strict committed success and distinguishes replay from a new RFI.
Description, priority, errors, and pending/success state have explicit labels
and accessible live semantics.

The mounted page continues its existing tenant-scoped reads for all thirteen
roles. Central `can` exposes both mutation forms only to Owner, Admin, and
Commercial; the other ten see inspection/RFI history and explicit read-only
notices.

Verification evidence:

- regression-first RED: 4/4 new mounted form tests failed against the prior
  inventory and missing synchronous guards (the first actions/page filter was
  malformed by Windows shell quoting and found no tests; it was corrected);
- focused service + mounted tests: 134/134 passed across five files (60 service,
  56 proposal action, four form, and fourteen page/role tests);
- Web ESLint: passed with zero warnings/errors;
- root typecheck: passed, five tasks successful (four cached, Web executed);
- Web production build: passed; 89 static pages generated and inspection route
  emitted successfully;
- repository gitleaks 8.30.1: passed, 1,835 commits / ~46.33 MB scanned, no
  leaks found;
- `git diff --check`: passed (Git reported only expected LF-to-CRLF checkout
  notices).

The legacy WO-12 verifier is **FAILED / stale**, not a runtime regression. Its
first exact-string failure is `WO-12 invariant missing: no network mutation
while offline`: it requires the old literal
`disabled={pending || photoBusy || !online}`, while the mounted form safely
adds `|| !draftReady`. Subsequent assertions still require the removed local
transaction/audit/RFI writers rather than tracing the new service authority.
Per scope, Agent 03 did not edit the verifier.

Coverage limits: the form tests use server rendering plus source/contract
inspection because this Vitest lane has no interactive DOM environment; they
prove actual rendered field/label inventory and source-level retry/single-flight
contracts, not real browser timing. Browser, IndexedDB, Storage, live
PostgreSQL, hosted, provider, database, environment, and deployment lanes are
**NOT RUN** by scope. Report archival failure was injected at the mounted
action boundary; no Storage mutation occurred.

→ Handoff to Agent 12. Reason: runtime mounting is committed and all current
source gates pass except the deliberately unchanged stale verifier. Inputs:
Agent 05 service commit, Agent 03 runtime commit `fbf68044`, focused 134/134
evidence, and the exact stale-verifier failure above. Expected output: replace
old reassuring-string/local-writer assertions with reachable service-call,
role, privacy, replay, hostile-mutation, offline/draft, and honest archive/
refresh verification, then record independent RED/GREEN counts without
changing runtime behavior.

## Agent 12 independent WO-12 contract closeout — 2026-09-03

Status: **GO to independent browser/PostgreSQL QA; no P0/P1/P2 source-contract
finding**.

Agent 12 replaced the stale 72-line literal verifier with a TypeScript-AST
contract verifier and a bounded mutation suite. It now proves the complete
13-role vocabulary and exact Owner/Admin/Commercial mutation grant, the two
mounted controls and exact duplicate-free field inventories, server-bound
route identities, one service delegate per action, and the absence of reachable
local/imported/aliased/re-exported durable writers. The only allowed post-commit
writer remains non-replay inspection-report archival; its failure and refresh
failure are explicitly classified as committed success.

The verifier also proves stable UUID/synchronous single-flight/failure-retention
contracts, tenant-selected reads, strict result scope and redacted outcome logs,
one transaction per service command, current locked membership, capability and
tenant locks, tenant/full-UUID SHA-256 key hashing, tenant/actor/full-command
hashing, strict private receipts, safe photo binding, atomic inspection/photo/
audit/SLA/Design-notification effects, atomic RFI/audit effects, complete replay
validation, and direct replay/conflict/concurrency/failure-injection evidence.

Verification evidence:

- regression baseline: stale verifier **0/1 passed**, failing first at obsolete
  `disabled={pending || photoBusy || !online}` and still requiring removed local
  writers;
- final authoritative/mutation suite: **45/45 passed twice**, with three
  authoritative/benign positives and 42 hostile mutations, zero skipped/failed;
- focused current service + mounted suites: **134/134 passed** across five files
  (60 service, 56 actions, two inspection-form, two RFI-form, fourteen page);
- both verifier scripts parse under repository Node 22; direct verifier and
  `git diff --check` pass;
- current-head Web lint, root typecheck (5/5), production build (89 pages), and
  gitleaks 8.30.1 evidence are reused from Agent 03 because this slice changes
  only verification scripts/docs. The gitleaks executable is not present in
  this Agent 12 shell, so no redundant local scan was claimed.

Bounded limitation: this is compiler-AST/source-contract evidence plus
deterministic transaction doubles. It is not a TypeScript type-checker proof of
arbitrary dynamically computed calls. Browser timing, IndexedDB, Storage, live
PostgreSQL advisory locking/rollback, hosted providers, environment, deployment,
and report-file archival remain **NOT RUN** by this no-browser/no-DB scope.

→ Handoff to independent QA. Inputs: the committed AST verifier, 42 hostile
mutations, 134/134 focused runtime evidence, and the prior green type/lint/build/
gitleaks gates. Expected output: exercise the three permitted and ten read-only
accounts in a real browser and, if an isolated database lane is authorized,
prove PostgreSQL advisory-lock/rollback behavior without production mutation.
