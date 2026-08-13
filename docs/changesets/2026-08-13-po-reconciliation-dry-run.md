# Purchase Order reconciliation dry-run

## Scope

Tested a non-destructive reconciliation candidate against disposable local
PostgreSQL 17 database `erp_po_reconcile_test`. Hosted Supabase was not used.

## Candidate algorithm

1. Partition duplicate Purchase Orders by `(tenant_id, po_number)`.
2. Order each partition by `created_at`, then `id` for deterministic ties.
3. Preserve the first number unchanged.
4. Rename later rows with bounded suffixes (`PO-0002-R02` through
   `PO-0002-R12`).
5. Preserve Purchase Order IDs and all foreign-keyed rows.
6. Apply provider migration
   `20260801090000_purchase_order_create_idempotency.sql`.

This is a candidate only. It must not be applied to hosted data until the
owner confirms business numbering semantics and approves the exact mapping.

## Local evidence

- Current workspace migration replay: 68 migrations, PASS.
- Duplicate fixture: 12 Purchase Orders, six delivery schedules, 12 line
  items.
- Duplicate groups after candidate update: 0.
- Delivery schedules after update: 6.
- Line items after update: 12.
- Provider unique index `ux_purchase_orders_tenant_po_number`: present.
- Provider idempotency table `purchase_order_create_requests`: present.
- No rows deleted; no IDs changed; hosted state untouched.
