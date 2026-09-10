# Variation-order integrity handoff

## Scope completed

- Added the database integrity guard for the existing VO lifecycle:
  `draft → pending_commercial_pricing → pending_client_signature → signed`,
  with rejection as the terminal side path.
- Added tenant/project composite integrity, bounded time impact, FORCE RLS, and
  append-only audit coverage for variation-order writes.
- Hardened the existing signature completion action so a VO can only be signed
  while awaiting client signature and any supplied signed document is verified
  in the same tenant.
- Added opt-in all-role browser matrix and route loading/error states while
  preserving the existing VO UI and DocuSeal flow.

## Verification

- Variation-order migration static contract: PASS.
- Web lint: PASS.
- API typecheck: PASS.
- Hosted database/RLS trigger execution and browser E2E: NOT RUN; no configured
  demo/hosted environment was available.

## Handoff / next slice

→ Continue with tender/RFQ bid-leveling and reusable procurement evidence, or
  the remaining subcontractor/vendor-performance slice. Keep SAP integration,
  real ABI templates, and unresolved DoA/product decisions behind their PRD
  blockers.
