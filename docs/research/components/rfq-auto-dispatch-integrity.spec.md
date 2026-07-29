# RFQ Auto-Dispatch Integrity Specification

Status: implementation contract.

## Problem

The existing BOM-to-RFQ path has four coupled integrity failures:

1. a browser-callable Server Action accepts a caller-supplied tenant as
   "system" authority;
2. system audit uses a fabricated zero UUID;
3. RFQ creation and audit are separate commits;
4. the producer emits `bom/approved`, while the RFQ consumer listens only for
   `bom/internal_approved`.

Inngest retries can also create duplicate RFQs and notifications because the
database has no one-result-per-BOM constraint.

## Compatibility contract

- Keep the manual Server Action name and success/error shape:
  `{ rfqId } | { error }`.
- Keep manual `rfq.dispatch` permission enforcement.
- Keep the existing RFQ list/detail UI, status, line-item JSON shape, email
  template, and routes unchanged.
- Continue accepting the historical `bom/internal_approved` event while also
  consuming the currently emitted `bom/approved` event.
- Notification delivery remains after the official database commit.

## Authority and transaction contract

1. The exported Server Action accepts only `bomId`. It never accepts tenant,
   actor, role, or system mode from the browser.
2. Manual tenant and actor come from the verified user profile.
3. The internal event handler passes its database-origin tenant and the
   verified initiating actor when present. Historical events without an actor
   use `null`, never a fabricated user.
4. A supplied initiating actor is revalidated against the same tenant inside
   the transaction. Missing, stale, or cross-tenant actors become `null`.
5. One PostgreSQL transaction:
   - locks the tenant-scoped BOM;
   - returns the existing tenant/BOM RFQ on retry;
   - reads tenant-scoped BOM lines and rate cards;
   - inserts the RFQ; and
   - appends its audit row through the same transaction.
6. Audit failure rolls back RFQ creation.
7. A unique `(tenant_id, bom_id)` index is the final concurrent-retry guard.
8. A composite RFQ-to-BOM foreign key prevents cross-tenant parent linkage.
9. Browser roles have no INSERT, UPDATE, or DELETE privilege or policy for
   RFQs and supplier quotes. Authenticated users retain tenant-scoped reads;
   trusted server connections retain workflow authority.

## Queue and notification contract

- RFQ creation is one named Inngest step.
- Notification is a second named step and runs only when that invocation
  created the RFQ.
- A replay returns the original RFQ without another insert, audit, or
  notification.
- Infrastructure failure rejects the Inngest step so its configured retry
  policy remains authoritative.
- Expected business outcomes such as no residual lines are reported as
  skipped, not retried.

## Required evidence

- Focused tests prove caller-supplied system options cannot bypass auth.
- Focused tests prove tenant predicates, row locking, atomic audit, nullable
  actor, event compatibility, and retry behavior.
- Migration-contract tests prove the unique index and composite foreign key.
- Hosted privilege evidence proves `anon` has no RFQ access and
  `authenticated` has SELECT only.
- Full lint, typecheck, application tests, production build, migration replay,
  secret scan, workflow validation, and prohibited-source scan pass.
- Hosted migration is applied only after duplicate preflight returns zero.
- Source push creates no Vercel deployment.

## Rollback

- Application rollback: revert the source commit. Existing RFQ rows remain
  compatible.
- Database rollback is forward-only: if multiple RFQs per BOM are later
  intentionally required, first introduce an explicit sourcing-round key,
  backfill it, replace the uniqueness constraint, and update callers. Do not
  drop tenant integrity constraints as an incident shortcut.
