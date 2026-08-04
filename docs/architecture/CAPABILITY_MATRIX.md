# Third Code ERP capability matrix

Status date: 2026-08-04
Source checkpoint: `ead237c028641af384283ec8498ef3c3cdbb92fe`
Scope: clean-room construction ERP capability planning and incremental delivery

This matrix is the product scope baseline. It describes business outcomes and
the current Third Code implementation; it is not a source, schema, UI, copy, or
test port from another product. Status is deliberately separated from hosted
release status so local capability work cannot be mistaken for production
authorization.

## Status vocabulary

- **Live**: the current application exposes the workflow end-to-end against the
  currently deployed schema.
- **Local**: source and tests exist, but the ordered hosted migration/release
  gates are not clear.
- **Adapter**: the existing Next.js path still owns the behavior while a closed
  NestJS authority seam exists for a future canary.
- **Planned**: scope is defined; no production mutation exists.
- **Gap**: a capability is intentionally outside the current source surface.

## Construction operating spine

| Outcome | Current source surface | Status | Authority boundary |
|---|---|---:|---|
| Qualify accounts, contacts, KYC, and opportunities | CRM routes, pipeline, account/KYC tables | Live | Next reads; server actions remain legacy authority |
| Turn a won opportunity into a project | Pipeline conversion and project tables | Live | Transactional server action with audit |
| Capture drawings, takeoffs, scope, BOM, and rate cards | BOM routes, CAD worker, evidence tables | Live | Python extracts evidence; official BOM remains server-owned |
| Compare suppliers and dispatch RFQs | RFQ routes, quote workflow, BullMQ/outbox | Live | Nest adapter plus durable outbox |
| Approve and issue Purchase Orders | PO creation and three-step workflow | Adapter | Nest route is closed by tenant flag; legacy path remains for unselected tenants |
| Confirm a supplier response to an issued PO | M3.28 Nest public route, M3.29 protected SCM session minting, M3.30 gated email-link reconstruction | Local | Public token authority, session scope/expiry checks, server transaction, explicit decision state |
| Schedule deliveries and prepare a site | Delivery routes and state machine | Local | Nest transition slices, tenant-scoped idempotency |
| Inspect and accept/reject delivery | Inspection routes and evidence | Local | Nest transition slices, audit and guarded status changes |
| Receive, transfer, consume, and count stock | Inventory control center and ledger schema | Local | PostgreSQL ledger constraints; Core posting/reversal slices |
| Control budget, commitments, claims, and cost-to-complete | Budget, cost-code, claim, and report routes | Local | Tenant-scoped accounting and project controls |
| Issue, reverse, cancel, and reconcile invoices | Receivables, journals, reconciliation routes | Local | Core finance slices reuse database invariants |
| Package turnover, sign, and continue warranty | Turnover, signature, warranty, and client portal routes | Adapter | M3.27 public signing authority is closed by default |
| Ask questions with cited company context | Cortex search, graph projection, citations | Live | Read-only, tenant/RBAC filtered; AI is advisory |

## Multi-business ERP expansion

| Capability family | Required outcome | Current state | Next proof |
|---|---|---|---|
| Parties and master data | One tenant-safe record for companies, people, vendors, items, accounts, and locations | Partial; construction-first tables exist | Normalize shared party/item conventions without breaking existing FKs |
| Source-to-pay | Request, compare, approve, issue, confirm, receive, match, pay, reverse | Procurement/payables plus closed supplier-confirmation source slices | Hosted parity and link-delivery proof |
| Project controls | Scope, baseline, schedule, progress, commitments, forecast, handoff | Construction spine is present | Reconcile project and financial dimensions across every write |
| Inventory | Perpetual quantity/value ledger, transfers, consumption, counts | Local source slices exist | Disposable Postgres/Redis posting and reversal proof |
| Receivables | Invoice, tax/retention, receipt, reconciliation, reversal | Local finance slices exist | Hosted parity and exact-cent integration canary |
| Compliance and audit | Tenant isolation, capability checks, immutable audit, evidence lineage | Implemented across current slices | Audit-chain recovery with owner-approved tenant input |
| People and work management | Role-aware tasks, approvals, workload, site cadence | Tasks and permissions exist | Keep HR/payroll out of the construction transaction path until discovery |
| Assets and maintenance | Track equipment, warranties, service history, and cost | Warranty is project/customer focused; asset register is a gap | Discovery only; no schema inferred yet |
| Service and customer success | Portal, issues, warranty, satisfaction, communications | Warranty portal and CNPS are live | Add supplier/customer response loops only after token threat model |
| Reporting and planning | Role-specific Today views, scheduled reports, exports, forecasts | Dashboard, reports, and Cortex context exist | Measure decision latency and data freshness before adding breadth |

## M3.28-M3.30 bounded scope: supplier confirmation

The next implementation slice is intentionally narrow:

1. Add a tenant-scoped supplier-confirmation session with a hashed,
   single-purpose token, expiry, revocation, and an explicit state machine:
   `pending -> accepted | declined | changes_requested`.
2. Add a durable replay ledger keyed by tenant and idempotency key. The replay
   result must include the session, Purchase Order, decision, and response time.
3. Add a closed-by-default NestJS public command. Tenant and Purchase Order
   scope come only from the locked session; the browser cannot submit tenant,
   vendor, status, or actor identifiers.
4. Commit the decision, response metadata, and nullable-actor semantic audit in
   one PostgreSQL transaction. A response never changes delivery, receipt, or
   payment state by itself.
5. At `scm_issue`, optionally mint one pending session using a deterministic
   HMAC-derived token, persist only its hash, associate the source workflow
   request, and put only the session UUID in the supplier outbox.
6. Keep the existing supplier email and Purchase Order UI behavior unchanged;
   link delivery is independently gated, verifies a pending unexpired session,
   and requires its own disposable replay, expiry, revocation, cross-tenant,
   rollback, provider, and spend gates.

Acceptance is source-level plus a closed Railway runtime seam until the
ordered hosted migration suffix is reconciled. The two source migrations and
route exist; all public and session-minting controls remain false, no Supabase
SQL or public link is active, and the existing notification retry path remains
unchanged.

## Release boundary

Current hosted Supabase is at 55 applied migrations while source contains 86.
The 31-migration suffix must be planned and applied in order as one reviewed
release. Duplicate Purchase Order data, the owner-approved audit-recovery
tenant, disposable database/Redis evidence, rollback, exact provider identity,
and spend controls remain independent gates. Vercel Git stays disconnected to
avoid duplicate or surprise builds. Railway readiness does not clear these
gates.

## Source-of-truth references

- [`REWORK_ALIGNMENT.md`](../REWORK_ALIGNMENT.md) — current construction
  workflow mapping.
- [`USER_STORY_INDEX.md`](../USER_STORY_INDEX.md) — route/action/schema index.
- [`ADR-009-clean-room-capability-expansion.md`](../adrs/ADR-009-clean-room-capability-expansion.md)
  — clean-room and incremental-slice decision.
- [`CURRENT_STATE.md`](./CURRENT_STATE.md) — verified runtime boundary.
- [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) — release-gated transaction slices.
