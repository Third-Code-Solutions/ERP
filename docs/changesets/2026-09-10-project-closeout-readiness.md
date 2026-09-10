# Project close-out readiness evidence

## Outcome

- Added a tenant-scoped, read-only project close-out readiness projection.
- Reports existing performance/surety/construction bond refund evidence, invoice retention allocation evidence, and the explicit absence of a P&L close-out source.
- Added a protected Core route: `GET /v1/projects/:projectId/closeout-readiness`.
- Added a turnover-page card with PHP retention formatting, blockers, and SAP/P&L boundary language.
- Added an exact-tenant Core read canary; the direct DB projection remains the default.

## Verification

- Shared type tests: passed (3 tests).
- API service/controller/protected tests: passed (6 tests).
- Shared/API typecheck and API lint: passed.
- Web close-out/handover client and component tests: passed (7 tests).
- Web lint: passed.
- Full web typecheck: passed after the production build regenerated `.next` route types.
- Web production build: passed.
- Live database/RLS, browser auth matrix, and deployment: not run in this environment.

## Boundaries

- No contract release date/term is inferred.
- No P&L close-out or SAP statutory accounting success is claimed.
- No schema or migration change was required.
