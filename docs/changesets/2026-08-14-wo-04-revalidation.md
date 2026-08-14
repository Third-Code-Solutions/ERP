# WO-04 grain classification revalidation

## Status

PARTIALLY VERIFIED. The local M-01 implementation and static safety gates pass.
Staging/hosted replay and before/after downstream identifier comparison remain
unverified because no approved PostgreSQL/Supabase runtime is available in this
environment.

## Work completed

- Restored the root `test:wo-04-migration` and `verify:wo-04-database` commands.
- Added the WO-03 and WO-04 static gates to the CI unit-test job while keeping
  the database verifier read-only.
- Revalidated additive `bom_line_items` grain fields, approved UOM
  classification, durable tenant-scoped grain reviews, audit coverage, and the
  pre-review I-03 gate.
- Revalidated that estimator resolution requires an explicit same-tenant,
  same-BOM classified work-item parent and never auto-reparents a line.
- Preserved the existing `bom_line_items.id` identity and downstream foreign
  key targets.

## Verification

- PASS — `pnpm test:wo-04-migration` (1/1).
- PASS — `node scripts/verify-wo-04-migration.mjs`.
- PASS — `node --check scripts/verify-wo-04-database.mjs`.
- PASS — `node scripts/verify-build-ops-invariants.mjs`.
- PASS — `node scripts/verify-workflow-action-refs.mjs`.
- PASS — `git diff --check`.
- BLOCKED — `pnpm verify:wo-04-database`, staging replay, authenticated
  review-queue browser E2E, and downstream PO/RFQ/cost/budget byte-identity
  comparison; Docker/Supabase and an approved staging target are unavailable.

## Known repository boundary

The legacy `scope_items` table and compatibility consumers still exist in the
pre-existing schema. The Build Ops PDFs forbid that parallel identity, but
removing it requires a separate dependency inventory and reversible cutover;
this WO-04 pass does not drop or repoint that legacy surface.

## Safety

No hosted migration, production data mutation, destructive SQL, or downstream
foreign-key rewrite was performed.
