# Weekly progress/WAR and billing traceability

## Added

- Core weekly progress/WAR ledger with tenant-scoped idempotency, Thursday
  17:00 PHT cut-off, immutable lock snapshot, and progress-update guard.
- Project progress WAR ledger UI and guarded lock action.
- Core billing milestone projection linking existing locked WAR evidence, COC,
  progress claim, and invoice records with explicit readiness blockers.
- Billing-page traceability card and exact-tenant canary configuration.
- Shared contracts, API protected tests, UI tests, and opt-in all-role E2E
  matrices.

## Compatibility and limits

- Existing progress, claim, COC, and invoice flows remain intact and are not
  silently migrated or replaced.
- Core reads/writes are disabled by default and require exact tenant canaries;
  binary document storage, DocuSeal, claim mutation migration, and live SAP
  posting remain separate slices.
- `project_billing_milestones` is a projection over existing records; it does
  not invent project-specific milestone percentages or bypass unresolved PRD
  template/contract decisions.
