# RFQ bid-leveling evidence

## Added

- Added a clean-room Core projection for RFQ line coverage, lowest quoted unit
  price, quote age/validity, and explicit award evidence.
- Added a Web bid-leveling summary to the existing RFQ detail screen with a
  strict exact-tenant canary and a local compatibility fallback.
- Added stale-quote warnings at the PRD-defined 90-day threshold and protected
  role-matrix tests; commercial award remains a human-confirmed action.

## Compatibility and limits

- Existing RFQ creation, quote capture, price comparison, completion, and award
  actions remain unchanged.
- This does not invent client-issued TOR/BOQ schemas or an external
  subcontractor portal; those remain configurable/blocked by the PRD.
- Hosted RLS, protected browser canary, and live demo-account E2E remain
  pending environment-backed QA.
