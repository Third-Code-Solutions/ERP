# Stock Receipt authority runbook

## Safety defaults

Keep these values disabled and empty:

- `ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED=false`
- `ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS=`

Web compatibility remains active for unselected tenants. Never enable Core
receipt creation from a browser or broaden tenant UUID lists to `*`.

## Promotion gates

Before selecting a demo tenant, obtain hosted migration parity, owner-approved
duplicate-data mapping, valid audit-recovery tenant, Railway/Vercel readiness
and exact-SHA evidence, protected browser proof, rollback snapshot, and billing
approval for one controlled action.

After selection, exercise draft creation, replay, idempotency-key conflict,
invalid PO/material/UOM/warehouse scope, RBAC denial, cross-tenant concealment,
receipt-line totals, audit rows, and rollback. Selected Core errors must fail
closed; never retry through a second writer. Revert selector and flag if any
gate fails.

## RLS note

`stock_receipt_create_requests` has RLS enabled and browser table privileges
revoked. Current source migration does not force RLS. Do not claim force-RLS
until a separate migration and zero-skip parity evidence exist.
