# Atomic PPRF submission

## Delivery contract

Goal: repair the two mounted PPRF submission paths so a successful command
commits all required domain, KYC, audit, SLA, notification, and durable replay
effects together. The bounded vertical covers both a new Client/Opportunity
intake and a new version for an existing Opportunity because their current
post-commit failure mode is the same.

This is an atomicity, authorization, exact-data, retry, and recoverable-UI
repair for WO-11 and automation A-01. It is not a PPRF redesign, recipient-role
taxonomy decision, Core migration, or schema project.

### Source-backed current state

The current new-intake action at `/crm/opportunities/new/pprf` performs one
transaction for Account, Opportunity, PPRF v1, both KYC tracks, and three
semantic audits. Only after that transaction commits, it separately starts the
legacy `pprf.review` SLA and creates role-targeted notifications. The existing-
Opportunity action at `/crm/opportunities/[id]/proposal/pprf` has the same
boundary: it commits the versioned PPRF, KYC reset, and semantic audit before
starting the SLA and creating notifications. If either post-commit call fails,
the action reports failure after durable submission state already exists.

The repository's current recipient sets are product behavior and must remain
verbatim in this slice:

- new intake: `finance`, `owner`, `admin`;
- existing-Opportunity submission/resubmission: `commercial`, `finance`.

Both current calls create in-app notification rows only. Neither sets
`alsoEmail`, a template, or provider inputs, so no email or other provider side
effect belongs in the atomic transaction or this delivery.

The current intake creates an Account with pending KYC, an Opportunity at the
established `lead` stage and its canonical probability, PPRF version 1, and the
two WO-11 tracks. Existing-Opportunity submission locks version allocation,
inserts the next version, and resets both tracks to pending with a new two-
business-day due time. These domain semantics remain unchanged unless source
tests prove a contradiction; the new service changes the transaction boundary,
not the funnel.

The route registry makes the PPRF detail route readable by all thirteen roles
and restricts the new-intake route to the existing Account-create role set. The
central `pprf.submit` and `account.create` capabilities both grant exactly
Owner, Admin, and Sales. The detail page currently renders the submit form for
all roles even though its action later denies ten roles; that control projection
must be corrected without removing their tenant-scoped PPRF/KYC history read.

### Product and authorization policy

The authoritative thirteen-role vocabulary is:

`owner`, `estimator`, `pm`, `admin`, `sales`, `commercial`, `design`,
`sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`, `viewer`.

- Owner, Admin, and Sales are the only roles that may submit either command.
- `/crm/opportunities/new/pprf` remains available to exactly those three roles.
- `/crm/opportunities/[id]/proposal/pprf` remains readable to all thirteen
  roles for a same-tenant Opportunity.
- Estimator, PM, Commercial, Design, Service Delivery PM/PE, Finance,
  Procurement, Safety, CX, and Viewer see the detail as read-only and receive no
  PPRF submit/resubmit form or submit control.
- A forged direct action call by any denied role fails before Account,
  Opportunity, PPRF, KYC, audit, SLA, notification, or receipt effects.
- The service re-resolves the actor's current same-tenant membership inside the
  transaction. Intake rechecks both `account.create` and `pprf.submit`;
  existing-Opportunity submission rechecks `pprf.submit`. It does not trust a
  stale role, tenant, actor, account, Opportunity owner, version, or stage
  supplied by the browser.
- Missing and cross-tenant Opportunity targets fail closed without disclosing
  whether a foreign row exists.

### Strict command and exact-data contract

Agent 05 owns the service-level Zod command/result schemas in
`apps/web/src/server/crm/pprf-submission-service.ts`. Agent 03 imports and uses
those schemas from the server actions; it must not define a weaker duplicate.
Both schemas are strict and reject unknown keys.

Both commands carry a server-rendered, client-stable submission UUID. The page
creates it once for the mounted form; the client preserves the same value across
recoverable retries and duplicate clicks. The action treats it as untrusted
input, accepts only a valid UUID, and never accepts browser-supplied tenant,
actor, role, account ID, result ID, version, KYC status, SLA data, notification
recipients, or audit fields.

The new-intake command contains only the current Account, Opportunity, and PPRF
fields plus the submission UUID. The existing-Opportunity command receives its
Opportunity ID from server-bound route/form context and contains only the
current PPRF payload plus the submission UUID. Agent 03 must reject duplicate
or hostile `FormData` values rather than selecting an arbitrary value.

