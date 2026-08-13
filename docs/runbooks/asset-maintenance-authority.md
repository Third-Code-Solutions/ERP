# Asset maintenance authority runbook

## Safety defaults

Keep these values disabled and empty:

- `ERP_ASSET_MAINTENANCE_READS_ENABLED=false`
- `ERP_ASSET_MAINTENANCE_READS_TENANT_IDS=`
- `ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED=false`
- `ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS=`

The Web compatibility path remains active for unselected tenants. Never enable
the Core path from a browser or by broadening a UUID list to `*`.

## Promotion gates

Before selecting a demo tenant, obtain hosted migration parity, owner-approved
duplicate-data mapping, a valid audit-recovery tenant, Railway/Vercel
readiness and exact-SHA evidence, protected browser proof, and a rollback
snapshot. Confirm billing approval for one controlled action.

After selection, exercise create, replay, idempotency-key conflict, invalid
asset scope, RBAC denial, cross-tenant concealment, history read, audit rows,
and rollback. Selected Core errors must fail closed; never retry through a
second writer. Revert the selector and flags if any gate fails.
