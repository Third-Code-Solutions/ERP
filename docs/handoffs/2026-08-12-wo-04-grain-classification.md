# WO-04 grain classification handoff

## Scope

Implement PRD WO-04 against the existing `bom_line_items` spine. Preserve all
existing IDs and downstream foreign keys. Classification is explicit and
reviewable; no automatic reparenting is permitted.

## Sequential ownership

1. Agent 04: additive schema, migration, indexes, RLS, audit participation, and
   static migration tests.
2. Agent 05: tenant-bound classification and attachment commands with strict
   validation and audit events.
3. Agent 02/10: review queue and BOM line UI with keyboard-accessible actions.
4. Agent 13/12: CI and security gates, migration replay, and RLS verification.

## Inputs

- `docs/PRD.md`, WO-04, M-01, I-03, and the three authority PDFs.
- Existing `bom_line_items` IDs, `po_line_items`, RFQ, cost, and budget joins.
- UOM classification rules: `sqm`, `cu.m`, `m2`, `lm`, `lot` are work items;
  `pc`, `pcs`, `kg`, `set`, `liters` are material lines; other values require
  review.

## Outputs and gates

- Additive migration and Drizzle schema.
- Every existing line classified or queued; no parent link created by
  backfill.
- Explicit, tenant-scoped classify and attach operations.
- Regression proof that downstream identifiers remain unchanged.
- Local tests, typecheck, build, and browser review before handoff.

## Blockers

Hosted release remains blocked independently by provider source divergence,
duplicate hosted PO numbers, and incomplete hosted WO-02 audit coverage.
