# ADR-016: Inventory receipts use an immutable perpetual stock ledger

- Status: Accepted
- Date: 2026-07-27

Third Code ERP keeps delivery logistics, accepted stock, and financial posting
as related but distinct evidence. A delivery schedule says when goods moved and
whether site inspection accepted them. A Stock Receipt says which Purchase
Order lines and quantities entered which Warehouse. A Stock Ledger Entry is
the immutable quantity-and-value consequence of posting that receipt.

Quantities use integer micro-units. One whole UOM equals 1,000,000
micro-units. This preserves exact fractional quantities without floating-point
rounding. Money remains integer minor units.

One Warehouse belongs to one tenant and may optionally belong to one project.
Every tracked Item has one base UOM. A Stock Receipt belongs to one issued
Purchase Order, one active Warehouse, and optionally one accepted Delivery.
Every line must reference the same Purchase Order line, Item, and UOM.
Previously posted and unreversed receipt quantities cannot exceed the ordered
quantity. Receiving fields that predate this ledger remain a preserved opening
bridge; the migration does not fabricate historical Stock Receipts.

Posting locks the receipt, Purchase Order lines, and prior receipt evidence in
a stable order. It creates immutable Stock Ledger Entries and a balanced
journal: debit Inventory and credit Goods Received Not Invoiced. Reversal
creates equal-and-opposite stock and journal evidence. Posted evidence is
never edited or deleted.

Supplier Bill three-way matching consumes active receipt evidence under
ADR-017.
