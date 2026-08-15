# WO-15 blocker — ABI Delegation-of-Approval matrix

## Status

BLOCKED for the ABI-specific RFPO approval route. The independent budget-line
commitment boundary is implemented and statically verified.

## Evidence

- `docs/PRD.md` identifies O-03 as the actual ABI Delegation of Approval matrix:
  amount bands, approver roles, sequence, and escalation.
- `docs/PROMPTS.md` still contains the literal placeholder
  `Delegation-of-Approval routing by amount band [PASTE ABI MATRIX HERE]`.
- The repository has generic `approval_rules` and `approvals` tables with
  integer-centavo amount bands, but no ABI-specific RFPO rules or signed source
  defining their values.

## Safety boundary

No amount bands, approver roles, sequence, escalation, or RFPO approval
transitions were invented. Existing Purchase Order approval and PH tax logic
remain unchanged. The generic approval tables remain available for the later
source-backed configuration.

## Unblock input

Provide the signed ABI matrix (bands in PHP centavos, approver roles, ordered
steps, and escalation business days). Then map it to `approval_rules` for the
RFPO object and add the RFPO-to-PO transition with tenant/RLS/audit coverage.