Money follows PRD invariant I-01:

- the service command represents TCV and GP as canonical non-negative base-10
  centavo strings (`0` or a non-zero digit followed by digits), never a
  JavaScript monetary number;
- the action converts accepted peso input to centavos with string parsing and
  `BigInt`, with at most two fractional digits and no exponent, sign, grouping,
  whitespace ambiguity, `NaN`, or infinity;
- weighted TCV is calculated exactly with `BigInt` and the established stage
  probability/rounding rule; and
- only the final, explicitly bounded Drizzle adapter converts to the current
  safe integer-backed BIGINT representation. Overflow fails before writes.

Calendar fields are strict. Browser date inputs must be valid `YYYY-MM-DD`
calendar dates, not merely strings that `Date` happens to parse. PPRF
`expected_start_date` remains a normalized date-only value in the JSON payload.
An optional Opportunity closing date is adapted to one deterministic
explicit-offset Philippine instant; no ambient Node/browser timezone parsing
is permitted. Empty optional dates normalize to absence.

Text is trimmed and bounded according to the existing form/domain limits.
Required values remain meaningful after trimming. The canonical command hash
uses the complete normalized command, including submission kind and the server-
bound Opportunity identity when present. It is computed before any data is
dropped or converted for persistence.

### One transaction and durable schema-free replay

Agent 05 creates `apps/web/src/server/crm/pprf-submission-service.ts` and its
focused tests. Only the minimum transaction-aware changes to existing database
helpers are permitted. Existing helper callers and behavior outside PPRF must
remain compatible.

Every command runs in one database transaction. In a stable lock order it must:

1. parse the strict command and submission UUID;
2. resolve and lock the current tenant membership, then enforce the central
   Owner/Admin/Sales submission capabilities;
3. derive SHA-256 hashes for the submission UUID and canonical normalized
   command without logging or storing the raw UUID or payload;
4. take a transaction advisory lock named from the tenant and full key hash;
5. find and strictly validate any existing semantic PPRF receipt before new
   effects; and
6. either replay its canonical result, reject same-key/different-command use,
   or execute all new effects and record the receipt atomically.

PostgreSQL maps the advisory lock name to a 64-bit value. A collision may cause
extra serialization only: receipt identity must compare the full tenant-scoped
256-bit key hash and full command hash. Advisory-lock equality must never be
treated as proof that two commands are the same.

The existing append-only semantic PPRF audit is the schema-free receipt. Its
bounded receipt metadata includes a service source/version marker, submission
kind, full key hash, canonical command hash, and the exact persisted Account ID
(intake only), Opportunity ID, PPRF submission ID, and PPRF version needed to
reconstruct and validate the strict result. It stores neither the raw key nor
raw client/contact/PPRF/notes values. A receipt lookup is tenant, source,
version, kind, and full-key-hash scoped. A malformed receipt, mismatched command
hash, wrong entity/result identity, missing persisted result, or incompatible
receipt version fails closed; it does not silently resubmit.

For new intake, the transaction preserves the current same-tenant normalized-
Account-name serialization and duplicate-name rule. It creates Account, linked
Opportunity at `lead`, PPRF v1, both KYC tracks, the current three semantic
events (Account create, Opportunity create, and PPRF create), one open legacy
`pprf.review` SLA row, all in-app notification rows for the exact intake role
set, and the receipt metadata before commit. The PPRF semantic event carries the
redacted receipt metadata; it is not a fourth semantic event.

For an existing Opportunity, the transaction locks and rechecks the same-tenant
Opportunity before allocating the version. It inserts exactly the next PPRF
version, resets both KYC tracks to pending with one new tenant-calendar due
time, writes the current one PPRF semantic event carrying the redacted receipt,
ensures the matching open
legacy `pprf.review` SLA row under existing duplicate-open-clock semantics, and
creates all in-app notification rows for the exact resubmission role set.
Concurrent different keys for the same Opportunity serialize on its locked row
so versions cannot race.

The SLA is the existing legacy row with:

- `tenant_id` equal to the current tenant;
- `entity_type = 'opportunity'`;
- `entity_id` equal to the persisted Opportunity;
- `sla_label = 'pprf.review'`; and
- the existing two-business-day configuration.

An existing open matching row remains the valid no-duplicate case. No recipient
for a preserved role is also a valid zero-notification case, matching current
`notifyRoles` semantics. A query or insert failure is not absence: database
failure during Account, Opportunity, PPRF, KYC, any required audit, SLA,
notification, or receipt work aborts and rolls back the entire command.

