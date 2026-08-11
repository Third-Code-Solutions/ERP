# Customer invoice reversal authority

## Scope

`POST /v1/finance/customer-invoices/:invoiceId/reverse` cancels an issued
customer invoice and posts one reversing journal. Core owns authorization,
idempotency, invoice state, journal reversal, and semantic audit.
Python/AI cannot reverse or finalize an invoice.

## Safety controls

- Keep `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED=false`.
- Keep `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS` empty.
- Require a verified JWT and `finance.issue_invoice` capability.
- Require a strict reason, posting date, and opaque `Idempotency-Key`.
- Resolve invoice and actor membership within the authorized tenant; conceal
  cross-tenant invoice ids as 404.
- Let PostgreSQL own fiscal-period, posted-journal, reversal-linkage, balance,
  and state constraints in one transaction.
- A replay returns the durable result; a changed command under the same key
  conflicts; a second key cannot create another reversal or audit event.

## Local verification

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run `
  integration/customer-invoice-reverse.http.integration.spec.ts --reporter=dot
```

M3.250 static checks pass, but the focused runtime canary was not run because
the disposable PostgreSQL/Redis lane was unavailable. Do not treat a skipped
guarded suite as hosted readiness or deployment approval.
