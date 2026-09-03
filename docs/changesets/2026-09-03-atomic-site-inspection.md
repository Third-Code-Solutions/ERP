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
