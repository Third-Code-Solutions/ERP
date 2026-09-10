# Variation-order lifecycle integrity

## Added

- Database-enforced VO state transitions and immutable terminal states.
- Tenant-scoped project reference, bounded time-impact check, FORCE RLS, and
  audit trigger for existing variation orders.
- Signature action validation for pending-signature status and same-tenant
  signed-document evidence.
- Route loading/error states and opt-in all-role VO E2E matrix.

## Compatibility and limits

- Existing VO screens, DocuSeal session path, and role capabilities remain in
  place; no migration rewrites existing records or source UI.
- Hosted trigger/RLS verification and live DocuSeal browser execution remain
  pending environment-backed QA.
