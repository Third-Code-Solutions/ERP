# Supplier Bill three-way match

## User outcome

Finance can build a Supplier Bill directly from available Purchase Order line
evidence. Inventory lines show the posted Stock Receipt, remaining quantity,
UOM, and unmatched value. Posting clears GRNI only after a transactional
recheck; the bill detail links back to the receipt.

## Invariants

- Every new bill line maps to its Purchase Order line.
- Inventory lines require an active posted Stock Receipt line and GRNI account.
- Non-inventory lines cannot cite Stock Receipt evidence.
- Quantity and value cannot exceed unconsumed receipt or PO-line evidence.
- Concurrent posting locks source rows and cannot double-consume evidence.
- Reversal preserves equal-and-opposite evidence and makes corrected rebilling
  possible.

## Acceptance criteria

- Mismatched tenant, Purchase Order, receipt, Item type, account, quantity, and
  value are rejected.
- Partial matching permits at most one cent of deterministic integer rounding.
- The bill screen displays PO/receipt evidence and links to the Stock Receipt.
- Clean reset, zero schema diff, catalog ACLs, runtime database tests, and
  authenticated browser journeys are mandatory release gates.
