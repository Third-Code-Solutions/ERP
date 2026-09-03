# Atomic site inspection and RFI creation planning

Date: 2026-09-03

Status: **contract ready; no application source changed**.

## Outcome

Defined one sequential, decision-free repair for two WO-12 P1s:

1. Site-inspection submission currently commits the inspection/photo/audit
   transaction before separately opening its Design-handoff SLA and writing
   Design notifications. Post-commit failure can therefore report submission
   failure after durable state exists, and replay compares only Opportunity
   identity rather than the complete command.
2. RFI creation currently inserts the RFI before starting a separate audit
   transaction and has no idempotency key, allowing an unaudited or duplicated
   RFI on failure/retry.

The PRD is unchanged. WO-12 already requires the mobile inspection and
same-screen RFI, while A-44 requires immutable audit for every state change.

## Frozen decisions

- Owner, Admin, and Commercial remain the exact mutation roles through central
  `site_inspection.submit`; the other ten roles retain tenant-scoped read-only
  inspection detail with no mutation forms.
- Inspection submit atomically owns inspection, every validated photo link,
  one mandatory redacted semantic audit/receipt, the existing open
  `inspection.design_handoff` SLA, and durable in-app notifications to the
  existing Design recipient role.
- RFI creation atomically owns the RFI and one mandatory redacted semantic
  audit/receipt.
- Both use the full stable UUID plus the complete normalized command for
  tenant-scoped SHA-256 replay/conflict/concurrency. Inspection reuses its
  existing UUID/index; RFI adds a stable per-mounted-form UUID and uses the
  append-only audit receipt without schema change.
- Every supplied photo UUID must be unique, bounded, and authorized under the
  tenant plus Opportunity/current Project. Unsafe or missing IDs reject the
  whole command rather than being silently dropped.
- Receipt/result schemas are strict and versioned. Logs and receipts exclude
  raw keys, inspection payload/contact/free text, RFI descriptions, photo IDs,
  credentials, tokens, headers, and request bodies.
- HTML report archival remains explicitly best effort outside the database
  transaction. Committed success returns an honest archived/needs-repair state;
  archival failure never relabels the inspection as failed. A durable repair
  mechanism requires a later choice between bounded background reconciliation
  and an authorized idempotent manual retry command.
- Notification recipient taxonomy redesign, email/SMS/provider delivery, new
  schema, dependencies, data, environment, and deployment are out of scope.

## Sequential ownership

1. Agent 05: create and test
   `apps/web/src/server/crm/site-inspection-workflow-service.ts`, exporting the
   strict inspection/RFI commands, results, receipts, transactions, authority,
   full-command idempotency, and failure injection.
2. Agent 03: replace only the two mounted action writers, bind trusted route
   identity, project exact controls/read-only UI, add stable RFI key and
   recoverable accessible form behavior, and represent report/refresh outcomes
   honestly.
3. Agent 12: harden the WO-12 source verifier with reachable-call and hostile-
   mutation proof, then perform independent security/contract closeout.

Agents run sequentially and do not edit the next owner's files.

## Required evidence

- All thirteen roles for both service and mounted action/control paths.
- Failure injection at every inspection/photo/audit/SLA/recipient/notification
  boundary and both RFI/audit boundaries, proving zero partial effects.
- Exact replay, changed-command conflict, tenant independence, malformed
  receipt rejection, and concurrent single-effect behavior.
- Strict safe-photo authorization and exact stable result cross-checking.
- Returned/thrown/malformed service failures, failure input retention,
  synchronous single flight, accessible alert/labels, success-only reset and
  refresh, honest replay, committed refresh failure, and honest best-effort
  archive warning.
- Focused/neighboring service, proposal, and WO-12 tests; Web/root typecheck and
  lint; Web build; diff checks; and gitleaks as proportionate. Real browser and
  PostgreSQL claims remain `BLOCKED`/`NOT RUN` unless an explicitly isolated
  lane is later authorized.

## Handoff

→ Handoff to Agent 05. Reason: both defects require one tested transaction and
idempotency authority before the mounted actions can be safely rewired. Inputs:
this contract, the existing site-inspection schema/index, central
`site_inspection.submit` policy, audit writer, SLA configuration, notification
schema, and current proposal action/form/page source. Expected output: a
committed service-only changeset with strict schemas and focused RED/GREEN
evidence, followed by an explicit handoff to Agent 03.

## Agent 05 service implementation

Status: **completed locally; Agent 03 integration pending**.

Changed:

