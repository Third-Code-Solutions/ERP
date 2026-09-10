# Field diary vertical slice — 2026-09-10

## Objective

Add a clean-room daily site diary for execution projects: one tenant-scoped
entry per project/day, auditable draft/submit lifecycle, weather/manpower/work
and constraint capture, and a read-only view for every authenticated role.

## Ordered ownership

1. Agent 04 — schema, migration, indexes, RLS, audit trigger, static authority tests.
2. Agent 05 — shared Zod contracts and Core list/create/update/submit routes.
3. Agent 03 — authenticated project diary route, server actions, forms, filters,
   loading/error states, and opt-in all-role E2E visibility matrix.
4. Agent 12 — direct-client boundary and tenant/role review.
5. Agent 01 — changeset and roadmap reconciliation.

## Acceptance criteria

- One active diary entry per tenant/project/day; same client request replay is
  idempotent and changed payload is rejected.
- Every read and write is tenant/project scoped, membership checked at the
  transaction boundary, and audited; direct client table access is denied.
- Draft updates use optimistic versioning; submitted entries are immutable.
- The project route exposes URL-persisted date/status filters and capability-
  gated create/edit/submit controls with truthful Core-unavailable errors.

## Explicit limits

This slice does not add attachments, GPS, timesheets, schedule links, HSE
incident investigations, or QA/QC hold points. Those require separate contracts
and evidence.

→ Handoff to Agent 04. Inputs: this scope and existing project-RFI tenant/audit
conventions. Expected output: schema, additive migration, RLS, and static tests.

## Implementation status

- [x] Agent 04 — schema, migration, indexes, RLS, immutable-submit trigger, audit trigger, static tests.
- [x] Agent 05 — shared contracts and Core list/create/update/submit routes with idempotency and optimistic concurrency.
- [x] Agent 03 — authenticated route, filters, pagination, forms, loading/error boundaries, Core-only server actions, and opt-in E2E matrix.
- [x] Agent 12 — direct-client/role review represented by restrictive migration and protected boundary tests; live ACL/BYPASSRLS verification remains a release gate.
- [x] Agent 01 — changeset and residual limits recorded.

→ Handoff to Agent 01. Reason: bounded daily diary slice is implemented; HSE incidents, timesheets, and QA/QC require separate product contracts. Inputs: schema, Core routes, Web route, tests, and changeset. Expected output: roadmap reconciliation and next-slice handoff.
