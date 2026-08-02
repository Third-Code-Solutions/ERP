# M3.10 — BOM-to-Purchase Order authority

Date: 2026-08-02
Source commit: `82d9d5092d8aeebf2e803b2937914b7356ff2f21`
CI: `30741816314`

## Delivered

- Added strict shared BOM-to-PO command/result contracts.
- Added Nest `POST /v1/procurement/purchase-orders/from-bom` with tenant/RBAC
  rechecks, row locks, exact cent calculations, PO/line provenance, BOM lock,
  semantic audit, and idempotent replay using the existing PO-create request
  table.
- Added closed-by-default Next and API canary gates plus a stable browser retry
  key. Core errors never fall back to the legacy browser writer.
- Added unit, HTTP, action/client, and disposable database integration tests.

## Compatibility and rollback

No visible UI/copy/layout changes and no database migration. With the new flags
false/empty, all tenants retain the existing Server Action. Rollback is a
source revert to the prior commit or removal of the canary environment values;
do not delete or rewrite hosted business rows.

## Release gate

Source CI is green, but no Supabase SQL, Railway deployment, Vercel deployment,
queue mutation, or production flag change is authorized. Hosted Supabase is
55/67 migrations with unresolved duplicate-PO and audit-recovery blockers.
