# M3.4 — SCM issuance and supplier delivery outbox

Date: 2026-08-02  
Source commits: `21a152d`, `52b6288`  
CI run: `30735228348`

## Scope

- Move the Purchase Order `scm_issue` transition into the Nest authority
  boundary while preserving the closed-by-default web compatibility seam.
- Record supplier email intent in a tenant-scoped, idempotent outbox and
  delivery table; dispatch through BullMQ with retry/dead-letter recovery.
- Stamp provider idempotency and delivery evidence in the official audit trail.
- Preserve the existing visible button, copy, layout, and legacy fallback until
  an owner-approved tenant canary is enabled.

## Files changed

- `apps/api/src/auth/capability.guard.ts`
- `apps/api/src/procurement/purchase-order-workflow.service.ts`
- `apps/api/src/procurement/purchase-order-workflow-notifications.ts`
- `apps/api/src/procurement/notification-email.service.ts`
- `apps/api/src/procurement/notification-delivery.{constants,queue,processor,service}.ts`
- `apps/api/src/procurement/*.spec.ts`
- `apps/api/integration/purchase-order-workflow.database.integration.spec.ts`
- `apps/web/src/app/(dashboard)/procurement/actions.ts`
- `apps/web/src/app/(dashboard)/purchase-orders/[id]/po-status-actions.tsx`
- `packages/database/src/schema/{enums,index,purchase-order-supplier-email-deliveries}.ts`
- `packages/shared-types/src/erp-api/{procurement,purchase-orders}.ts`
- `supabase/migrations/20260802110000_purchase_order_supplier_issuance.sql`

## Verification

- API: 27 files / 129 tests passed.
- Database: 20 files / 121 tests passed; local disposable-DB tests remain
  credential-gated.
- Shared types: 9 files / 119 tests passed; web: 54 files / 326 tests passed.
- Lint, typechecks, production build (78/78 routes), actionlint, gitleaks, and
  diff checks passed.
- CI `30735228348` passed all executable jobs, including fresh Postgres 17
  replay/schema diff and Nest transaction integration/container smoke. E2E
  remained credential-gated.

## Release boundary

Source-only. No hosted Supabase SQL, Railway/Vercel deployment, provider
setting, feature flag, queue, or business-data mutation was performed. The
read-only planner remains `review_required`: hosted ledger 55/65 with ten
pending migrations, one 12-record duplicate Purchase Order group, and no
approved `AUDIT_RECOVERY_TENANT_ID`.
