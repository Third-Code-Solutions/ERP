# Vendor performance projection

## Added

- Added a tenant-scoped Core read projection over purchase orders, delivery
  schedules, and supplier-bill posting evidence.
- Added explainable rule-based signals for on-time delivery, acceptance,
  average lead time, commitments, and posted spend; no credit score or
  unverified estimate is presented.
- Added a role-gated Web register with an exact-tenant Core canary, a legacy
  database fallback, loading/error states, and an opt-in role-matrix E2E.

## Compatibility and limits

- Existing RFQ, PO, delivery, inventory, and supplier-bill workflows remain
  unchanged.
- Subcontract-specific contract terms and the SAP goods-receipt interface
  remain separate follow-on work; this slice only reports evidence already
  present in ThirdCodeERP.
- Hosted RLS, protected browser canary, and live demo-account E2E remain
  pending environment-backed QA.
