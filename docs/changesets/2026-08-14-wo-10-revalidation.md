# BUILD OPS WO-10 — RFQ intake, comparison, and price history

## Status

PARTIALLY VERIFIED.

## Source-backed changes

- Retained the existing tenant-scoped RFQ quote and award workflow.
- Verified that quote capture writes a dated `price_history` row with RFQ,
  quote, vendor, source, and centavo provenance, and that award updates the
  same history row plus the material catalog under the same transaction.
- Added a read-only DUPA material-line view of the five newest catalog-linked
  price suggestions, including supplier, effective centavo rate, source, date,
  source document, and the PDF-required `>90d` stale warning.
- Added a static contract gate covering the additive provenance migration,
  tenant boundaries, integer-safe pricing, audit writes, award propagation,
  and DUPA presentation.

## Verification

- PASS — `pnpm test:wo-10-contract` (1/1).
- PASS — direct WO-10 invariant verifier.
- PASS — `git diff --check`.
- PASS — `package.json` JSON parse.
- NOT RUN — live quote/award transaction and browser journey; the local
  PostgreSQL runtime is unavailable in this session and dependencies are not
  installed for the workspace test/typecheck lanes.

## Remaining risk

The RFQ/award path still requires disposable PostgreSQL replay and an
authenticated browser run before it can be called runtime-verified. No
hosted migration, production data write, deployment, or provider mutation was
performed.
