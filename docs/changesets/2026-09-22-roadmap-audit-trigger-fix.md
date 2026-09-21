# Roadmap audit trigger coverage

## Change

- Added explicit append-only `audit_log_trigger()` coverage for every tenant-scoped roadmap integration table, including procurement, inventory reservations, landed costs, price lists, tax/statutory outputs, fiscal close, SAP, provider delivery, feature flags, and workflow event evidence.
- The migration now fails closed if the audit trigger function is unavailable and recreates only the named roadmap audit triggers idempotently.

## Verification

- CI database rebuild reached the database test phase after the migration fix.
- The remaining CI failure identified the missing audit coverage; the next CI run must verify the runtime trigger invariant.
