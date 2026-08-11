# M3.250 Customer invoice reversal HTTP canary

## Scope

Protected source evidence for the existing Core customer-invoice reversal
command. No production selector, schema migration, browser adoption, or
provider state was changed.

## Changed

- `apps/api/integration/customer-invoice-reverse.http.integration.spec.ts`
- architecture and operations milestone notes

The rollback-only canary uses two tenants, finance/viewer identities, an
issued invoice with a real original journal, fiscal-period and ledger-account
fixtures, Nest JWT/capability guards, the Core reversal service, and a
transaction-bound PostgreSQL client. It asserts strict body/header handling,
auth/RBAC, disabled fail-closed behavior, concealed cross-tenant access,
invalid reason, idempotent replay/key conflict, cancelled invoice linkage,
balanced posted reversal journal, semantic audit, tenant isolation, and
outer rollback.

## Evidence

- API typecheck: PASS;
- root lint: PASS;
- focused runtime canary: 1/1 PASS on local PostgreSQL 17/Redis 7.4.9;
- API integration: 45/45 files, 59 PASS, 2 explicit Redis-restart opt-in
  skips;
- API typecheck, root lint, and production build: PASS;
- no hosted Supabase SQL/data, Storage, Railway/Vercel deployment, provider
  setting, credential, or paid action.

This disposable evidence is not hosted readiness or deployment approval.
Keep the production selector closed until hosted parity, release identity,
readiness, protected browser evidence, rollback, and spend gates pass.

## Release boundary

Keep `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED=false` and
`ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS` empty. Obtain hosted
parity/security, backup/restore, readiness, exact release identity, protected
browser evidence, rollback, and spend approval before any production canary.

Source/docs evidence update SHA:
`d2e8edf352be9feb39562d66a983c49565792c44` (pushed under `kurtgav`).
