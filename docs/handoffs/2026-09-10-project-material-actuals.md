# Handoff — project material actuals

## Scope

Project cost visibility now includes a read-only material actuals projection
from posted goods receipts and posted project consumption movements.

## Boundaries

- API: `ProjectMaterialActualsController` and
  `ProjectMaterialActualsService` own the protected Core contract.
- Web: the cost page uses the exact tenant canary or the validated direct
  database fallback.
- Shared: the deterministic builder is the single status/remaining-value rule.
- No schema or migration was added; existing inventory receipt/movement RLS and
  append-only audit behavior remain authoritative.

## Follow-up

SAP posting is intentionally not implemented. A future integration must first
provide an ADR-backed contract, credential boundary, idempotency key, retry
policy, reconciliation report, and negative-path tests before any external
write is enabled.
