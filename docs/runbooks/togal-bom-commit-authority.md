# Togal BOM Commit Authority

## Scope

`POST /api/bom/togal-commit` keeps its existing browser response contract.
For an explicitly canaried tenant, it delegates to:

```text
POST /v1/procurement/boms/togal-commit
Idempotency-Key: <client-generated key>
```

NestJS is authoritative for actor, tenant, capability, BOM state, catalog
references, totals, idempotency, and audit. Python/AI output remains advisory;
it cannot call this commit authority or finalize ERP state.

## Flags

Backend:

```text
ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED=false
ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS=
```

Web:

```text
ERP_BOM_TOGAL_COMMIT_VIA_API=false
ERP_BOM_TOGAL_COMMIT_VIA_API_TENANT_IDS=
```

Both flags and the same tenant UUID must match before browser delegation.
Never use `*` in production without explicit review.

## Transaction contract

1. Recheck `users` membership and `bom.generate` capability inside the
   transaction.
2. Lock BOM row with tenant predicate.
3. Claim `(tenant_id, idempotency_key)` in
   `togal_bom_commit_requests`; hash strict command payload.
4. Replay succeeded result, reject hash mismatch, or continue processing.
5. Validate optional material/vendor IDs belong to tenant.
6. Insert BOM lines, update exact-cent totals, mark replay succeeded, and
   write semantic audit evidence in one transaction.

Core errors are terminal for canary tenants. Direct Next writes remain only
for compatibility-default tenants and must not be enabled for the same tenant
as Core.

## Validation

```powershell
pnpm --filter @third-code-erp/shared-types test -- --run src/erp-api/togal-bom.test.ts
pnpm --filter @third-code-erp/database test -- --run src/__tests__/togal-bom-commit-idempotency.test.ts
pnpm exec vitest run src/procurement/togal-bom-commit.service.spec.ts src/procurement/togal-bom-commit.controller.spec.ts
pnpm exec vitest run src/app/api/bom/togal-commit/route.test.ts
node scripts/verify-database-repro.mjs --files-only
```

Do not apply `20260806140000_togal_bom_commit_idempotency.sql` to hosted
Supabase until the existing migration/parity/duplicate-data release gates
pass. No Vercel/Railway build is part of this runbook.
