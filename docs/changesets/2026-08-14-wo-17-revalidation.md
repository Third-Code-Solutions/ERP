# WO-17 — Cost control revalidation

## Status

PARTIALLY VERIFIED. The source-level cost-control contract and primary project
cost-page wiring pass. Live PostgreSQL replay, authenticated browser proof, and
the required Commercial spreadsheet sign-off remain open.

## Changed

- Wired the existing BOM-line cost-control query into the primary project cost
  page instead of deriving commitment from gross PO totals or actuals from the
  manual cost log.
- Rendered Budget → Committed → posted supplier-bill Actual → Remaining →
  Variance by Cost Code and BOM line, with unreconciled manual/legacy evidence
  called out separately.
- Added a focused WO-17 contract gate covering additive migration safety,
  tenant-safe supplier-bill BOM-line lineage, posted-bill filtering, and page
  presentation.

## Verification

- WO-17 static contract gate: PASS.
- BUILD OPS invariant suite: PASS (7/7).
- JavaScript syntax and package JSON checks: PASS.
- `git diff --check`: PASS; Git reported only line-ending normalization
  warnings for the dirty working tree.
- Live PostgreSQL migration and tenant/RLS replay: NOT RUN; Docker daemon and
  Supabase CLI are unavailable in this environment.
- Authenticated project-cost browser flow: NOT RUN; no provisioned local Auth
  tenant/browser runtime is available.
- Commercial human spreadsheet comparison: NOT RUN; this requires an actual
  running project and the authorized Commercial reviewer.

## Release boundary

No hosted migration, production data write, deployment, commit, or push was
performed.
