# BOM fractional-quantity contract mismatch — 2026-08-17

## State

**Decision resolved; implementation remains deliberately gated.**
[ADR-029](../adrs/ADR-029-exact-fractional-bom-quantities.md) selects a
six-decimal `quantity_micros` bigint as the canonical representation. The
source safety mitigation remains in force until the approved vertical rollout
is complete. The
PRD's canonical DUPA example uses a header quantity of `0.10`, while the
active `bom_line_items.quantity` column is a PostgreSQL `integer`. A decimal
cannot be represented faithfully by the active BOM, total, approval, and
downstream procurement contracts.

## Evidence

1. `docs/PRD.md` section 4.2 names `0.10` as the canonical worked-example
   header quantity and derives a unit rate by dividing by it.
2. `packages/database/src/schema/bom-line-items.ts` defines
   `bom_line_items.quantity` as `integer`, and current input/API contracts
   and money calculations use integer quantities.
3. The following former lossy paths were found during adversarial review:
   generic takeoff commit rounded source quantities; the Core Togal commit
   accepted decimal quantities then rounded them; Web and Python DXF extractors
   rounded measured areas; and the manual BOM form used `parseInt`.

## Implemented containment

- Generic takeoff retains the source value in preview and records an
  `INVALID_QUANTITY` unresolved item with persisted quantity `0`; it never
  rounds a fractional quantity into a BOM line.
- Core Togal commands now reject fractional quantities at the shared contract
  boundary and allow writes only to draft BOMs.
- Web/Python CAD extractors preserve measured fractional areas. The current
  integer-only evidence contract rejects them before any persistence boundary
  rather than changing the evidence.
- Manual BOM creation requires a safe integer within the PostgreSQL integer
  range, both client-side and at its server-action boundary.

## Approved rollout required before exact fractional BOM support

1. ADR-029 defines the scaled-integer micro-unit representation, decimal-string
   boundary contract, and half-up centavo rules. No alternate representation
   remains open.
2. Agent 04 must provide an additive migration and backfill/rollback plan for
   BOM, DUPA, totals, imports, approvals, procurement, reports, indexes, and
   RLS-dependent queries. Historical quantities must not be silently changed.
3. Agents 05/06/10/14 must update all contracts, Core commands, importer/CAD
   producers, money math, UI validation, Excel/Togal mapping, and regression
   fixtures. A real sanitized ABI workbook must prove the PRD example end to
   end before the decimal requirement is called verified.
4. The change then requires disposable migration/replay, tenant-isolation,
   exact-money, approval/immutability, Core API, browser E2E, and authorized
   hosted verification.

No hosted schema or data was changed for this mitigation. The decision is
complete; decimal BOM entry remains unavailable until the rollout above is
implemented and verified end to end.
