# Atomic PPRF submission planning

## Status

PLANNED — sequential implementation has not started.

## Product decision

Defined one bounded WO-11/A-01 repair covering both PPRF intake and existing-
Opportunity submission because both currently commit their domain/KYC/audit
transaction before required legacy SLA and in-app notification effects.

- Submit authority remains exactly Owner, Admin, and Sales.
- `/crm/opportunities/new/pprf` remains an exact-three route.
- `/crm/opportunities/[id]/proposal/pprf` remains tenant-scoped readable for all
  thirteen roles; the other ten roles receive a read-only view with no submit
  form/control.
- Current recipient sets remain verbatim: intake targets
  `finance`/`owner`/`admin`; existing-Opportunity submission targets
  `commercial`/`finance`.
- Recipient taxonomy redesign is marked **NEEDS DECISION** and excluded.
- Current domain semantics remain intact, including the intake's `lead`
  Opportunity and resubmission's next version plus two-track KYC reset.

## Delivery boundary

Agent 05 first owns a new
`apps/web/src/server/crm/pprf-submission-service.ts`, its tests, and only the
minimum transaction-aware database-helper changes required to place Account,
Opportunity, PPRF, KYC, semantic audits/receipt, legacy `pprf.review` SLA, and
in-app notification rows in one transaction.

Durable no-schema idempotency uses a server-rendered/client-stable submission
UUID, tenant plus full-key-hash advisory serialization, and a redacted semantic
PPRF audit receipt containing a canonical command hash and strict persisted
IDs/version. The advisory 64-bit hash is serialization only; identity is checked
with the full SHA-256 hashes. Raw keys and client/contact/PPRF/notes payloads are
excluded from receipts and structured logs. Same-key replay, changed-command
conflict, response-loss recovery, tenant isolation, and concurrency must be
proved or the slice blocks before Web work.

Money remains canonical centavo strings and `BigInt` through exact arithmetic,
with only a bounded final database-number adapter. Dates use strict calendar
validation and deterministic explicit-offset Philippine adaptation.

Agent 03 then owns both PPRF action files, both pages, and both form components.
Actions delegate once to the service, validate strict result identity, emit one
redacted structured outcome, and perform no durable write after service commit.
Genuine failure retains form data and retry identity. Revalidation/navigation
is success-only; refresh failure after commit returns truthful committed success
and logs `success_refresh_failed`.

Agent 12 follows with mounted-entry and hostile-mutation verification, then
independent QA/browser/PostgreSQL verification runs only in isolated lanes.

## Known boundaries

- No Core API or schema is part of this smallest repair unless later repository
  evidence proves the documented service cannot meet the contract; such a
  finding is a blocker, not implicit scope expansion.
- The generic database audit trigger may record full row images/diffs containing
  existing domain payload. That pre-existing behavior is distinct from the
  required redacted semantic receipt and is out of scope.
- Current PPRF notifications are in-app only; no email/provider side effect is
  part of either call.
- Real PostgreSQL rollback/concurrency/trigger proof requires an explicitly
  isolated database binding and opt-in. Authenticated browser proof requires a
  secure isolated reusable session; Estimator and PM identities are currently
  missing. Both lanes remain blocked until those prerequisites exist.
- No app source, functional ledger, Core/API/shared contract, schema,
  dependency, data, environment, provider, or deployment file changed in this
  planning commit.

## Verification

- PASS — Agent 01 re-read the applicable repository instructions and PRD
  WO-11/A-01/SLA/audit/exact-money rules.
- PASS — source inspection confirmed both mounted post-commit failure
  boundaries, exact central role grants, route read policy, recipient arrays,
  current in-app-only behavior, version/KYC semantics, and available semantic
  audit receipt pattern.
- PASS — documentation-only scope and sequential ownership recorded in
  `docs/handoffs/2026-09-03-atomic-pprf-submission.md`.
- NOT RUN — product tests, PostgreSQL, browser, provider, and hosted mutation;
  this is a documentation-only planning changeset.

→ Handoff to Agent 05. Expected output: green atomic service/transaction
tests and either a conventional source commit plus Agent 03 contract, or a
precise blocker if schema-free durable replay cannot be proved safely.
