# Remaining roadmap features — implementation plan

Date: 2026-09-22
Branch: `agent-04/roadmap-finance-procurement`

## Objective

Implement the non-release-blocking roadmap capabilities as additive vertical
slices without changing existing purchase-order, inventory-ledger, accounting,
tenant-isolation, or notification behavior. New production paths remain dark
until their migrations, API contracts, tests, and browser journeys are green.

## Guardrails

- Keep all monetary values in integer minor units and all quantities in integer
  micro-units. Exchange rates and tax rates are versioned integers with an
  explicit scale; no floating point enters a persisted or posted amount.
- Every table is tenant-scoped, has composite tenant foreign keys where a
  cross-entity reference exists, enables/forces RLS, and has an isolation test.
- Every mutation is idempotent, audited, and rejects closed fiscal periods.
- SAP and real messaging providers are adapter/outbox integrations. Missing
  provider credentials or disabled flags fail closed to a durable retry state;
  tests use fakes and never send external traffic.
- Existing routes remain unchanged. New routes are additive and include
  loading/error/empty states and role-aware navigation.

## Vertical slices and acceptance criteria

### Slice A — requisition to payment procurement

1. Add requisitions and requisition lines linked to project, BOM line, cost
   code, item/UOM, requested quantity, need-by date, and requester.
2. Add requisition approval events and RFQ/quote comparison links. A selected
   quote can create a draft PO without copying free-text totals from the client.
3. Add line-level PO, receipt, bill, and payment evidence references so the
   lifecycle is queryable as one trace, while existing PO and three-way-match
   rules remain authoritative.
4. Provide protected list/detail/create/approve/compare routes and API
   commands with pagination, structured errors, audit events, and replay keys.

Acceptance: a tenant-scoped test can create → approve → compare → select →
draft PO → receive → bill → allocate payment; duplicate commands replay without
duplicate rows; another tenant cannot read or mutate any evidence.

### Slice B — stock reservations and landed cost

1. Reserve available warehouse quantity against project/cost code/PO line with
   row/advisory locks; available quantity is on-hand less active reservations.
2. Release, consume, and expire reservations with append-only events. Negative
   available stock and cross-tenant references are rejected.
3. Capture freight, duty, insurance, and other landed-cost documents against a
   posted receipt. Allocate integer cents by quantity/value/weight basis with a
   deterministic remainder rule and attach the allocation to receipt lines.
4. Revalue inventory through explicit ledger evidence; never update a posted
   receipt or ledger entry.

Acceptance: concurrent reservation tests never oversubscribe, release is
idempotent, landed-cost allocation sums exactly to the source amount, and
reversal leaves an auditable equal/opposite trail.

### Slice C — price lists, taxes, and currencies

1. Add effective-dated price lists/items with vendor, item, UOM, currency,
   minimum quantity, and source/provenance. Quote selection resolves the best
   valid price deterministically and flags stale prices.
2. Add tenant currency configuration and effective-dated exchange rates with
   inverse-rate validation, source, and approval metadata. Store document and
   base amounts plus the exact rate snapshot used.
3. Add configurable PH tax/statutory profiles (VAT, withholding, retention,
   exemptions, BIR output template/version) with effective dates and audit.
   Existing 12%/2% behavior is preserved as the default profile, not a hidden
   constant. Outputs are generated as deterministic structured records and
   exportable files, with provider/legal review still explicit.

Acceptance: price/rate/tax resolution is deterministic at a date, historical
documents retain their snapshots, rounding reconciles exactly, and no rate can
be edited after a posted document uses it.

### Slice D — period close and SAP posting

1. Add close checklist/lock evidence around existing fiscal periods: open items,
   inventory reservations, unmatched receipts/bills, reconciliation, and
   provider outbox states are visible before close.
2. Add SAP posting outbox with typed GR/IR/CO payloads, idempotency key,
   attempt/backoff/dead-letter state, response evidence, and a no-credential
   fail-closed adapter. SAP remains an interface; BUILD OPS remains project
   financial truth and never pretends a post succeeded.
3. Add protected finance operations routes and replay-safe commands.

Acceptance: a period cannot close while configured blocking checks fail; close
is idempotent and immutable after success; SAP retries are bounded, responses
are schema-validated, and disabled/missing credentials never cause silent loss.

### Slice E — real provider delivery

1. Extend the existing notification outbox with provider configuration,
   template/version, destination normalization, retry policy, and provider
   delivery evidence. Support Resend email and Semaphore SMS adapters behind
   explicit feature flags and environment-only credentials.
2. Keep the current no-key behavior as durable `pending`/`dead_letter` evidence,
   not a fake `delivered` result. Provider responses are validated before
   persistence and never expose secrets.

Acceptance: fake-provider tests cover success, timeout, malformed response,
   duplicate idempotency key, bounded retries, and dead-letter recovery; a live
   send is never attempted by local or CI tests.

## Verification checkpoints

1. Schema lint and migration contract tests before API work.
2. API unit/integration tests plus RLS isolation for each slice.
3. Web typecheck/lint/build and protected browser journeys for each new route.
4. Full repository tests, security scans, migration replay and E2E demo-role
   matrix before merge. Provider/SAP live verification remains `NOT RUN` unless
   exact non-production credentials and target are configured.

## Explicit non-blockers

Missing ABI delegation bands, SAP module mapping, statutory/legal approval of
tax templates, and provider credentials are represented as configuration or
closed feature flags. They must not block local implementation or existing
production releases, and they must not be guessed as production facts.
