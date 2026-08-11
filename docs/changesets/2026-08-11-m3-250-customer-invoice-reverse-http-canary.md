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
- focused runtime canary: NOT RUN; `DATABASE_URL` was unavailable, so Vitest
  skipped the guarded suite, and a non-destructive WSL PostgreSQL/Redis
  restart attempt timed out;
- no hosted Supabase SQL/data, Storage, Railway/Vercel deployment, provider
  setting, credential, or paid action.

This source evidence is not a passed release canary. Restore the disposable
PostgreSQL 17/Redis 7.4.9 lane and run the focused test before enabling any
tenant or applying hosted SQL.

## Release boundary

Keep `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED=false` and
`ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS` empty. Obtain hosted
parity/security, backup/restore, readiness, exact release identity, protected
browser evidence, rollback, and spend approval before any production canary.

Source/docs release SHA:
`c2b347c78a4309da969024e481442efa235451a4` (pushed under `kurtgav`).
