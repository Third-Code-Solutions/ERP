# ADR-015: Bank reconciliation is a separate immutable evidence layer

- Status: Accepted
- Date: 2026-07-27

A posted cash transaction proves the accounting event. A bank statement line
proves what the financial institution reported. Third Code ERP keeps those
facts separate and calls cash reconciled only after they are matched inside a
complete statement.

Each statement belongs to one bank or e-wallet Cash Account. Its dated,
signed lines must roll the opening balance to the closing balance. Positive
lines match posted receipts; negative lines match posted disbursements. A cash
transaction can match only one statement line, and amount, currency, account,
direction, and active posting state must agree.

The import records the source filename and SHA-256 digest. The normalized
statement lines remain queryable while the digest provides immutable
provenance for the exact uploaded CSV bytes without retaining the raw file.

Exact-match automation may propose or create a match only when one
unambiguous candidate exists. Ambiguous lines remain for Finance review.
Reconciliation requires every line to be matched and revalidates all evidence
inside one database transaction.

A reconciled statement is immutable. Correction voids the reconciliation with
an actor, timestamp, and reason; it never rewrites the original evidence.
Bank-originated corrections are represented by new statement and cash events.
