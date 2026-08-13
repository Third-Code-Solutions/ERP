# Customer invoice issue authority

## Scope

`POST /v1/finance/customer-invoices/:invoiceId/issue` creates official
receivable and revenue evidence. Core owns authorization, idempotency,
posting, invoice state, and semantic audit. Python/AI cannot issue or finalize
an invoice.

## Safety controls

- Keep `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED=false`.
- Keep `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS` empty.
- Require a verified JWT and `finance.issue_invoice` capability.
- Require a strict posting date and opaque `Idempotency-Key`.
- Resolve invoice and actor membership within the authorized tenant; conceal
  cross-tenant invoice ids as 404.
- Let PostgreSQL own the journal, fiscal-period, account, invoice-linkage,
  and balance constraints in one transaction.
- A replay returns the durable result; a changed command under the same key
  conflicts; no second journal or audit event is allowed.

## Local verification

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run `
  integration/customer-invoice-issue.http.integration.spec.ts --reporter=dot
```

The M3.249 focused canary passed 1/1. The full API integration lane passed
44/44 files and 58 tests, with two Redis-restart tests skipped unless the
explicit restart opt-in is supplied. Do not treat this disposable evidence as
hosted readiness or deployment approval.
