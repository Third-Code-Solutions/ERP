# WO-15 — RFPO to PO to budget commitment

## Status

PARTIALLY VERIFIED. The I-09 budget-line commitment boundary and pre-submission
overrun warning are source-backed and statically verified. The ABI-specific
RFPO Delegation-of-Approval route is blocked by O-03; no matrix values were
fabricated.

## Changed

- Added `20260814130000_wo_15_budget_commitment.sql` as an additive replacement
  of the existing budget commitment function.
- Controlled PO issuance now requires each PO line to resolve to the approved
  `project_budget_lines` row using both `bom_line_item_id` and `cost_code_id`.
- Remaining allowable and cumulative commitments are evaluated per approved
  BOM-linked budget line, including the configured centavo tolerance.
- Purchase Order detail now shows an accessible cost-code warning when the
  current PO would exceed remaining allowable before submission; the submit
  control requires explicit acknowledgement of that warning.
- Existing Draft → PM → Commercial → SCM → Issued workflow and 12% VAT / 2%
  withholding helper were not rewritten.
- Added safe error surfacing and a static contract gate.

## Verification

- WO-15 static contract gate: PASS.
- Live PostgreSQL migration replay: NOT RUN; Docker daemon/Supabase CLI are
  unavailable in this environment.
- Authenticated browser PO commitment replay: NOT RUN; runtime dependencies and
  hosted tenant access are unavailable.
- ABI delegation matrix: BLOCKED by O-03; source placeholder remains.

## Release boundary

No hosted migration, production data write, deployment, commit, or push was
performed.
