# M3.253 Supplier Bill post HTTP canary

## Scope

Protected evidence for the existing Core supplier-bill posting command. No
production selector, schema migration, browser adoption, or provider state was
changed.

## Changed

- `apps/api/integration/supplier-bill-post.http.integration.spec.ts`
- `apps/api/src/finance/supplier-bill-post.service.ts`
- architecture and operations milestone notes

The rollback-only canary uses two tenants, finance/viewer identities,
tenant-scoped purchase-order and supplier-bill fixtures, Nest JWT/capability
guards, the Core service, and transaction-bound PostgreSQL. It asserts strict
body/header handling, auth/RBAC, disabled fail-closed behavior, cross-tenant
concealment, idempotent replay/key conflict, posted bill state, balanced
journal lines, semantic audit, tenant isolation, and outer rollback.

The service preflights and locks the tenant-scoped supplier bill before audit
or request-ledger claim, so a cross-tenant id is concealed as 404 without a
composite-FK side effect.

## Evidence

- focused runtime canary: 1/1 PASS on local PostgreSQL 17/Redis 7.4.9;
- API integration: 48/48 files, 62 PASS, 2 explicit Redis-restart opt-in
  skips under `--testTimeout=15000`;
- API typecheck, root lint, and production build: PASS;
- provider-spend, Supabase parity, database-release, Web/DB boundary, workflow
  action-reference, and actionlint gates: PASS;
- no hosted Supabase SQL/data, Storage, Railway/Vercel deployment, provider
  setting, credential, or paid action.

This disposable evidence is not hosted readiness or deployment approval. Keep
supplier-bill posting writes disabled until hosted parity, release identity,
readiness, protected browser evidence, rollback, and spend gates pass.

## Release boundary

Keep `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED=false` and
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS` empty.

Source evidence SHA:
`87dc8247f233e8bfc66ba4f56115c269204a6c66` (pushed under `kurtgav`).
