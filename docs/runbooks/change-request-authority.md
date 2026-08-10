# Change Request authority runbook

## Safety defaults

Keep these values disabled and empty:

- `ERP_CHANGE_REQUEST_WRITES_ENABLED=false`
- `ERP_CHANGE_REQUEST_WRITES_TENANT_IDS=`
- `ERP_CHANGE_REQUEST_WRITES_VIA_API=false`
- `ERP_CHANGE_REQUEST_WRITES_VIA_API_TENANT_IDS=`

The Web compatibility path remains active for unselected tenants. Never enable
the Core path from a browser or by broadening the UUID list to `*`.

## Promotion gates

Before a designated demo tenant is selected, obtain a clear hosted migration
parity plan, owner-approved duplicate-data mapping, valid audit-recovery tenant,
Railway/Vercel readiness and exact-SHA evidence, protected browser proof, and
rollback snapshot. Confirm billing approval for one controlled action.

After selection, exercise create, replay, idempotency-key conflict, invalid
design-file scope, RBAC denial, cross-tenant concealment, notification/audit
rows, and rollback. Selected Core errors must fail closed; never retry through
the direct writer. Revert the selector and flag if any gate fails.
