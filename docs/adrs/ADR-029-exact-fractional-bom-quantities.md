# ADR-029: Exact fractional BOM quantities

- Status: Accepted
- Date: 2026-08-25
- Owners: Third Code Solutions Inc.
- Finding: AUD-006

## Context

`bom_line_items.quantity` is an integer, while takeoff ingestion can identify
fractional quantities such as 0.1. The current importer detects and blocks
those rows rather than rounding them. That prevents silent cost errors but
also prevents a valid construction takeoff from progressing.

Inventory and purchasing already represent operational quantities as signed or
unsigned integer micro-units (`quantity_micros`), with six decimal places and
string decimal input at their API boundaries. BOM must use the same exact
representation instead of introducing PostgreSQL floating point or JavaScript
`number` arithmetic for money-bearing calculations.

## Decision

`bom_line_items.quantity_micros` is the canonical BOM quantity. One whole
unit is `1_000_000` micro-units. External decimal quantities are accepted only
as canonical decimal strings with at most six fractional digits, are converted
once to a bounded `bigint`, and are returned as an integer string. Browser
formatting may render a decimal display value but is never a calculation
authority.

The existing integer `quantity` remains a read-only compatibility field during
the migration. Existing rows backfill as `quantity * 1_000_000`; new and
updated writers set both fields only when the quantity is an exact whole unit.
After all readers have migrated, `quantity` is retired through a separately
reviewed compatibility removal. No writer may round a fractional value to fill
the legacy field.

For a line with `unit_cost_cents`, compute base cost as half-up rounded
`unit_cost_cents * quantity_micros / 1_000_000`. Apply markup using the
existing basis-point half-up rule to that exact integer-cent base. Aggregations
sum integer cents only. A quantity that would overflow PostgreSQL `bigint` or
the repository's safe transport boundary is rejected before mutation.

The takeoff importer, CAD evidence commit, Togal commit, manual BOM editor,
purchase-order derivation, RFQ projections, signing views, and reports must
read the canonical micro-unit field. Procurement and inventory preserve the
same micro-unit value; they must not derive quantity from a rounded legacy
integer.

## Rollout and rollback

1. Add `quantity_micros` as an additive, non-negative `bigint` with a
   compatibility backfill and migration/catalog tests.
2. Add shared decimal parsing, formatting, and centavo calculation helpers
   with boundary, overflow, and rounding tests.
3. Migrate every BOM writer and reader in vertical slices. Keep fractional
   source rows blocked until every affected cost and procurement path uses the
   canonical field.
4. Replay migrations from zero, test tenant isolation, verify fractional
   takeoff-to-PO values, and canary a controlled tenant before enabling
   fractional takeoff commit.

Rollback disables the fractional commit flag and retains the additive column
and immutable audit evidence. Existing whole-unit values remain readable; an
applied migration is never dropped during an incident.

## Consequences

- Fractional takeoffs can be priced and procured without binary floating-point
  drift or silent rounding.
- APIs and UI adapters must handle decimal strings and integer micro-unit
  transport explicitly.
- The compatibility period adds temporary dual-read complexity, but prevents a
  breaking migration of historic BOM and purchasing records.

## Rejected alternatives

- PostgreSQL `real`/`double precision`: introduces non-deterministic monetary
  rounding.
- Persisting a JavaScript decimal `number`: loses exactness before validation.
- Rounding fractional quantities to integers: creates untraceable cost and
  scope errors.
- Reusing an unrelated `numeric` field without a fixed scale: leaves API and
  calculation precision ambiguous.
