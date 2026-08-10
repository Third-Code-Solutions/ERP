# M3.229 — Universal search master data

## Scope

Add tenant-scoped vendor and material catalog discovery to the original Third
Code ERP Universal Search surface. This is a source-only change: no database
migration, hosted data write, deployment, or provider configuration change.

## Contract

- Core and Web share `vendor` and `material` hit types and labels.
- Procurement, commercial, and SD-PM-PE roles receive these node types through
  the existing Cortex role matrix; finance and sales remain denied.
- Core graph reads stay authoritative. The Web fallback is read-only,
  tenant-filtered, and uses existing safe routes.
- Vendor results link to `/purchase-orders`; material results link to
  `/admin/material-items`.

## Evidence

- Shared-types: 50 files / 315 tests.
- API search: 2 files / 6 tests.
- Web search and command palette: 3 files / 21 tests.
- Root test, typecheck, lint, build, spend, Web DB boundary, workflow refs,
  and diff checks: PASS.
- Disposable lane: 116 migrations; database 149/149 files and 370/370 tests;
  API 30/30 files and 45/45 tests; zero skips; schema-before/after SHA-256
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.

Expected failure-path queue logs were observed while their assertions passed.
The live landing revision remains stale relative to source and was not deployed
because Vercel/Railway spend locks are active.