Exact replay after a committed response is lost returns the original strict
IDs/version and creates no second domain row, KYC reset, audit, SLA, or
notification. Same tenant/key with any normalized command difference returns a
typed conflict. The same UUID in another tenant is independent. Concurrent
same-key requests have one set of effects and one replay.

### Audit and privacy boundary

The semantic receipt is deliberately redacted: it may record bounded workflow
metadata, IDs, version, status, and hashes, but not raw PPRF fields, Account
contact data, free-text remarks/scope notes, the idempotency UUID, credentials,
headers, or request bodies. Structured action logs follow the same rule.

The repository's pre-existing generic `audit_log_trigger()` converts inserted
rows to JSON and changed rows to a generic diff. PPRF, Account, Opportunity,
KYC, SLA, and notification tables already participate in that infrastructure,
so generic audit rows may contain existing domain fields, including contact or
PPRF payload values. Removing/redesigning those trigger payloads is outside this
no-schema slice and must not be disguised as solved by redacting the semantic
receipt. Independent QA must distinguish required semantic receipts from
generic trigger-generated audit rows when counting effects.

### Agent 03 Web boundary and experience

After Agent 05 commits the green service, Agent 03 owns both mounted actions,
both pages, and both form components:

- `apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/actions.ts`;
- `apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/page.tsx`;
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts`;
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/pprf/page.tsx`;
- `apps/web/src/components/proposal/pprf-intake-form.tsx`; and
- `apps/web/src/components/proposal/pprf-form.tsx`.

Each action authenticates, parses exactly once through the strict service
contract, delegates exactly once to the atomic service, strictly validates the
returned result, and performs no durable database mutation after the service
commits. There is no local second audit, SLA, notification, fallback, or Core
API call.

Every branch is inside typed error handling and emits one structured,
per-outcome log with `trace_id`, `tenant_id`, `actor_id`, `action`, and
`outcome`. Outcomes distinguish authorization/validation/domain failure,
conflict, unexpected service failure, committed success, and committed success
whose refresh failed. Logs never include raw form data, key/hash, contact data,
money values, dates, PPRF payload, notes, or credentials.

Revalidation/navigation is success-only. A revalidation or client refresh/
navigation failure after a strict committed result does not turn the durable
submission into a reported command failure or invite a duplicate command. The
action returns committed success and logs `success_refresh_failed`; the client
shows a truthful committed-success message with a recoverable refresh/navigation
option. A genuine command failure retains all entered values and the same
submission UUID for retry, restores an enabled control, and never navigates or
shows success. Each interaction has one in-flight submission and prevents
duplicate clicks.

The detail page shows the form only to Owner/Admin/Sales. The denied ten retain
the same tenant-scoped PPRF version history and KYC view plus an explicit read-
only state. Controls remain keyboard operable, labels and errors are associated,
pending state is announced, focus reaches the failure/success status, and
narrow layout remains usable.

## Acceptance criteria

1. New intake and existing-Opportunity submission enforce exactly three allowed
   and ten denied roles from current same-tenant membership; denials precede all
   persistent effects. The intake route is exact-three; the detail route is
   all-role read with exact-three mutation controls.
2. New intake atomically creates the established Account, `lead` Opportunity,
   PPRF v1, two pending KYC tracks, required semantic audits/receipt, matching
   open `pprf.review` SLA, and in-app notifications for exactly
   `finance`/`owner`/`admin`.
3. Existing submission atomically locks/rechecks the Opportunity, inserts the
   next version, resets exactly both KYC tracks, writes the required semantic
   audit/receipt, preserves the matching open SLA rule, and creates in-app
   notifications for exactly `commercial`/`finance`.
4. Failure injected at every Account, Opportunity, PPRF, KYC, audit, SLA,
   notification, or receipt effect rolls back all command effects. A recipient
   role with no users and an already-open matching SLA follow the documented
   successful no-new-row semantics; database failures do not.
5. A client-stable UUID is the sole browser retry token. Tenant plus its full
   SHA-256 hash scopes receipt lookup and advisory serialization; the canonical
   full-command hash detects reuse. The raw UUID and sensitive command values
   are absent from receipt and structured logs.
6. Exact replay returns the original persisted IDs/version after response loss;
   changed-payload key reuse conflicts; same-key concurrency produces one
   effect set; cross-tenant key reuse is isolated; different-key concurrent
   resubmissions allocate distinct ordered versions.
