# PPRF replay receipt strictness

## Change

PPRF intake and resubmission replay receipts now use a strict Zod schema. Unknown
fields are rejected instead of being carried through the replay path.

## Integrity impact

Malformed or tampered historical receipts fail closed with a conflict before any
replay result is returned. Normal receipt fields, tenant scoping, idempotency,
and transaction behavior are unchanged.

## Verification

- Focused PPRF service tests cover unknown-field rejection.
- Full CI remains the release gate for typecheck, lint, database, browser, and
  production verification.
