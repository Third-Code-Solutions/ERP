# Claim transition authority hardening

## Outcome

Hardened the legacy claim transition actions so every state change uses a
tenant-scoped status compare-and-set. Concurrent requests now have one winner;
losers return an explicit refresh error before audit or notification side
effects. Rejection and cancellation now enforce the same capability union as
the claim transition panel.

Certificate documents are additionally required to belong to the claim's
project, preventing a same-tenant document from being linked across projects.

## Changed areas

- Guarded submit, certificate, handover, invoice, payment, rejection and
  cancellation updates with the status observed by the request.
- Added server-side capability checks for reject/cancel.
- Added focused transition-action tests covering authorization, compare-and-set
  races, audit ordering and revalidation.

## Verification

- Claim transition + document action tests: 11 passed.
- Web typecheck: PASSED.
- Focused ESLint for the transition action: PASSED.
- `git diff --check`: PASSED (line-ending warnings only).

Production deployment remains gated by the existing encrypted backup/restore
proof and coordinated Core/Web release evidence.
