# Quality hold points / IWR

## Objective

Add the first Core-authoritative QA/QC slice for execution projects: a tenant-scoped
hold-point and inspection-work-request register with an auditable lifecycle from
planned → ready → submitted → accepted/rejected. Preserve the existing punchlist
surface; punchlist creation and plan-document pinning are a follow-on handoff once
their API contract is explicit.

## Ownership

- Database/schema: Agent 04 — `quality-hold-points` table, migration, RLS, constraints, audit trigger.
- API/backend: Agent 05 — Core routes, transaction membership, optimistic concurrency, state machine, audit.
- UX/UI: Agent 02/03 — project quality route, capability-aware forms, loading/error/accessibility states.
- E2E/security: Agent 12 — protected boundary and opt-in seeded-role matrix; live PostgreSQL verification remains a release gate.

## Invariants

- Every row carries `tenant_id` and a composite tenant/project/user foreign key.
- Core API is the only supported mutation authority; direct client table access is revoked and RLS is forced.
- `client_request_id` makes retried creates idempotent; conflicting reuse returns 409.
- Version is checked in every mutation; stale writes return 409.
- Accepted records are immutable evidence; rejected records can be prepared for reinspection.
- Every mutation writes semantic audit data plus the database audit trigger.
- No attachments, plan binary pinning, or automatic punchlist creation in this bounded slice.

## Expected output

Schema/migration, shared Zod contracts, protected Nest routes, project quality UI,
focused unit/integration tests, opt-in all-demo-role E2E, changeset, and a clear
live-verification note.

## Verification status

Implemented and locally verified. Shared-types, database, Core API, Web focused
tests, source lint, and E2E TypeScript compilation pass. Full Web typecheck remains
blocked only by pre-existing generated `.next/types` imports for unrelated routes;
live PostgreSQL ACL/RLS, running-service browser journeys, and real demo-account
E2E remain release-gate checks.

→ Handoff to Agent 01 after verification. Reason: roadmap reconciliation and next
slice selection remain product authority work.