- added `apps/web/src/server/crm/site-inspection-workflow-service.ts` with one
  bounded Drizzle transaction adapter and strict command/result/receipt
  contracts for inspection submission and same-screen RFI creation;
- added its direct 60-test transaction-double suite covering the exact
  three-role authority, ten denied roles, tenant/entity/photo isolation,
  failure rollback at every required effect, full-command hashing,
  replay/conflict/concurrency, complete durable-result validation, and receipt
  privacy;
- retained report archival outside the service and made no schema, dependency,
  provider, environment, data, or deployment change.

Verification: focused service 60/60 passed; neighboring proposal actions 21/21
passed; Web typecheck passed; focused service ESLint passed with zero errors
(the configured ignore rule skips the direct test and emits one warning).
Gitleaks was blocked because its executable is unavailable; manual changed-file
inspection found no secret material. Live PostgreSQL, browser, Storage, hosted,
provider, deployment, and the full Web build were not run in this bounded
service slice. Agent 03 must run the build and mounted UI/action gates after
integration.

→ Handoff to Agent 03. Inputs: committed service, exported strict schemas, and
the Agent 05 evidence above. Expected output: one mounted delegate per command,
no reachable local durable writers, exact role projection, stable retry keys,
single-flight/error recovery, and honest report/refresh outcomes.

## Agent 03 mounted integration

Status: **completed locally** in runtime commit `fbf68044`.

Changed only the owned proposal action/page/form paths and direct tests:

- mounted inspection submission and RFI creation through exactly one strict
  `siteInspectionWorkflowService` command apiece, with exact duplicate-free
  FormData inventories, trusted route identities, central capability checks,
  strict result/scope checks, and one redacted structured outcome event;
- removed the two legacy local database/audit/SLA/notification mutation paths;
- retained HTML report archival only as best-effort post-commit work, returning
  an accessible repair warning without relabeling committed success; refresh
  failures are also committed success;
- added stable inspection/RFI retry keys, synchronous single-flight guards,
  failure input retention, thrown-error containment, honest replay/success
  copy, and success-only reset/rotation;
- projected both mutation forms only to Owner/Admin/Commercial while retaining
  the existing tenant-scoped history reads and read-only notices for the other
  ten roles; and
- added direct action, actual rendered field-inventory, accessibility/source
  contract, and all-role page tests.

Evidence: focused service + mounted tests 134/134 passed; Web ESLint passed;
root typecheck passed (5/5 tasks); Web production build passed with 89 static
pages; gitleaks 8.30.1 scanned 1,835 commits / ~46.33 MB with no leaks; diff
check passed apart from checkout line-ending notices.

The unchanged WO-12 verifier currently fails first with
`WO-12 invariant missing: no network mutation while offline` because it pins
the old button-disabled literal and still expects removed local action writers.
This is explicitly Agent 12 scope. Browser/IndexedDB/Storage/live PostgreSQL/
hosted/provider/deployment lanes remain **NOT RUN**; mounted form behavior is
covered by server-rendered inventory and source contracts because the focused
Vitest lane has no interactive DOM.

→ Handoff to Agent 12. Inputs: service implementation, runtime commit
`fbf68044`, 134/134 focused evidence, and the exact stale-verifier failure.
Expected output: harden WO-12 against field/control/authority drift and hostile
mutations, then independently verify the mounted service reachability,
transaction guarantees, roles, privacy, retry behavior, and honest archival
boundary.

## Agent 12 verification-contract change

Changed only the WO-12 verifier, its direct test, and the two existing tracking
documents. The verifier now parses the relevant TypeScript/TSX AST rather than
pinning formatting-sensitive literals or requiring obsolete action-local
writers. It covers exact role/control/field projection, server-bound identities,
recursive local writer reachability, imported/aliased/re-exported helpers,
strict result/log/outcome handling, stable retry/single-flight/draft behavior,
and both atomic service commands through authorization, locks, hashes, receipts,
effects, replay, and focused concurrency/failure evidence.

RED/GREEN and regression evidence:

- stale baseline: 0/1 passed; first failure was the obsolete offline-button
  literal and later assertions targeted removed local writers;
- final verifier: 45/45 passed twice (three authoritative/benign positives and
  42 hostile mutations; zero skipped/failed);
- focused service/actions/forms/page: 134/134 passed across five files;
- Node 22 syntax, direct verifier, and diff check: passed;
- reused unchanged current-head evidence: Web lint passed, root typecheck 5/5,
  Web build passed with 89 pages, and gitleaks 8.30.1 passed in Agent 03's lane.
  The current shell has no gitleaks executable, so a duplicate scan was not run.

