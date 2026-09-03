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

## Agent 05 implementation

Status: **GO to Agent 03** with real PostgreSQL proof still blocked.

- Added `apps/web/src/server/crm/pprf-submission-service.ts` and focused tests
  in source commit `c59fcc70`.
- Added strict canonical-centavo/date intake and resubmission commands and a
  strict discriminated result/replay contract.
- Added one-transaction authorities that repeat current membership, tenant,
  and exact Owner/Admin/Sales capability checks before effects.
- Made intake Account/lead Opportunity/PPRF v1/two-track KYC/three audits/
  `pprf.review` SLA/exact `finance`-`owner`-`admin` notification rows atomic.
- Made existing-Opportunity locked version allocation/PPRF/KYC reset/receipt
  audit/SLA/exact `commercial`-`finance` notification rows atomic.
- Added schema-free tenant/full-hash advisory serialization plus a redacted
  semantic audit receipt, strict replayed ID/version validation, changed-command
  conflict, and fail-closed malformed/ambiguous receipt handling. Raw keys and
  raw contact/PPRF/notes values are absent from the receipt and service logs.
- Preserved repository SLA semantics: an existing matching open clock creates
  no row, absence creates one inside the transaction, and query/insert failure
  rolls back. A recipient role with no matching user is likewise a successful
  zero-row outcome; notification query/insert failure rolls back.
- Kept money as canonical strings/`BigInt` until the established bounded DB
  adapter, with exact weighted math and deterministic Philippine date handling.

Verification under pinned Node 22.23.2 and pnpm 10.33.0:

- PASS — focused service tests 42/42.
- PASS — service plus neighboring KYC/SLA/notification tests 54/54.
- PASS — full Web typecheck and lint.
- PASS — Web production build (Next.js 15.5.23; 89 static pages).
- PASS — diff checks.
- PASS — gitleaks 8.30.1 over 1,823 commits; no leaks.
- BLOCKED / NOT RUN — real PostgreSQL rollback/concurrency/trigger canary;
  no isolated opt-in URL was available and no database contact occurred.

→ Handoff to Agent 03. Use the exported singleton and strict schemas for one
service call per action. Bind tenant/user from the authenticated profile,
Opportunity from the route for resubmission, preserve a client-stable UUID,
validate returned tenant/kind/IDs/version, add redacted structured outcome logs,
and keep refresh/navigation success-only. Do not retain any local or
post-commit database/audit/KYC/SLA/notification fallback.

## Agent 03 mounted integration

Status: **implemented locally** in source commit `8bf06324`; ready for Agent 12
and WO-11 contract-owner verification.

- Replaced both mounted PPRF action writers with one strict authenticated call
  to the Agent 05 service and removed the intake's obsolete DB/KYC/audit/SLA/
  notification imports and path.
- Added exact duplicate-free FormData allowlists, exported-schema validation,
  canonical string/`BigInt` centavo conversion, server-bound resubmission
  Opportunity identity, strict service-result parsing/scope checks, and one
  redacted structured event per outcome.
- Preserved committed truth across cache/navigation failure through
  `success_refresh_failed`; precommit validation/auth/service failure performs
  no refresh or navigation.
- Added per-mount UUID keys, synchronous single-flight guards, failure input
  retention, accessible returned/rejected error feedback, honest replay
  messaging, and success-only navigation/refresh to both forms.
- Kept new intake at exact Owner/Admin/Sales access. Kept the detail route
  readable for all thirteen roles while projecting the form only to those
  three and an explicit read-only prior-version state to the other ten.
- Added action, form, and route tests covering 73 focused cases.

Verification under pinned Node 22.23.2:

- PASS — focused Agent 03 suite 73/73; service suite 42/42.
- PASS — full Web suite 1,525 passed with two opt-in integration skips.
- PASS — Web/root typecheck and lint; Web production build (89 static pages).
- PASS — diff checks and gitleaks over 1,824 commits; no leaks.
- FAIL — legacy WO-11 source contract 28/29: line 1810 still demands the
  removed local action writer. This is a contract-owner update, not an
  application regression.
- BLOCKED / NOT RUN — isolated real PostgreSQL and authenticated browser lanes.
- NOT RUN — hosted/demo mutation, providers, schema/data/env/deploy, or remote.

→ Handoff to Agent 12 / WO-11 contract owner. Follow the mounted actions into
the new service, assert one-call/no-fallback and hostile-entry/redacted-log/
committed-refresh behavior, and replace the obsolete local-writer source
assertions before the independent isolated QA lanes.

## Agent 12 contract-owner closeout

Contract commit `801ad89b` updates the WO-11 verifier from the obsolete local
intake-writer assertion to the approved mounted service boundary for both
intake and resubmission. It adds reachable named import/reexport and simple
alias analysis; exact one-delegate/no-fallback checks; service-side authority,
transaction, lock, receipt, atomic-effect, recipient, exact-money, and date
checks; mounted route/control/result/log/recovery checks; and 43 PPRF hostile
mutations. The complete mutation suite now covers 66 hostile mutations and
accepts benign formatting and service aliases.

Verification under Node 22.23.2 and repository-selected pnpm 10.33.0:

- PASS — WO-11 authoritative/mutation suite 53/53 twice.
- PASS — mounted Web action/form/page suite 73/73 and service suite 42/42.
- PASS — root typecheck, zero-warning source lint, production build (89 Web
  pages), verifier syntax, diff checks, and gitleaks 8.30.1 over 1,828 commits.
- P2 — current receipt writes are bounded and privacy-checked, but the runtime
  receipt reader uses `.passthrough()` and therefore does not fail closed on
  unexpected historical receipt keys. Known fields only are consumed/returned;
  no present leak was found. Runtime source was outside this changeset's scope.
- BOUNDED — static analysis does not cover reflection, computed/default/
  namespace dynamic dispatch, tagged/raw SQL, or arbitrary callback execution;
  transaction-double tests are not real PostgreSQL proof.
- BLOCKED / NOT RUN — authenticated browser and explicitly isolated PostgreSQL
  rollback/concurrency/trigger checks. No browser or database mutation occurred.

Status: **GO to independent QA**, with no in-scope P0/P1 finding and the P2
receipt-reader strictness follow-up explicitly recorded.
