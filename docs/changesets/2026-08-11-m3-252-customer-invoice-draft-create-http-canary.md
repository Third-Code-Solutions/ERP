# M3.252 Customer invoice draft-create HTTP canary

## Scope

Protected evidence for the existing Core customer-invoice draft-create
command. No production selector, schema migration, browser adoption, or
provider state was changed.

## Changed

- `apps/api/integration/customer-invoice-draft-create.http.integration.spec.ts`
- `apps/api/src/finance/customer-invoice-draft-create.service.ts`
- architecture and operations milestone notes

The rollback-only canary uses two tenants, finance/viewer identities, scoped
projects, approved/draft BOMs, a tenant-B invoice fixture, Nest
JWT/capability guards, the Core service, and transaction-bound PostgreSQL. It
asserts strict body/header handling, auth/RBAC, disabled fail-closed behavior,
cross-tenant project concealment, BOM status rules, exact billing/tax/
retention calculation, idempotent replay/key conflict, invoice/request-ledger
linkage, semantic audit, tenant isolation, and outer rollback.

## Evidence

- focused runtime canary: 1/1 PASS on local PostgreSQL 17/Redis 7.4.9;
- API integration: 47/47 files, 61 PASS, 2 explicit Redis-restart opt-in
  skips under `--testTimeout=15000`;
- API typecheck, root lint, and production build: PASS;
- default 5-second parallel attempt had one unrelated Cortex timeout; the
  isolated Cortex suite passed 1/1;
- no hosted Supabase SQL/data, Storage, Railway/Vercel deployment, provider
  setting, credential, or paid action.

The canary found and fixed a real cross-tenant ordering defect: Core now
preflights the locked tenant-scoped project before audit or request-ledger
claim, returning concealed 404 instead of a composite-FK 500.

This disposable evidence is not hosted readiness or deployment approval.
Keep draft-create writes disabled until hosted parity, release identity,
readiness, protected browser evidence, rollback, and spend gates pass.

## Release boundary

Keep `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED=false` and
`ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS` empty.

Source/docs evidence SHA:
`47cfe8bb0ea0388b9e2807c4a454198061ea1249` (pushed under `kurtgav`).
