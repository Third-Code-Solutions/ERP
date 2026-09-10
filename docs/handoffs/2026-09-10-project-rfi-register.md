# Project RFI register vertical slice — 2026-09-10

## Objective

Add the first post-MVP project-level RFI register inspired by the OpenConstructionERP
workflow: tenant-safe creation, paginated list, answer/close/reopen state changes,
optimistic-concurrency protection, and an authenticated project route. This is
separate from pre-Won site-inspection RFIs and does not replace that surface.

## Ordered ownership

1. Agent 04 — add the `project_rfis` Drizzle model, additive migration, indexes,
   audit trigger, and explicit server-only RLS policy.
2. Agent 05 — add shared Zod contracts and Core project-RFI list/create/answer/
   close/reopen endpoints with authorization, idempotent create, and audit writes.
3. Agent 03 — add the `/projects/[id]/rfis` route, Core client wrappers, server
   actions, loading/error states, and accessible register UI.
4. Agent 12 — review the direct-client boundary and tenant/role matrix contracts.
5. Agent 01 — reconcile the bounded post-MVP record in the changeset.

## Implementation status

- [x] Agent 04 — tenant-scoped table, indexes, RLS, audit trigger, static authority tests.
- [x] Agent 05 — shared contracts and Core API list/create/answer/close/reopen routes with idempotency and optimistic concurrency.
- [x] Agent 03 — authenticated route, filters, pagination, loading/error states, and server actions calling Core only.
- [x] Agent 12 — static direct-client/role review represented by the restrictive migration and authority tests; live ACL/BYPASSRLS verification remains a release gate.
- [x] Agent 01 — changeset and residual release gates.

## Acceptance criteria

- Every row is tenant- and project-scoped; direct `anon`/`authenticated` table
  access is denied and Core is the only mutation authority.
- Create retries with the same client request id return one row; a hash mismatch
  is rejected.
- Answer, close, and reopen require the current row version and write semantic
  audit evidence; stale commands return conflict.
- The project route has URL-persisted filters, pagination, accessible forms,
  capability-gated mutations, and loading/error boundaries.
- Focused shared, database-static, API, Web, typecheck, and lint checks pass.

## Explicit limits

This slice does not implement submittals, transmittals, attachments, document
revisions, schedule links, or full CDE correspondence history. Those remain
separate slices requiring their own contracts and product evidence.

→ Handoff to Agent 01. Reason: this bounded slice is implemented and documented; future CDE/submittal work requires a separate product/architecture handoff. Inputs: migration, contracts, Core routes, Web route, focused verification, and changeset. Expected output: roadmap reconciliation and a new handoff for the next vertical slice.