7. TCV, GP, and weighted TCV remain strings/`BigInt` until a proven safe DB
   adapter. Invalid, negative, fractional-centavo, exponent, non-canonical, and
   overflow values fail before writes. Date-only inputs are real calendar dates
   and timezone adaptation is deterministic.
8. Results are strict discriminated unions. Success carries submission kind,
   tenant, Account ID when applicable, Opportunity ID, PPRF ID, version, and
   replay state sufficient for action-side identity validation. Errors use the
   established taxonomy and conceal foreign rows.
9. Each action calls the service once, has no durable post-commit writer, logs
   every outcome without sensitive data, and revalidates/navigates only after a
   strictly validated committed success. Refresh failure returns committed
   success with `success_refresh_failed`.
10. Genuine validation, authorization, service, transaction, conflict, and
    malformed-result failures retain entered form data and the stable UUID,
    show no success/navigation, and permit a safe retry. Submitted success is
    never represented as failure solely because refresh failed.
11. Agent 12's mounted-entry verifier enumerates both actions/pages/forms and
    mutation-sensitively proves exact role/control wiring, one atomic service
    delegate, strict schemas/results, stable key, no reachable local/post-commit
    writer, receipt privacy, exact recipients, and success-only refresh.
12. Focused and neighboring tests, Web typecheck/lint/build, diff checks, and
    secret scan pass. PostgreSQL and authenticated browser evidence are
    reported separately and are never inferred from transaction doubles.

## Required test matrix

Agent 05 tests both command variants before implementation, then keeps the red
cases green:

- all thirteen roles; stale/missing membership; tenant isolation; foreign or
  missing Opportunity; direct-call denial before effects;
- strict unknown-key and duplicate-value rejection; invalid UUID; required and
  bounded trimmed text; Account duplicate name; invalid contact fields;
- canonical TCV/GP centavo strings, exact weighted result, boundary maximum,
  overflow, decimal/exponent/sign/whitespace rejection, and strict real dates;
- intake Account/Opportunity/PPRF/KYC/audit/SLA/notification/receipt success;
  resubmission locked version allocation and exact two-track reset;
- exact recipient roles and zero-recipient success; no email/provider call;
- every transactional failpoint with full rollback; malformed receipt and
  persisted-result fail closed;
- replay after response loss, same-key changed command conflict, concurrent
  same key one effect, tenant key isolation, and concurrent different-key
  version allocation; and
- strict canonical result identity/version/replay values.

Agent 03 tests both actions, pages, and forms:

- exact three route/action/control roles and ten read-only detail roles;
- hostile/duplicate FormData, exact money conversion, overflow, strict dates,
  stable UUID across rerenders/failure retry, and new UUID only for a new
  logical submission;
- one service call; service returned error/throw, transaction failure,
  malformed/mismatched result, and no fallback or durable post-commit helper;
- structured redacted logging for every outcome;
- no revalidation/navigation/success on genuine failure; retained fields and
  retry; pending duplicate suppression; and
- committed success, replay success, revalidation/refresh/navigation failure
  surfaced as committed `success_refresh_failed`, desktop/narrow/keyboard/
  screen-reader status behavior.

Agent 12 adds hostile mutations that turn the contract red if either mounted
action bypasses the service, adds a DB/audit/SLA/notification fallback, drops
authorization or strict parsing, weakens money/date handling, changes recipient
sets, breaks receipt hashes/result checks, exposes a control to a denied role,
loses stable retry identity, or reports refresh failure as command failure.

## Sequential ownership and handoffs

Agents work sequentially and commit before handoff.

1. **Agent 05 — API & Backend Logic**
   - Own new `apps/web/src/server/crm/pprf-submission-service.ts` and focused
     tests, plus only the minimum transaction-aware database-helper changes and
     focused tests strictly required for atomic audit/SLA/notifications. The
     existing audit helper is already transaction-aware; likely helper seams are
     `apps/web/src/lib/operations/sla-clock.ts` and
     `apps/web/src/lib/operations/notifications.ts`, and only if the service
     cannot reuse their behavior safely without editing them.
   - Derive schemas, replay receipt, current membership, transaction ordering,
     exact money/date adapters, role recipients, and result from repository
     evidence. Do not edit actions, pages, components, Core API, shared types,
     schema, dependencies, data, environment, or deployment.
   - Prove the schema-free receipt safe. If durable replay, key conflict, or
     concurrency cannot be proven without schema or unrelated-ledger misuse,
     stop and document a material blocker before Agent 03.
   - → Handoff to Agent 03 with the committed service contract and exact
     verification, or return BLOCK.
