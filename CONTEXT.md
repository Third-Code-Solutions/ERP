# Third Code ERP

Third Code ERP is a tenant-isolated operating system for construction and
adjacent businesses. This glossary keeps operational, customer, and financial
language precise across the product.

## Customers and finance

**Business Account**:
An external organization tracked through CRM, such as a customer, prospect, or
commercial counterparty.
_Avoid_: Ledger account, general ledger account

**Ledger Account**:
A named classification in a tenant's chart of accounts that receives debits or
credits.
_Avoid_: Business account, customer account

**Fiscal Period**:
A tenant-controlled date range during which financial entries may be posted.
_Avoid_: Reporting filter, calendar range

**Journal Entry**:
A balanced financial record containing two or more debit and credit lines. It
is editable only while it is a draft.
_Avoid_: Transaction, payment

**Journal Line**:
One debit or credit allocation within a journal entry, optionally assigned to a
project.
_Avoid_: Invoice line, item line

**Posting**:
The one-way transition that validates, numbers, and makes a journal entry
immutable.
_Avoid_: Save, submit

**Reversal Entry**:
A new posted journal entry whose lines are equal and opposite to one earlier
posted entry.
_Avoid_: Edit, delete, undo

**General Ledger**:
The immutable set of all posted journal lines for a tenant.
_Avoid_: Draft journal, audit log

**Customer Invoice**:
A billing demand issued to one Business Account for a project. It becomes a
receivable only when issuance posts its balanced journal.
_Avoid_: Progress claim, draft billing

**Open Receivable**:
The unpaid amount on an issued Customer Invoice that is represented in the
Accounts Receivable control account.
_Avoid_: Invoice subtotal, contract value

**Retention Receivable**:
An amount contractually withheld from current collection but still owed by the
customer under the contract.
_Avoid_: Discount, withholding tax

**Withholding Tax Receivable**:
Tax withheld by the customer that the company may credit against its own tax
obligation, supported by the required certificate.
_Avoid_: Output VAT, expense

**Invoice Issuance**:
The one-way action that validates an invoice, posts its financial effects, and
makes its commercial and monetary terms immutable.
_Avoid_: Save, email, status change

**Purchase Order**:
An approved commitment to buy from a Vendor. It does not become a liability
until a Supplier Bill is posted.
_Avoid_: Supplier bill, payment

**Supplier Bill**:
A Vendor demand for payment matched line-by-line to a Purchase Order. Tracked
inventory lines also cite active posted Stock Receipt evidence and clear Goods
Received Not Invoiced; non-inventory lines use expense or asset Ledger
Accounts.
_Avoid_: Purchase order, receipt, disbursement

**Open Payable**:
The unpaid amount on a posted Supplier Bill represented in the Accounts Payable
control account.
_Avoid_: Purchase commitment, bill subtotal

**Input VAT**:
Recoverable VAT charged by a Vendor and posted to an asset control account.
_Avoid_: Output VAT, expense

**Withholding Tax Payable**:
Tax withheld from the Vendor payment that the company owes to the tax
authority.
_Avoid_: Supplier discount, input VAT

**Three-Way Match**:
Evidence that the Purchase Order, accepted receipt, and Supplier Bill agree
within policy before payment approval.
_Avoid_: Visual review, invoice status

Posting locks and rechecks the Purchase Order line, active Stock Receipt line,
unmatched quantity/value, Vendor, project, control accounts, and fiscal period.
Tracked inventory cannot post without that full evidence. Partial-match money
permits only a one-cent integer-rounding tolerance.

## Project budget control

**Cost Code**:
A tenant-owned category applied consistently to a Project Budget line,
Purchase Order line, Supplier Bill line, and manual Cost Entry.
_Avoid_: BOM item code, Ledger Account, free-text label

**Project Budget**:
The approved, versioned cost-control baseline for one Project. It is distinct
from the BOM estimate and cannot be edited after submission.
_Avoid_: BOM total, live cost report, forecast

**Commitment**:
The authorized value of an active issued, confirmed, or delivery-stage
Purchase Order line assigned to a Cost Code.
_Avoid_: Draft Purchase Order, posted actual, unpaid Supplier Bill

