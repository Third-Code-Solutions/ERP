# Supplier Bill post authority

## Scope

`POST /v1/finance/supplier-bills/:supplierBillId/post` posts one draft
supplier bill through Core. Core owns authorization, tenant/bill scope,
purchase-order controls, fiscal period, control accounts, journal creation,
internal numbering, idempotency, and semantic audit. Python/AI cannot post,
approve, or finalize a supplier bill.

## Safety controls

- Keep `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED=false`.
- Keep `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS` empty.
- Require a verified JWT and `finance.post` capability.
- Require strict posting date and opaque `Idempotency-Key`.
- Lock and resolve the tenant-scoped bill before audit or request-ledger claim;
  conceal cross-tenant bill ids as 404.
- Require the database posting function to enforce draft status, issued PO,
  three-way controls, open fiscal period, exact centavo totals, and balanced
  journal lines.
- A replay returns the durable result; changed commands under the same key
  conflict; the semantic status-change audit is written once.

## Local verification

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run `
  integration/supplier-bill-post.http.integration.spec.ts --reporter=dot
```

M3.253 focused runtime passes 1/1 on disposable PostgreSQL 17/Redis 7.4.9;
the API integration lane passes 48/48 files and 62 tests with two explicit
Redis-restart skips under the explicit 15-second timeout. Do not treat
disposable evidence as hosted readiness or deployment approval.
