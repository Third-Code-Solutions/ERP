# WO-06 DUPA engine revalidation

## Status

PARTIALLY VERIFIED and BLOCKED for canonical sign-off. The local additive
M-03/M-04 schema and static controls pass. The exact PRD worked-example result
cannot be implemented truthfully from the listed two-decimal inputs under the
locked BIGINT-centavo model without an ABI source-precision decision.

## Work completed

- Restored the root `test:wo-06-migration` and `verify:wo-06-database` commands.
- Added the WO-06 static migration gate to the CI unit-test job.
- Revalidated tenant-scoped material, crew, equipment, assembly, price-history,
  DUPA, and DUPA child-line tables with forced RLS, audit hooks, composite
  tenant foreign keys, and explicit grants.
- Revalidated trigger-owned exact numeric cascade, configurable VAT base,
  persisted H unit rate, downstream BOQ synchronization, and crew-rate refresh.
- Preserved the existing `bom_line_items.id` commercial spine and rejected the
  forbidden `scope_items` identity in the WO-06 migration gate.

## Verification

- PASS — `pnpm test:wo-06-migration` (1/1).
- PASS — `node scripts/verify-wo-06-migration.mjs`.
- PASS — Node syntax checks for the read-only and behavior verifiers.
- PASS — `node scripts/verify-build-ops-invariants.mjs`.
- PASS — `git diff --check`.
- BLOCKED — shared DUPA test execution, PostgreSQL trigger behavior,
  crew-rate recomputation, persisted-rate BOQ replay, and full database
  verification because workspace dependencies and Docker/PostgreSQL are not
  available in this environment.
- BLOCKED — canonical acceptance `G=1,621,750` and `H=16,217,500`. The listed
  exact centavo inputs produce `G=1,621,751` and `H=16,217,506`; the existing
  blocker records the arithmetic evidence and the two required ABI decisions.

## Required unblock

ABI must either provide the workbook's source-precision rates or approve the
values produced by the displayed centavo rates. Only then can the canonical
fixture be made an acceptance test and the DUPA UI/API sign-off proceed.

## Safety

No hosted migration, production data mutation, destructive SQL, or general
ledger/journal/reconciliation work was performed.