No runtime, shared, schema, dependency, data, environment, deployment, or
functional-ledger file changed. No P0/P1/P2 finding remains in the verified
source contract. Real browser/IndexedDB/Storage and isolated live-PostgreSQL
atomicity remain outside this bounded verification and are explicitly NOT RUN.

## QA P2 — Design-roster-stable inspection replay

Runtime commit `9c34bc5f` fixes inspection replay incorrectly depending on the
current Design membership roster. The strict inspection receipt now stores only
the SHA-256 digest and count of the sorted, de-duplicated original recipient
UUIDs. Exact replay compares correlated persisted notification rows with that
committed digest/count instead of querying mutable current membership. Added,
removed, or reordered Design memberships therefore cannot invalidate a complete
historical submission; missing, extra, duplicate, or wrong persisted rows still
return `CONFLICT`. Zero-recipient submissions intentionally remain replayable.

TDD: RED was 65/69 passing with four expected failures; GREEN is 69/69 service
and 143/143 focused service/actions/forms/page. Web typecheck and focused runtime
ESLint pass; diff check passes. The direct test file remains repository-lint
ignored. No schema migration or dependency was added, and receipt privacy tests
prove no recipient UUID/email or existing prohibited payload/key fields are
stored.

The WO-12 verifier was intentionally not edited in this Agent 05 slice. It now
fails its old recipient-effect ordering assertion and must be updated by Agent
12 to require the digest/count and forbid replay against current membership.

## Agent 12 roster-replay verifier update

Verifier commit `54a60562` closes the QA P2 contract gap. The AST verifier now
requires strict original-recipient SHA-256/count receipt fields and construction,
forbids current Design-membership lookup during replay, and requires exact
unique persisted-notification hash/count validation. Its direct suite adds
bounded hostile mutations for receipt-field removal/weakening/leakage,
current-roster recomputation, persisted-row validation removal, add/remove/
reorder roster evidence, missing/extra/wrong rows, and zero-recipient replay.

Final evidence: verifier 61/61 passed twice (three authoritative/benign and 58
hostile); focused service/actions/forms/page 143/143; direct verifier, both Node
22 syntax checks, and diff check passed. The immediately preceding type/lint/
build/gitleaks evidence remains applicable because this change touches only the
verifier pair and documentation. No P0/P1/P2 remains in the verified source
contract; browser and isolated live-PostgreSQL lanes remain NOT RUN.

## QA P2 — fail closed on nullable persisted notification rows

The notification replay reader no longer erases correlated rows with nullable
recipient IDs. Its contract returns `Array<string | null>`, the Drizzle adapter
preserves the selected row cardinality, and replay validates every returned
value as a UUID before duplicate/count/hash checks. This closes the zero-original-
recipient case where one corrupt null-recipient row previously appeared to be a
valid empty set. Null, invalid, duplicate, missing, extra, and wrong rows now all
return `CONFLICT`; the exact tenant/correlation predicates and absence of a
current Design-roster join are unchanged.

TDD RED was 71/72; GREEN is 72/72 service and 146/146 focused service/mounted
compatibility. Web typecheck, focused service ESLint, and diff check pass. No
receipt-version, schema, dependency, mounted UI, verifier, database, browser,
environment, provider, or deployment change was made.

Agent 12 must update the WO-12 verifier to require nullable-row preservation in
the adapter and strict UUID-array validation before uniqueness/count/hash checks,
with hostile coverage for `flatMap`/truthy filtering, absent validation, and a
removed duplicate guard.

## Agent 12 nullable notification-row verifier

The WO-12 AST verifier now requires the nullable persisted-notification reader
contract, all six tenant/correlation predicates, no current user/Design-role join
or secondary query, and a direct cardinality-preserving map of every matched row.
Inspection replay must strictly parse the complete nullable array as UUIDs and
gate duplicate, receipt-count, and recipient-set-hash checks on successful parse.

The suite adds a benign local-alias positive plus mutations for non-nullability,
each missing correlation, current-roster join/requery, null-erasing `flatMap` or
truthy filtering, weakened/bypassed UUID validation, removed completeness checks,
and missing null/invalid/duplicate/extra/missing-row evidence. TDD baseline was
46/61; targeted RED was 0/1; final verifier is 77/77 twice (four positive, 73
hostile). Focused service/mounted compatibility is 146/146. Syntax, direct
verifier, and diff checks pass. No runtime/schema/UI/environment state changed;
browser and live PostgreSQL remain NOT RUN.