**Forecast at Completion**:
For each Cost Code, the greater of commitment and actual before project
roll-up. This prevents a Purchase Order and its later Supplier Bill from being
counted twice.
_Avoid_: Budget, commitment plus actual, cash forecast

**Budget Revision**:
A cloned draft that records why the baseline changes. Commercial and Finance
approve separate lanes; final approval atomically supersedes the prior
baseline without deleting it.
_Avoid_: Editing an approved budget, BOM revision

## Inventory and receiving

**Unit of Measure (UOM)**:
The controlled unit used to state an Item quantity. Quantities are stored as
integer micro-units; one whole UOM equals 1,000,000.
_Avoid_: Free-text unit label, currency

**Warehouse**:
A tenant-owned inventory location, optionally dedicated to one project.
_Avoid_: Delivery destination note, Vendor

**Stock Receipt**:
Evidence that specific tracked Purchase Order lines and quantities entered one
Warehouse. Posting creates stock and financial effects.
_Avoid_: Delivery schedule, Supplier Bill, cash receipt

**Stock Ledger Entry**:
An append-only quantity and value movement caused by a posted Stock Receipt,
Stock Movement, or their reversal.
_Avoid_: General-ledger line, editable inventory balance

**Stock Movement**:
Controlled evidence for one internal transfer, project consumption, or counted
adjustment. Posting freezes its lines and writes Stock Ledger Entries.
_Avoid_: Stock Receipt, editable stock balance

**Transfer**:
An equal-quantity and equal-value movement between two Warehouses. It changes
location, not total Inventory value, so it does not create a journal.
_Avoid_: Delivery, consumption, Purchase Order

**Project Consumption**:
Stock relieved from one Warehouse at weighted-average cost and charged to one
Project and Cost Code through a balanced journal.
_Avoid_: Transfer, issue without job-cost evidence

**Count Adjustment**:
An evidenced signed difference between recorded and counted stock. Positive
adjustments require a declared unit cost; negative adjustments use current
weighted-average cost.
_Avoid_: Editing a stock balance, Stock Receipt

**Weighted-Average Cost**:
The Warehouse-and-Item stock value divided by its quantity when a movement is
posted under serialized balance locks.
_Avoid_: Latest purchase price, manually entered consumption cost

**Legacy Received Bridge**:
The preserved opening quantity derived from receiving fields that predate
Stock Receipts. It remains visible in Purchase Order received totals but is not
invented into historical Stock Receipt evidence.
_Avoid_: Posted Stock Receipt, stock adjustment

**Cash Account**:
A controlled cash, bank, or e-wallet account tied one-to-one to an asset
Ledger Account.
_Avoid_: Ledger Account, bank statement

**Cash Transaction**:
Evidence of money received from a Business Account or disbursed to a Vendor.
It affects the ledger only after all of its amount is allocated and Finance
posts it.
_Avoid_: Journal entry, invoice status, bank statement line

**Receipt Allocation**:
The amount of a posted customer receipt applied to one invoice current-due or
retention component.
_Avoid_: Receipt, payment status

**Disbursement Allocation**:
The amount of a posted Vendor disbursement applied to one posted Supplier Bill.
_Avoid_: Supplier Bill, Purchase Order

**Open Subledger Balance**:
The posted document amount less active posted allocations and linked
reversals. It is computed from evidence, never a manually typed status.
_Avoid_: Draft amount, dashboard label

**Bank Statement**:
An institution-reported period for one bank or e-wallet Cash Account. Its
source filename and SHA-256 fingerprint identify the exact imported CSV bytes.
_Avoid_: Cash transaction, general-ledger report

**Bank Statement Line**:
A signed external movement reported by the institution. Positive lines match
posted receipts; negative lines match posted disbursements.
_Avoid_: Journal line, cash allocation

**Exact Auto-Match**:
A match created only when one posted cash candidate agrees on Cash Account,
currency, direction, amount, and the seven-day date window. Zero or multiple
candidates remain exceptions for Finance review.
_Avoid_: Fuzzy match, silent assumption

**Bank Reconciliation**:
The controlled close that requires a balanced statement and a valid cash match
for every line, then makes the statement immutable. Correction records a void
with actor, time, and reason without deleting original evidence.
_Avoid_: Cash posting, statement deletion, status edit
