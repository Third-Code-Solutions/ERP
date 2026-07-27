# ADR-012: Customer invoices control receivable posting

- Status: Accepted
- Date: 2026-07-27

A draft customer invoice has no general-ledger effect. Issuance runs one
database transaction that validates the Business Account, project, amounts,
open fiscal period, and required system Ledger Accounts; creates a balanced
journal; posts it; and links that immutable journal back to the invoice.

The invoice debit separates currently collectible Accounts Receivable,
Retention Receivable, and Withholding Tax Receivable. Credits separate revenue
and output VAT. Their totals must reconcile exactly. After issuance, project,
customer, monetary terms, and posting linkage cannot be edited. Correction uses
a linked journal reversal and an explicit invoice correction workflow.
That workflow preserves the customer and project dimensions on every opposite
line and closes the invoice only after the reversal posts.

Application-only status transitions and manual “paid” buttons are rejected.
Cash collection will be recognized only through a receipt and allocation slice.
