# Remaining roadmap features — changeset

Date: 2026-09-22
Branch: `agent-04/roadmap-finance-procurement`
Base: `origin/main` (`1f2eb44a1763b281b79ec8d142e59779152aa874`)

## Implemented

- Additive tenant-scoped schema, Drizzle models, RLS/grants, indexes, and
  append-only evidence for requisitions, workflow transitions, reservations,
  landed-cost allocations, price lists, currencies/rates, tax profiles and
  statutory outputs, fiscal close runs, SAP outbox attempts, provider delivery
  outbox attempts, and guarded workflow replay.
- Requisition workflow: create → submit → approve/reject/cancel → selected
  quote → draft purchase order, with exact integer totals and a procurement
  trace read that joins PO, receipts, supplier bills, and supplier-bill cash
  allocations.
- Stock reservations: advisory-lock protected availability checks,
  release/consume/expire events, expiry-aware available quantity, and replay
  keys.
- Landed cost: posted-receipt-only, deterministic quantity/value allocation,
  exact cent remainder handling, append-only inventory-value ledger entries,
  and bounded idempotency that does not alter the user-facing document number.
- Effective-dated quantity-tier price lists with deterministic resolution and
  stale-price signalling, idempotent activation/retirement evidence.
- Tenant currency configuration, exact minor-unit conversion, effective-dated
  exchange rates, and inverse-rate reconciliation when both directions exist.
- Configurable Philippine tax profiles with VAT, withholding, retention,
  effective dates, activation/retirement workflow, deterministic statutory
  output hashes, and audit events.
- Period-close evidence now includes draft journals, unposted receipts/bills/
  cash, unreconciled bank statements, active reservations, pending SAP posts,
  and pending provider deliveries.
- Real Resend email, Semaphore SMS, and generic SAP HTTP adapters behind
  server-only credentials, tenant flags, durable retries, response validation,
  attempt evidence, and dead-letter states.
- Guarded Roadmap Operations hub with loading/error states and role-aware
  navigation. Existing routes and existing compatibility paths remain the
  default while roadmap flags are closed.

## Verification

- PASS — shared roadmap contracts/unit tests (`7/7`).
- PASS — roadmap migration/API route static contract test (`4/4`).
- PASS — provider/SAP adapter unit tests (`4/4`) with mocked HTTP responses.
- PASS — shared-types typecheck.
- PASS — database package typecheck.
- PASS — API package typecheck.
- PASS — web package typecheck.
- PASS — API production build.
- PASS — web production build (113 routes generated).
- PASS — API lint.
- PASS — web lint.
- PASS — repository lint.
- NOT AVAILABLE — shared-types/database lint scripts do not exist in the
  current packages.
- NOT RUN — live Supabase migration replay/RLS isolation against a disposable
  database; no database target was authorized/configured for this branch.
- NOT RUN — live Resend, Semaphore, or SAP delivery; credentials and external
  endpoints remain intentionally unconfigured.
- NOT RUN — all-role browser E2E and production verification; this branch is
  an additive implementation branch and was not deployed.
- BLOCKED — full API Vitest suite did not produce a completion result in the
  available run window and was interrupted; no failure was attributed to the
  roadmap slice from that run.

## Rollout boundaries

Roadmap commands are fail-closed unless the corresponding tenant feature row
is explicitly enabled. Worker scheduler flags default to `false`. Existing
purchase-order, inventory, accounting, and notification behavior is not
switched over by this changeset. SAP field mapping, statutory/legal approval,
provider credentials, hosted migration replay, and production canaries remain
follow-up release work.
