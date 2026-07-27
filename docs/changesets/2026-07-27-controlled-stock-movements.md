# Controlled stock movements

## User outcome

Inventory and site teams can transfer stock, consume stock against a Project
and Cost Code, or record an evidenced count adjustment. The workspace shows
draft, posted, and reversed documents without hiding the original event.

## Invariants

- Stock Ledger Entries remain append-only.
- Transfer-out and transfer-in quantity/value are equal and opposite.
- Consumption and negative adjustment cannot create negative stock.
- Posted value is derived from current warehouse weighted-average cost except
  for a positive adjustment, which requires an evidenced unit cost.
- Consumption and adjustment journals are balanced and period-controlled.
- Posted documents and their lines are immutable.
- Reversal preserves the original and writes equal-opposite stock and
  financial evidence.

## Acceptance criteria

- Cross-tenant Item, UOM, Warehouse, Project, and Cost Code references fail.
- Same-Warehouse transfers, missing consumption dimensions, zero adjustment,
  closed-period posting, and insufficient stock fail.
- Concurrent posting decisions serialize by Warehouse and Item.
- RLS, function ACLs, audit, Cortex, clean reset, zero schema diff, runtime
  proof, and authenticated browser journeys are release gates.
