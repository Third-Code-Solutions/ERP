# M3.8 Stock Receipt core handoff

## Summary

Stock Receipt creation now has an incremental Next-to-Nest authority seam.
It is closed by default and selected only for an explicitly allowlisted tenant.

## Changed

- Next posts the strict shared Stock Receipt command to
  `POST /v1/inventory/stock-receipts` with `Idempotency-Key` and request
  correlation headers.
- The selected path validates the Nest result, revalidates inventory pages,
  and never falls back to the legacy direct write on rejection or outage.
- The receipt form keeps one opaque retry key across transient failures and
  resets it after a successful commit. Visible UI and copy are unchanged.
- Added environment documentation plus gate/action/client tests.

## Release boundary

No database migration or hosted mutation is included. Keep
`ERP_INVENTORY_RECEIPT_CREATE_VIA_API=false` and
`ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS` empty until the hosted planner clears
its migration, duplicate-PO, audit-recovery, demo-tenant, readiness, and
rollback gates.

## Evidence

Focused 31/31 tests, full Web 58 files / 348 tests, workspace lint, Web
typecheck, diff check, and production build 78/78 routes passed locally.
