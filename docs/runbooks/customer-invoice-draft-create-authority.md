# Customer invoice draft-create authority

## Scope

`POST /v1/projects/:projectId/customer-invoices` creates one draft customer
invoice from strict billing inputs. Core owns authorization, tenant/project
scope, approved-BOM selection, centavo calculations, invoice numbering,
idempotency, and semantic audit. Python/AI cannot create, approve, issue, or
finalize an invoice.

## Safety controls

- Keep `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED=false`.
- Keep `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS` empty.
- Require a verified JWT and `finance.issue_invoice` capability.
- Require strict billing percent, optional BOM id, due date, notes, and opaque
  `Idempotency-Key`.
- Lock and resolve the tenant-scoped project before audit or request-ledger
  claim; conceal cross-tenant project ids as 404.
- Require an approved BOM when a BOM is supplied; reject draft BOMs.
- Calculate billing/retention/VAT/EWT/net amounts in integer centavos inside
  the Core transaction; never accept browser money totals or invoice numbers.
- A replay returns the durable result; changed commands under the same key
  conflict; the create audit event is written once.

## Local verification

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run `
  integration/customer-invoice-draft-create.http.integration.spec.ts --reporter=dot
```

M3.252 focused runtime passes 1/1 on disposable PostgreSQL 17/Redis 7.4.9;
the API integration lane passes 47/47 files and 61 tests with two explicit
Redis-restart skips under the explicit 15-second timeout. Do not treat
disposable evidence as hosted readiness or deployment approval.
