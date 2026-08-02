# M3.12 — Delivery receipt authority

## Scope

Move only the delivery `recordReceipt` transition behind a NestJS command.
Keep site preparation, inspection, acceptance, cancellation, visible panel
copy, and layout unchanged.

## Source changes

- Added strict delivery receipt command/result contracts.
- Added `delivery_workflow_requests` with tenant-composite foreign keys,
  idempotency hash/result checks, forced RLS, and service-only privileges in
  `20260802140000_delivery_receipt_workflow_idempotency.sql`.
- Added `POST /v1/procurement/deliveries/:deliveryScheduleId/receipt` with
  membership/RBAC, row locking, allowed-state validation, receipt stamps,
  replay, and semantic audit in one transaction.
- Added closed-by-default API/Next selectors and one stable browser retry key.
  Selected core failures fail closed without invoking the legacy writer.

## Validation

- Shared 127/127, API 157/157, Web 363/363 local tests.
- Database migration contract passed; disposable delivery integration is
  explicit-gate skipped locally without `DATABASE_URL`.
- Workspace lint/typecheck, Next 78-route build, Nest build, Actionlint,
  Gitleaks, release-plan tests, and diff checks passed.

## Release boundary

No hosted SQL, Supabase data, feature flag, Railway deployment, or Vercel
deployment was performed. Source migration 68 remains pending against hosted
Supabase 55/68. Duplicate Purchase Order cleanup, audit-recovery ownership,
readiness, exact SHA, rollback, and spend approval remain required before any
canary or provider action.