2. **Agent 03 — Next.js App Router Engineer**
   - Own the two action files, two pages, and two PPRF form components listed
     above and their focused tests.
   - Wire the strict service once, exact role/read-only projection, stable UUID,
     structured outcomes, strict result, success-only revalidation/navigation,
     committed refresh-failure result, and accessible recoverable forms.
   - Do not edit the service/helpers, Core/API/shared, scripts, schema,
     dependencies, data, environment, or deployment.
   - → Handoff to Agent 12 only after focused and neighboring gates pass.
3. **Agent 12 / mounted-entry contract owner**
   - Begin only after both source commits.
   - Inventory the two mounted actions/pages/forms and reachable service/helper
     graph. Prove the acceptance contract with syntax-aware, mutation-sensitive
     cases without editing runtime product source.
   - → Handoff to independent QA/browser/PostgreSQL verification.
4. **Independent QA and browser verifier**
   - Rerun role, strict input/result, transaction rollback, receipt replay/
     conflict/concurrency, recipient, logging, and UI recovery evidence.
   - Use only a disposable or rollback-contained PostgreSQL target and a secure
     isolated authenticated browser. Never use the engineer's daily browser or
     mutate shared hosted/demo data.

## Risks, blocks, and explicit decisions

- **Current P1:** both PPRF commands commit required domain/KYC/audit effects
  before SLA/notification work. This slice closes that shared partial-success
  boundary.
- **Schema-free receipt:** `audit_log` can safely serve as the receipt only if
  Agent 05 proves exact tenant/full-hash lookup, strict stored result identity,
  rollback, replay, conflict, and concurrency. Otherwise this work is BLOCKED
  before any UI edit; no schema exception is implied.
- **Recipient taxonomy — NEEDS DECISION, out of scope:** PRD A-01 describes
  Finance-GA, Finance-AR, FC, and President responsibilities, while the current
  role vocabulary exposes broader roles. This slice preserves the two current
  recipient arrays verbatim and does not infer a new taxonomy or notification
  audience.
- **Generic audit trigger boundary:** generic row-image/diff audits can include
  domain payload values. This is pre-existing and outside this no-schema repair;
  semantic receipt/log redaction does not erase it.
- **PostgreSQL block:** real rollback, advisory locking, trigger output, and
  concurrency require an explicitly isolated database URL and opt-in. If none
  is available, the protected canary is skipped and persistence evidence stays
  `BLOCKED / NOT RUN`; mocks are not database proof.
- **Authenticated browser block:** browser mutation requires a secure reusable
  isolated session for each relevant identity. The current evidence set lacks
  Estimator and PM identities in particular. Missing safe sessions remain
  `BLOCKED`; no daily browser session or hosted tenant is used as a substitute.
- **Refresh is not transaction state:** a committed command remains successful
  if cache refresh or navigation later fails. The UI must say so explicitly and
  must not encourage an unkeyed resubmission.
- **No provider promise:** current PPRF calls request in-app notification rows
  only. Email delivery, outbox/provider retries, or external messages are not
  accepted as part of this slice.

## Explicit exclusions

- No Core API, Nest module/controller, shared-contract package, schema,
  migration, dependency, lockfile, data, fixture, environment, provider,
  deployment, hosted/demo mutation, or functional-ledger edit.
- No PPRF field redesign, Account deduplication redesign, funnel/stage change,
  KYC approval-role redesign, recipient taxonomy decision, SLA policy change,
  generic audit-trigger redaction, notification outbox migration, or email.
- No change to unrelated proposal actions, site inspection, design, change
  request, opportunity transition/conversion, project, or award workflows.
- No claim of PostgreSQL, authenticated browser, accessibility, or production
  verification until those lanes actually run.

## Initial state

- Worktree: `D:/thirdcode/ERP-pprf-20260903`
- Branch: `agent-05/atomic-pprf-submission`
- Base: `a9f108882543b95f56641613967ef3dfe8bbac27`
- Working tree before this note: clean
- Product authority: PRD v1.4 WO-11, automation A-01, M-06/WO-03 SLA rules,
  WO-02 and invariant I-11/A-44 append-only audit requirements, and I-01 exact
  monetary handling
