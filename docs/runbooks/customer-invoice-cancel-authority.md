# Customer invoice cancellation authority

## Scope

`POST /v1/finance/customer-invoices/:invoiceId/cancel` cancels an unposted
draft customer invoice. Core owns authorization, idempotency, state change,
and semantic audit. Python/AI cannot cancel or finalize an invoice. Posted
invoices must use the reversal command.

## Safety controls

- Keep `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED=false`.
- Keep `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS` empty.
- Require a verified JWT and `finance.issue_invoice` capability.
- Require an empty strict body and opaque `Idempotency-Key`.
- Resolve invoice and actor membership within the authorized tenant; conceal
  cross-tenant invoice ids as 404.
- Let PostgreSQL enforce the unposted-draft predicate and commit state,
  request ledger, and audit in one transaction.
- A replay returns the durable result; a reused key for another invoice
  conflicts; a second key cannot cancel again or add another audit event.

## Local verification

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run `
  integration/customer-invoice-cancel.http.integration.spec.ts --reporter=dot
```

M3.251 focused runtime passes 1/1 on disposable PostgreSQL 17/Redis 7.4.9;
the API integration lane passes 46/46 files and 60 tests with two explicit
Redis-restart skips. Do not treat disposable evidence as hosted readiness or
deployment approval.
