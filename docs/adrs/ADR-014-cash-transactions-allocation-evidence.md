# ADR-014: Cash movement requires allocation evidence

- Status: Accepted
- Date: 2026-07-27

A bank deposit, receipt, check, transfer, or cash release is not itself proof
that an invoice or Supplier Bill is settled. Third Code ERP records the cash
movement and its subledger allocations separately, then posts both in one
database transaction.

Customer receipts debit the selected Cash Account and credit Accounts
Receivable or Retention Receivable per allocation. Vendor disbursements debit
Accounts Payable per Supplier Bill and credit the selected Cash Account. Every
allocation must match the transaction counterparty, stay within the remaining
open component, and sum exactly to the cash amount.

Posted cash terms and allocations are immutable. Correction uses a
transaction-owned equal-opposite journal. Invoice payment state and payable
aging are derived from active posted allocation evidence; generic journal
reversal and manual paid toggles cannot bypass the workflow.

Bank statement import and reconciliation are a separate evidence layer. A
posted cash transaction can exist before a statement line arrives, but it is
not called reconciled until a controlled match closes it.
