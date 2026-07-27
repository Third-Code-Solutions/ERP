# Versioned project budget control

## User outcome

Commercial and Finance can establish an approved Project Budget by Cost Code,
see committed and actual cost against the baseline, and revise it without
erasing history. Procurement sees the Cost Code on each PO line before
approval. Optional blocking control prevents an over-budget PO from becoming a
commitment.

## Invariants

- Approved and superseded budget revisions and lines are immutable.
- Commercial and Finance approvals are separately attributed.
- Only one approved revision is active for a project.
- Every new PO, Supplier Bill, and manual cost line carries one tenant-safe
  Cost Code.
- Supplier Bill Cost Code is derived from its PO line.
- Commitment enforcement runs transactionally at PO issuance/confirmation.
- Forecast avoids adding the same PO and its later bill twice.

## Acceptance criteria

- Cross-tenant Cost Codes, duplicate revision numbers, invalid approval lanes,
  self-approval, missing dimensions, and blocked overruns are rejected.
- Revision approval supersedes the prior baseline without deleting it.
- Project cost surfaces show baseline, commitments, actuals, forecast, and
  variance by Cost Code.
- RLS, audit, Cortex, function ACL, clean reset, zero schema diff,
  serialization and cumulative-limit tests, and authenticated browser
  journeys are release gates.
