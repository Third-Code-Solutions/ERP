# Weekly progress/WAR → billing traceability handoff

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
