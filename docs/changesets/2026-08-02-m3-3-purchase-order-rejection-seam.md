# M3.3 — Purchase Order rejection seam

Date: 2026-08-02  
Source commit: `16904f0`  
CI run: `30733959058`

## Scope

- Extend the existing Nest Purchase Order workflow state machine to reject
  from `pending_scm_issuance` as well as PM and Commercial pending states.
- Preserve tenant/status/role validation in the Next Server Action while
  routing allowlisted tenants to Nest; keep the legacy path closed-by-default.
- Carry a stable browser retry key and rejection reason through the command.
- Extend the notification outbox constraint with a forward-only migration.
- Keep SCM issuance and supplier email dispatch legacy until the external side
  effect is represented by a server-owned, idempotent outbox contract.

## Files changed

- `apps/api/src/procurement/purchase-order-workflow.service.ts`
- `apps/api/src/procurement/purchase-order-workflow-notifications.ts`
- `apps/api/src/procurement/purchase-order-workflow-notifications.spec.ts`
- `apps/api/integration/purchase-order-workflow.database.integration.spec.ts`
- `apps/web/src/app/(dashboard)/procurement/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/actions.workflow.test.ts`
- `apps/web/src/app/(dashboard)/purchase-orders/[id]/po-status-actions.tsx`
- `packages/database/src/__tests__/notification-outbox.test.ts`
- `supabase/migrations/20260802100000_purchase_order_workflow_scm_rejection.sql`

## Verification

- Web: 54 files / 326 tests passed.
- API: 27 files / 127 tests passed.
- Database: 20 files / 120 tests passed; 137 local integration tests remain
  explicitly skipped without disposable credentials.
- Workspace typecheck, lint, production build (78/78 routes), actionlint,
  gitleaks, workflow-reference checks, migration files-only verification, and
  diff checks passed.
- CI passed all executable jobs, including fresh Postgres 17 replay/schema
  diff, no-skip database tests, Nest transaction integration/container smoke,
  and production build. E2E remained credential-gated.

## Release boundary

Source-only. No hosted Supabase SQL, Railway/Vercel deployment, provider
setting, feature flag, queue, or business-data mutation was performed. The
read-only planner remains `review_required` with 55/64 hosted migrations,
nine pending versions, one 12-record duplicate Purchase Order group, and no
approved `AUDIT_RECOVERY_TENANT_ID`.