- Audit input: the latest independent audit conclusions were supplied as
  read-only task evidence; no separate audit-report file exists or is created
  by this planning slice

→ Handoff to Agent 05. Reason: the two mounted PPRF commands share a
post-commit SLA/notification failure boundary and lack durable exact replay.
Inputs: the role/read policy, preserved recipient arrays, source-backed domain
semantics, transaction/receipt/privacy contract, test matrix, and no-schema/
no-Core boundary above. Expected output: a TDD-built atomic PPRF submission
service and only required transaction-aware helper changes, focused gates,
conventional source/docs commits, and an explicit Agent 03 handoff or material
schema-free-idempotency blocker.

## Agent 05 implementation — 2026-09-03

Status: **GO to Agent 03**, subject to the unchanged PostgreSQL evidence block.

Source commit `c59fcc70` adds the bounded service and focused tests only:

- `apps/web/src/server/crm/pprf-submission-service.ts`
- `apps/web/src/server/crm/pprf-submission-service.test.ts`

The service exposes strict intake/resubmission command schemas, a strict
discriminated result schema, an injectable transaction boundary, and the
production `pprfSubmissionService`. Both commands repeat current membership,
tenant, and central `pprf.submit` authority inside their transaction. Intake
also repeats `account.create`; the resulting exact policy is Owner/Admin/Sales.

Each command acquires a tenant/full-key-hash advisory lock before receipt
lookup. The semantic PPRF audit receipt stores only the receipt version,
submission kind, full SHA-256 key and command hashes, and strict persisted
IDs/version. It never stores the raw UUID or raw contact/PPRF/notes values.
The 64-bit PostgreSQL advisory result is serialization only: a collision can
cause extra serialization, but identity still depends on the full hashes in the
tenant-scoped receipt. Missing, duplicate, malformed, command-mismatched, or
persisted-result-mismatched receipts fail closed.

Intake atomically creates Account, `lead` Opportunity, PPRF v1, both KYC
tracks, three semantic audit rows including the receipt, the missing open
`pprf.review` legacy SLA, and in-app rows for exactly
`finance`/`owner`/`admin`. Existing-Opportunity submission locks the tenant
Opportunity row, allocates the next version, inserts the PPRF, resets both KYC
tracks, writes the receipt audit, preserves the same open-SLA no-duplicate
rule, and inserts in-app rows for exactly `commercial`/`finance`. No provider
or other post-commit durable call exists. No matching recipient user and an
already-open matching SLA are successful no-new-row cases; database failure is
not treated as absence and rolls back.

TCV/GP cross the service boundary as canonical non-negative centavo strings,
remain `BigInt` through exact half-up weighted calculation, and convert to the
existing number-backed BIGINT adapter only after the established
`900000000000`-centavo bound. Dates are real calendar dates; Opportunity
closing date uses an explicit `+08:00` Philippine instant and PPRF expected
start remains normalized date-only JSON.

### Agent 05 verification

- PASS — focused service suite: 42/42, including all thirteen roles; missing/
  cross-tenant membership; strict money/date/overflow; exact recipients;
  zero-recipient success; tenant-isolated keys; same-key replay/conflict/
  concurrency; different-key ordered versions; strict receipt/result replay;
  nine intake and five resubmission rollback failpoints.
- PASS — focused plus neighboring Opportunity KYC, SLA utility, and
  notification suites: 54/54.
- PASS — full Web typecheck.
- PASS — full Web lint with zero warnings.
- PASS — Next.js 15.5.23 production Web build; 89 static pages generated.
- PASS — staged/source diff checks.
- PASS — repository gitleaks 8.30.1; 1,823 commits and approximately 46.08 MB
  scanned with no leaks.
- NOT RUN / BLOCKED — real PostgreSQL rollback, advisory-lock concurrency,
  and generic-trigger evidence. No explicitly isolated opt-in database URL was
  available, so the service did not contact a database.
- NOT RUN — browser, provider, hosted/demo mutation, schema, migration, data,
  environment, or deployment work; none belongs to Agent 05.

### → Handoff to Agent 03

Import `pprfSubmissionService`, `pprfIntakeCommandSchema`,
`pprfResubmissionCommandSchema`, and `pprfSubmissionResultSchema` from the new
service. The intake action must normalize its strict FormData to canonical
`tcvCentavos`/`gpCentavos` strings and a client-stable `submissionId`, then call
`submitIntake({ tenantId, userId }, command)` exactly once. The resubmission
action must server-bind its route Opportunity ID and call
`submitResubmission({ tenantId, userId }, command)` exactly once. Neither action
may accept tenant/actor/role/result identities or notification/audit/SLA fields
from FormData.

