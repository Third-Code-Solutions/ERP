---
title: "M3.67: inventory item policy command boundary"
status: "implemented"
date: "2026-08-05"
---

Added the smallest inventory setup write seam: a tenant-scoped Nest
`PATCH /v1/inventory/items/:materialItemId/configuration` command for setting
the base UOM and perpetual-stock flag. The transaction rechecks membership and
`inventory.manage`, locks the tenant-scoped UOM and item, preserves the
database stock-identity trigger, writes the semantic audit diff, and is
idempotent as a state setter. The command and Next adapter are disabled by
default behind exact feature flags and tenant allowlists. Existing direct
server-action behavior remains the compatibility path.

No Supabase migration, hosted data action, Vercel build/deploy, or Railway
provider setting changed in this changeset.
