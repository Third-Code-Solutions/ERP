# M3.249 Customer invoice issuance HTTP canary

## Scope

Protected evidence for the existing Core customer-invoice issuance command.
No production selector, schema migration, browser adoption, or provider state
was changed.

## Changed

- `apps/api/integration/customer-invoice-issue.http.integration.spec.ts`

The canary uses two tenants, finance/viewer identities, draft invoices,
business accounts, fiscal periods, control ledger accounts, real Nest JWT and
capability guards, the Core service, and a rollback-only database transaction.

## Evidence

- focused HTTP canary: 1/1 PASS on local PostgreSQL 17;
- API integration: 44/44 files, 58 PASS, 2 explicit Redis-restart opt-in
  skips;
- API typecheck: PASS;
- root parallel test lane: not green in this runner because of nine unrelated
  API timeouts; the local budget-schema test requires
  `DATABASE_BUDGET_EXPECTED=1`;
- no hosted Supabase SQL/data, Storage, Railway/Vercel deployment, provider
  setting, credential, or paid action.

Implementation commit: `205552c29c89b1e64b72c7c2d007764e6935bd66`.
Follow-up documentation commit: `3d8bf10756bdf7fed78dac2898e64eb31637521b`
(pushed under `kurtgav`; remote SHA matched and the worktree was clean).

## Release boundary

Keep `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED=false` and
`ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS` empty. Obtain hosted
parity/security, backup/restore, readiness, exact SHA, protected browser,
rollback, and spend approval before any production canary.
