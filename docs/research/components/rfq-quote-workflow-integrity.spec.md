# RFQ Quote Workflow Integrity Specification

## Scope

- Preserve public action signatures:
  - `logQuote(FormData): Promise<{ error?: string }>`
  - `completeRfq(rfqId): Promise<{ error?: string }>`
  - `cancelRfq(rfqId, reason): Promise<{ error?: string }>`
- Preserve current RFQ page layout, visible labels, success copy, and role
  capability `rfq.dispatch`.
- Move quote and terminal-state authority into a server-only transaction
  service. This remains an incremental Next.js compatibility boundary pending
  later NestJS migration.
- Do not deploy the frontend or reconnect Vercel Git.

## Verified Current Defects

1. Quote insert, first-quote status update, and audit are separate commits.
2. Complete/cancel status update and audit are separate commits.
3. RFQ status updates predicate only on `id` after an earlier tenant read.
4. Vendor and material identifiers are accepted without same-tenant
   validation; database foreign keys are single-column.
5. Completion trusts a client-page coverage calculation and permits
   `pending -> completed` when called directly.
6. Queue/browser retries can insert the same quote twice.
7. Completion notification runs inline after commit; delivery failure makes a
   successful state transition look failed.
8. RFQ line JSON has no durable source-line identifier. Creation derives
   `material_item_id` only from contracted rate cards, then excludes those
   lines, leaving residual lines without a matchable quote key. Completion can
   remain permanently disabled.
9. Cancellation reason, note, validity timestamp, money, and lead-time bounds
   are weaker than official transaction inputs require.

Hosted preflight on 2026-07-30: zero RFQs, zero quotes, zero exact duplicate
groups, and zero cross-tenant RFQ/vendor/material/actor references.

## Canonical Line Identity

- Every newly created RFQ line stores its source `bom_line_item_id`.
- Every new quote requires that line identifier.
- Transaction service derives `material_item_id` from the locked RFQ line;
  browser input cannot choose a different material.
- Quote coverage matches `bom_line_item_id` first. Legacy material/code
  fallback remains presentation-only for older rows.
- Database stores nullable `bom_line_item_id` for safe legacy compatibility,
  but the current action requires it.

## State Machine

Allowed transitions:

- `pending -> quotes_received`: first committed quote only.
- `pending -> cancelled`: authorized cancellation.
- `quotes_received -> quotes_received`: additional quote.
- `quotes_received -> completed`: only when every RFQ line has a quote.
- `quotes_received -> cancelled`: authorized cancellation.
- `completed` and `cancelled`: terminal.

Same-state non-status updates remain allowed. PostgreSQL rejects every other
status transition, including `pending -> completed` and reopening a terminal
RFQ.

## Quote Transaction

Input:

- tenant and actor from authenticated profile;
- UUID RFQ, BOM-line, vendor, and submission identifiers;
- exact integer centavos within JavaScript safe-integer range;
- optional bounded non-negative lead time;
- optional valid ISO timestamp;
- optional trimmed bounded note.

One database transaction:

1. Lock exact `(tenant_id, rfq_id)` row.
2. Check `(tenant_id, submission_id)` for a prior quote.
3. Exact replay returns existing quote without another insert, status update,
   audit, or notification.
4. Reused submission ID with different content returns conflict.
5. Reject terminal RFQ.
6. Resolve selected line only from locked RFQ JSON.
7. Validate vendor and derived material against same tenant.
8. Insert quote with stable line identity and idempotency key.
9. On first quote, transition `pending -> quotes_received`.
10. Write quote audit. If status changed, write RFQ status audit.
11. Commit together or roll back together.

## Complete/Cancel Transaction

One database transaction:

1. Lock exact tenant RFQ.
2. Re-evaluate current state after lock.
3. Complete: require `quotes_received` and full stable-line coverage.
4. Cancel: require `pending` or `quotes_received` and bounded reason.
5. Update with both tenant and RFQ predicates.
6. Write status audit in same transaction.

Terminal replay returns the existing compatibility error and creates no new
audit. Completion notification runs after commit, is caught separately, and
cannot roll back or misreport the committed transaction.

## Database Invariants

- Unique `(tenant_id, id)` parent key on RFQs.
- Unique `(tenant_id, submission_id)` quote idempotency key.
- Tenant-composite quote references to RFQ, vendor, material, and BOM line.
- RFQ delete cascades quotes.
- Vendor, material, and BOM-line deletion is restricted while official quote
  evidence references them.
- Authenticated and anonymous browser roles retain no direct quote/RFQ write
  privilege.
- Trigger-enforced RFQ state machine.

## Error Compatibility

- Preserve existing permission, not-found, terminal, and required-reason
  messages where behavior remains valid.
- New bounded errors:
  - invalid quote form field;
  - selected RFQ line unavailable;
  - vendor/material unavailable;
  - quote submission conflict;
  - quote coverage incomplete;
  - cancellation reason too long.
- Unexpected transaction failures return a generic retry message and do not
  leak database details.

## Validation

- Action-wrapper tests: permission, validated forwarding, compatibility
  errors, cache refresh, notification failure.
- Service tests: tenant lock, exact replay, conflict, vendor/material checks,
  first-quote double audit, rollback on audit failure, complete coverage,
  terminal concurrency behavior, cancellation.
- Component tests: one submission UUID reused after failure and rotated after
  success; stable line ID forwarded; visible layout/copy unchanged.
- Drizzle/migration contract tests: columns, unique key, composite references,
  state trigger, browser-write denial retained.
- Disposable PostgreSQL 17/Redis lane: all migrations, cross-tenant reference
  rejection, duplicate submission rejection, invalid state rejection, and
  rollback-only probes.
- Full lint, typecheck, unit/integration tests, production build, secret scan,
  workflow checks, prohibited-source scan, hosted migration parity, Railway
  readiness, Git refs, and zero new Vercel deployments.

## Rollback

- Application rollback: revert source commit.
- Applied database integrity migrations remain forward-only.
- Correct database behavior only with a new reviewed migration; never edit or
  remove applied migration history.