Validate the returned union again and require tenant plus route/result identity
and expected kind/version shape before reporting committed success. Map typed
errors without exposing receipt internals. Perform no database, KYC, audit,
SLA, notification, or provider mutation after the service returns. Structured
redacted outcome logging and success-only refresh/navigation remain Agent 03
work; a refresh failure after committed success must stay
`success_refresh_failed`, not become a command failure.

## Agent 03 integration — 2026-09-03

Status: **GO to Agent 12 / contract owner**, with the existing isolated
PostgreSQL and authenticated-browser evidence blocks unchanged.

Source commit `8bf06324` connects both mounted Web commands to the Agent 05
service. `createPprfIntake` and `submitPprf` now parse an exact, duplicate-free
FormData allowlist into the exported strict command schemas, independently
enforce the central Owner/Admin/Sales capabilities, and make exactly one
authenticated service call. Resubmission binds Opportunity identity from the
mounted route argument; tenant, actor, role, Opportunity identity, and service
result identities cannot be supplied in FormData. The service result is parsed
again and tenant/kind/version plus every available mounted identity is checked
before the action reports success. The service result contract intentionally
does not expose an actor field, so actor binding is proved by the authenticated
principal passed to the authoritative service and by rejection of browser
identity fields.

The intake action converts exact peso strings to canonical centavo strings
with `BigInt`/string arithmetic and never converts money through `Number`.
Invalid calendar dates, ambiguous/duplicate values, files, exponent/sign/
whitespace/grouping monetary forms, and unknown fields fail before the service.
Neither action contains a local PPRF/KYC/audit/SLA/notification writer or a
fallback after service commit. Each outcome emits one structured event with
`trace_id`, `tenant_id`, `actor_id`, action, and outcome only; raw keys,
tokens, request bodies, contact/PPRF/notes values, and thrown messages are not
logged.

Both server pages create one UUID per mounted form. The two client forms keep
that key and every uncontrolled user field through returned or rejected
failures, clear stale feedback at retry start, synchronously reject duplicate
submits, and navigate/refresh only after a strict committed result. Replay and
refresh-failure messages state that the command was already committed. A
successful detail refresh remounts the form under the fresh server UUID;
refresh failure leaves the committed form disabled instead of permitting an
accidental second version. The detail route remains tenant-scoped readable to
all thirteen roles, but only Owner/Admin/Sales receive the form; the other ten
receive an explicit prior-version read-only state. The intake route retains
its exact dual-capability redirect guard.

### Agent 03 verification

- PASS — focused action/form/page suite: 73/73 across six files, including all
  thirteen roles at both action and mounted route projections; direct no-auth;
  hostile/duplicate/unknown fields; exact money/date parsing; one service call;
  typed/throw/malformed/mismatched service results; no local writers; committed
  refresh failure; stable keys; read-only projection; accessible labels/status;
  synchronous guards; replay messages; and failure input retention contracts.
- PASS — Agent 05 service suite: 42/42.
- PASS — full Web Vitest: 1,525 passed, two opt-in integration tests skipped.
- PASS — Web and root typecheck; root covered five runnable packages, with four
  cache hits and the changed Web package executed fresh.
- PASS — Web and root lint with zero warnings.
- PASS — Next.js 15.5.23 production Web build; 89 static pages generated.
- PASS — staged/source diff checks.
- PASS — repository gitleaks 8.30.1; 1,824 commits and approximately 46.09 MB
  scanned with no leaks.
- FAIL (stale contract, outside Agent 03 scope) — `pnpm test:wo-11-contract`
  passed 28/29 but `scripts/verify-wo-11-kyc-gate.mjs:1810` still requires the
  intake action itself to contain `pprfSubmissions`, a local transaction, and
  KYC/audit calls. Those assertions contradict this approved service-boundary
  handoff and must follow the new service graph.
- NOT RUN / BLOCKED — real PostgreSQL rollback/concurrency/generic-trigger
  evidence; no explicitly isolated opt-in database binding was available.
- NOT RUN — authenticated browser, provider, hosted/demo mutation, schema,
  migration, data, environment, deployment, or remote operations.

### → Handoff to Agent 12 / WO-11 contract owner

