# ADR-017: Supplier Bills post from line-level three-way evidence

- Status: Accepted
- Date: 2026-07-27

A Purchase Order is commitment evidence. A posted Stock Receipt is accepted
quantity/value evidence. A Supplier Bill is a Vendor demand. Third Code ERP
links these at line level before tracked inventory can become a payable.

Every new Supplier Bill line references one line on the same Purchase Order.
If that PO line is inventory-tracked, it also references one active posted
Stock Receipt line, records the matched integer micro-unit quantity, and uses
the active Goods Received Not Invoiced control account. Non-inventory lines
cannot cite Stock Receipt evidence and remain restricted to active asset or
expense accounts.

Draft save validates the evidence. Posting is authoritative: it locks the PO
line, Stock Receipt line, and receipt; rechecks Vendor, project, states,
unmatched quantity/value, accounts, and fiscal period; then posts the balanced
journal. Concurrent bills cannot consume the same receipt quantity twice.
Partial values must match receipt unit cost within one cent, solely to absorb
integer minor-unit rounding.

Tracked receipt billing debits Goods Received Not Invoiced and credits Accounts
Payable, with separate Input VAT and withholding control lines when applicable.
Reversing the Supplier Bill creates equal-and-opposite financial evidence and
releases its receipt match for corrected rebilling. Source documents are not
edited or deleted.
