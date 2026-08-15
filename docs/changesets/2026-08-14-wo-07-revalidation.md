# WO-07 BOM Builder revalidation

## Status

PARTIALLY VERIFIED. The local BOM view contract now reflects the additive
DUPA/location model and passes its static gate. Full authenticated responsive
browser verification and a real persisted DUPA replay remain unavailable.

## Work completed

- Removed the BOM page's direct dependency on the forbidden legacy
  `scope_items` table and its legacy scope-count link.
- Updated the CAD panel copy to describe candidate work-item extraction and an
  explicit pricing/review boundary rather than presenting auto-priced scope as
  finished BOM data.
- Added a static WO-07 contract gate covering derived DUPA rates, no row-level
  markup control, no editable derived unit-cost input, real pricing-state chips,
  catalog-keyed supplier matching, and 90-day price staleness signaling.
- Added the gate to the root package scripts and CI unit-test job.

## Verification

- PASS — `pnpm test:wo-07-contract` (1/1).
- PASS — `node scripts/verify-wo-07-ui-contract.mjs`.
- PASS — `node --check scripts/verify-wo-07-ui-contract.mjs`.
- PASS — `node scripts/verify-build-ops-invariants.mjs`.
- PASS — `git diff --check`.
- BLOCKED — shared-types/web tests, typecheck, build, authenticated browser
  flow, and live rate-card/DUPA behavior because workspace dependencies and the
  database/browser runtime are unavailable in this environment.

## Known boundary

Legacy `markup_bps` compatibility fields and other producer paths still exist
outside this view contract. They must remain zero/derived and be removed from
input paths in the subsequent takeoff and AI-draft work orders; this pass does
not drop the legacy column or rewrite downstream identities.
