# M3.251 Customer invoice cancellation HTTP canary

## Scope

Protected evidence for the existing Core draft customer-invoice cancellation
command. No production selector, schema migration, browser adoption, or
provider state was changed.

## Changed

- `apps/api/integration/customer-invoice-cancel.http.integration.spec.ts`
- architecture and operations milestone notes

The rollback-only canary uses two tenants, finance/viewer identities, three
draft invoices, Nest JWT/capability guards, the Core cancellation service, and
a transaction-bound PostgreSQL client. It asserts strict empty-body/header
handling, auth/RBAC, disabled fail-closed behavior, concealed cross-tenant
access, draft-to-cancelled transition, idempotent replay/key conflict,
semantic audit, tenant isolation, and outer rollback.

## Evidence

- focused runtime canary: 1/1 PASS on local PostgreSQL 17/Redis 7.4.9;
- API integration: 46/46 files, 60 PASS, 2 explicit Redis-restart opt-in
  skips;
- API typecheck, root lint, and production build: PASS;
- no hosted Supabase SQL/data, Storage, Railway/Vercel deployment, provider
  setting, credential, or paid action.

This disposable evidence is not hosted readiness or deployment approval.
Keep cancellation writes disabled until hosted parity, release identity,
readiness, protected browser evidence, rollback, and spend gates pass.

## Release boundary

Keep `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED=false` and
`ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS` empty. Posted invoices
must use the separate reversal authority.

Source/docs evidence SHA:
`7459cb8d70e50851d82f7562bdc6fb1ac6bd51a5` (pushed under `kurtgav`).
