# Handoff: project close-out readiness evidence

## Completed

1. Shared contract and deterministic aggregation in `packages/shared-types/src/erp-api/project-closeout-readiness.ts`.
2. Tenant/project-scoped Nest service and protected route in `apps/api/src/projects/`.
3. Next direct fallback in `apps/web/src/lib/operations/project-closeout-readiness.ts`.
4. Exact-tenant Core client canary and response validation.
5. Turnover-page evidence card and all-role E2E assertion.
6. Targeted unit, API boundary, Core-client, component, lint, and package type checks.

## Explicitly deferred

- Contract-specific bond release terms and dates.
- P&L close-out workflow and SAP posting.
- Zone-level handover/occupancy rules beyond the existing evidence gate.

## Verification gap

Full web typecheck and production build pass after regenerating `.next` route types. Live database/RLS replay, authenticated browser execution, and deployment verification require configured project credentials and target infrastructure.
