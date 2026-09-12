# Weekly progress/WAR → billing traceability handoff

## Subsequent verification correction — 2026-09-13

The completion claims below describe the initial implementation, not verified
production behavior. Actual PostgreSQL regression tests subsequently reproduced
serialization failures in all three Core writes (create, recapture, lock): bare
RETURNING used snake_case schema keys but the serializer expected camelCase.
See `2026-09-13-weekly-progress-write-results.md` for the repair handoff.
The same PostgreSQL regression also proved the linked-evidence trigger's
lowercase `TG_OP` comparisons did not execute, allowing a locked evidence edit.
The repair includes a forward migration correcting those comparisons; the
initial static immutability test was not sufficient evidence of enforcement.

Full retry safety is also not yet implemented: recapture replaces the prior
request identity, the Web action generates a new key on each invocation, and
locking with an earlier expected version requires refresh rather than replay.
Canonical cutoff/evidence-week binding and fresh lifecycle admission remain
follow-up work. Do not interpret the original "idempotent capture" description
or static migration checks as proof that these guarantees work end to end.

## Scope completed

- Added tenant-scoped weekly progress/WAR contracts, persistence, Core API routes,
  Thursday 17:00 PHT cut-off enforcement, idempotent capture, immutable lock
  snapshot, and compatibility-write canary.
- Added project progress UI ledger with explicit lock/read canary and all-role
  opt-in browser matrix.
- Added Core read projection for existing milestone claims, COC, invoice, and
  locked WAR evidence. The projection reports blockers and readiness without
  replacing the existing billing/claim ledger.
- Added exact-tenant billing traceability canary, project billing card, contract
  tests, protected API tests, and opt-in E2E matrix.

## Verification

- Shared contracts: PASS (`project-weekly-progress`, `project-billing-milestones`).
- Database migration static contract: PASS (`20260910170000_project_weekly_progress.sql`).
- Core API service/controller/protected tests: PASS (14 tests across both slices).
- API typecheck and lint: PASS.
- Web Core-client/component tests: PASS (8 tests across both slices).
- Web lint: PASS.
- Full Web typecheck: BLOCKED by pre-existing generated `.next/types` imports for
  unrelated routes; one pre-existing performance fixture type was corrected, but
  the generated-route failures remain.
- Hosted DB/RLS execution, Core deployment, and browser E2E: NOT RUN because no
  configured demo/hosted environment was available in this session.

## Handoff / next slice

→ Continue with the next approved post-MVP vertical slice: VO end-to-end or
  tender/RFQ bid-leveling, preserving the existing BOM/PO spine. Keep real ABI
  templates, DoA matrix, SAP contract, and other PRD blockers deferred.
