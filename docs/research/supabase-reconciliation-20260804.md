# Supabase reconciliation — 2026-08-04

## Scope

Read-only reconciliation of the configured production target
`aqqrtkmtcsfkbyyqxowv`. No SQL, data, Storage object, migration history, or
provider setting was changed.

## Verified provider state

- Project status: `ACTIVE_HEALTHY`; PostgreSQL 17.6.
- Hosted migration ledger: 55 rows, head `20260729233017_notification_outbox_foundation`.
- Repository migration ledger: 87 files; 32 ordered migrations are pending.
- Supabase main branch status: `MIGRATIONS_FAILED`.
- Branch-action logs identify the first failing file as
  `20260801090000_purchase_order_create_idempotency.sql`. Its preflight
  correctly stops because tenant `2b2b039c-b066-412b-af4c-564f2af6097e` has
  12 `purchase_orders` rows sharing `PO-0002`.
- Public catalog: 88 tables; every public table has RLS enabled. Three tables
  have no policies: `financial_sequences`, `notification_outbox`, and
  `notification_deliveries`.
- Storage: one private `documents` bucket, 37 objects, four Storage policies.

## Security/performance observations

Supabase advisors returned 14 security findings (11 warnings, 3 informational)
and 282 performance findings (148 unindexed foreign keys, 132 unused indexes,
one duplicate tenant index warning, and one Auth connection-allocation notice).
Security warnings include the `vector` extension in `public`, executable
`SECURITY DEFINER` functions through anonymous/authenticated RPC roles, and
leaked-password protection configuration. These are review items, not an
authorization to mutate production.

## Release decision

Do not apply the 32-file suffix, hand-edit migration history, reset the
protected branch, or rename/delete duplicate purchase orders automatically.
The duplicate group contains issued and pending records; a repair must first
identify the canonical record, preserve linked lines/documents/audit evidence,
and be approved as a recoverable data operation.

## Exact next gate

1. Obtain a supported recoverable backup/restore point and export the duplicate
   purchase-order group plus dependent rows.
2. Decide and document the canonical-number/data-repair policy with the owner.
3. Execute one audited, reversible repair migration through the supported
   provider path; verify row counts, links, RLS/policies, Storage, and audit
   continuity.
4. Resume the ordered migration suffix from `20260801090000`, stopping on the
   first new failure. Only then review a tenant-scoped Nest mutation canary.
