# Inventory and stock receipt foundation

## User outcome

Procurement can maintain Warehouses, prepare a receipt against an issued
Purchase Order, and see ordered, previously received, and remaining quantity.
Finance can post the reviewed receipt into an immutable quantity/value stock
ledger and balanced accounting journal.

## Invariants

- Quantities are exact integer micro-units; money is integer minor units.
- Each tracked Item has one base UOM.
- One Stock Receipt belongs to one tenant, Warehouse, Purchase Order, and
  optional accepted Delivery.
- Receipt lines agree with the Purchase Order line Item and UOM.
- Active posted receipts cannot exceed ordered quantity.
- Posting creates balanced Inventory / Goods Received Not Invoiced evidence.
- Reversal creates equal-and-opposite stock and journal evidence.
- Posted and reversed receipt evidence is immutable.
- Tenant-safe composite keys protect every cross-entity reference.
- Pre-ledger received quantities remain a preserved opening bridge and are not
  rewritten as fabricated Stock Receipts.

## Acceptance criteria

- Cross-tenant, inactive Warehouse, untracked Item, mismatched UOM, excessive
  quantity, wrong Purchase Order state, and unaccepted Delivery are rejected.
- Concurrent posting cannot over-receive a Purchase Order line.
- Viewer and unrelated roles cannot read inventory-sensitive Cortex nodes.
- RLS, audit, function ACL, clean reset, empty schema diff, and authenticated
  browser gates cover the new workflow.
