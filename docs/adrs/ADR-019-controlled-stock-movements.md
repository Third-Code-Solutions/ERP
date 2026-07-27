# ADR-019: Stock movement is immutable operational and financial evidence

- Status: Accepted
- Date: 2026-07-27

Stock Receipts prove procurement intake. They do not represent internal
transfer, project consumption, or a counted adjustment. Third Code ERP models
those events as separate Stock Movements so warehouse history never overloads
or rewrites receipt evidence.

A Stock Movement is a draft header with one or more Item/UOM lines. Posting
freezes the document, assigns a tenant-sequential number, and writes
append-only Stock Ledger Entries. Reversal writes equal-opposite entries and
never deletes the original movement.

Movement types have distinct invariants:

- `transfer` requires different active source and target Warehouses. Each line
  writes equal-value transfer-out and transfer-in entries. No general-ledger
  journal is required because total Inventory value is unchanged.
- `consumption` requires an active source Warehouse, Project, and Cost Code.
  It relieves Inventory at the source weighted-average cost and posts the same
  value to the configured Inventory Consumption expense account.
- `adjustment` requires an active Warehouse and a signed counted difference.
  Negative adjustments use current weighted-average cost. Positive
  adjustments require an evidenced unit cost. The financial offset posts to
  configured Inventory Adjustment Gain or Loss accounts.

Source availability and valuation are recomputed under serialized warehouse
and Item locks. Negative stock is rejected. Every movement date must belong to
an open Fiscal Period, including transfers, so closed operational history
cannot be backdated.

Reversal is the only correction path. Journal reversal is bound to the Stock
Movement workflow; direct generic reversal is rejected.
