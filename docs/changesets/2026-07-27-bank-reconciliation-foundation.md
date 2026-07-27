# Bank reconciliation foundation

## User outcome

Finance can import a bank statement, automatically match unambiguous lines,
review exceptions, reconcile only when balances and evidence agree, and void
an incorrect reconciliation without deleting history.

## Invariants

- One statement belongs to one active bank or e-wallet Cash Account.
- Statement dates are ordered and each line falls inside the statement range.
- Opening balance plus signed statement lines equals closing balance.
- Source filename and SHA-256 identify the exact imported CSV bytes.
- Positive lines match posted receipts; negative lines match posted
  disbursements.
- Match amount, currency, Cash Account, direction, and active state agree.
- One posted cash transaction can match at most one statement line.
- Exact auto-match acts only when exactly one candidate exists.
- Reconciliation requires every line matched and rechecks all invariants.
- Reconciled and voided evidence is immutable.
- Voiding records actor, time, and reason; it does not delete matches or lines.
- Reconciled cash must be voided before its accounting transaction can reverse.

## Acceptance criteria

- CSV import rejects malformed, duplicate, out-of-range, zero-value, and
  non-balancing evidence atomically.
- Exact candidates auto-match; ambiguous or missing candidates remain open.
- Manual matching rejects cross-tenant and mismatched evidence.
- Reconciliation and void are Finance-only trusted operations.
- Audit, Cortex, RLS, function ACL, clean reset, and empty schema diff gates
  cover the new tables and workflows.