Update only the WO-11 source contract to follow `createPprfIntake` and
`submitPprf` into `pprf-submission-service.ts`: require exactly one service
delegation, reject local/fallback durable writers, and retain the existing
service-side transaction/KYC/audit/SLA/notification and exact-money
invariants. Add hostile mounted-entry checks for duplicate/unknown identity
fields, exact-three action and route projections, strict result mismatch,
redacted one-event logging, and committed `success_refresh_failed` behavior.
Then rerun the focused 73 tests, the 42 service tests, WO-11, Web/root gates,
build, and gitleaks. Independent browser and PostgreSQL QA remain separate,
explicitly isolated lanes; do not mutate hosted/demo state.

## Agent 12 mounted-entry contract verification — 2026-09-03

Status: **GO to independent browser and isolated PostgreSQL QA**, with one
bounded P2 receipt-reader strictness risk recorded below. No in-scope P0 or P1
finding remains.

Contract commit `801ad89b` replaces the stale assumption that PPRF intake must
write locally in its Web action. The verifier now follows both mounted seams —
`createPprfIntake` to `submitIntake` and `submitPprf` to
`submitResubmission` — and requires exactly one authoritative service delegate
per action. Its reachable-call analysis rejects direct, aliased, imported, and
named-reexported local database/KYC/audit/SLA/notification writers and fallback
paths while retaining the service transaction, authorization, lock, receipt,
atomic-effect, exact-recipient, exact-money, and date invariants.

The mounted contract proves exact Owner/Admin/Sales submission authority across
central policy, routes, controls, actions, and the service; all thirteen roles
retain tenant-scoped detail read, and the other ten receive no submit control.
It also proves a server-bound resubmission Opportunity, per-mount UUID,
duplicate/unknown FormData rejection, tenant/kind/identity-scoped result
validation, redacted per-outcome logs, synchronous single-flight controls,
failure input retention, and success-only navigation/refresh with committed
`success_refresh_failed` classification.

### Agent 12 verification

- PASS — authoritative plus mutation-sensitive WO-11 suite: 53/53 twice under
  Node 22.23.2. The suite contains 43 PPRF-specific hostile mutations and 66
  hostile mutations overall, plus benign formatting and imported-service alias
  cases.
- PASS — mounted action/form/page suites: 73/73 across six files.
- PASS — atomic PPRF service suite: 42/42.
- PASS — root typecheck (five runnable packages), root source lint with zero
  warnings, and root production build; API build was cached and the changed Web
  build executed fresh, producing all 89 pages.
- PASS — `node --check` for both verifier files, staged/source diff checks, and
  repository gitleaks 8.30.1 over 1,828 commits / approximately 46.18 MB with no
  leak finding.
- INFO — an initial direct Vitest invocation used the monorepo root and failed
  to resolve Web `@/` aliases. Re-running the same files with `--root apps/web`
  passed 73/73; this was a runner-root invocation error, not a product failure.
- P2 / bounded runtime risk — the current receipt writer is bounded and the
  verifier rejects raw key, notes, and payload mutations, but
  `receiptSchema.passthrough()` accepts unknown keys on historical receipt
  reads. Known fields are the only values consumed or returned, so no present
  leak was found; fail-closed rejection of unexpected historical receipt fields
  requires a later runtime-owner change outside Agent 12's authorized scope.
- BOUNDED SCANNER LIMITATION — static call-graph proof follows named imports,
  named reexports, local functions, and simple identifier aliases. It does not
  prove safety for reflection, computed/namespace/default dynamic dispatch, raw
  or tagged SQL, or arbitrary callback references. Runtime mutation tests use
  transaction doubles and do not substitute for PostgreSQL lock/rollback/
  trigger execution.
- NOT RUN / BLOCKED — real PostgreSQL rollback/advisory-lock concurrency/
  trigger canary and authenticated browser checks. No isolated database binding
  was available, and Agent 12 was expressly prohibited from browser or database
  mutation.
- NOT RUN — provider, hosted/demo, schema, migration, data, environment,
  dependency, deployment, functional-ledger, or remote operations.

→ Handoff to independent QA. Exercise the three mounted submit controls with
the shared demo accounts in an isolated browser lane, and run the transaction
suite against an explicitly isolated PostgreSQL database. Treat the receipt
reader's unknown-key acceptance as P2 follow-up owned by the runtime service
agent; do not weaken the current bounded writer or replay checks.
