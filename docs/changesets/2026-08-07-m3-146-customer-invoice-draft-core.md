# M3.146 - Core-only customer invoice draft creation

## Outcome

Customer invoice drafts now have one official NestJS Core command:
`POST /v1/projects/:projectId/customer-invoices`. Existing Billing and
Procurement Server Actions preserve their caller contracts but delegate all
authorization, BOM selection, exact-money calculation, invoice numbering,
idempotency, commit, and audit to Core.

## Changed surface

- Shared customer-invoice draft request/command/result contracts.
- Tenant-scoped, service-only replay ledger and migration
  `20260807130000_customer_invoice_draft_create_workflow.sql`.
- NestJS validation pipe, controller, service, module wiring, config, and
  focused tests.
- Web Core adapter, environment vocabulary, Billing/Procurement thin command
  clients, action tests, and request-observability mapping.
- Database verifier and static RLS/privilege coverage.
- Architecture and operations memory records for M3.146.

Authenticated invoice INSERT/UPDATE/DELETE privileges and legacy invoice write
policies are revoked. Flags and tenant allowlists remain closed/empty.

## Evidence

- Disposable PostgreSQL 17/Redis 7.4.9 replay: 101/101 migrations.
- Database no-skip suite: 54/54 files, 332/332 tests.
- API integration: 20/20 files, 27/27 tests.
- Redis restart/reconnect and pending recovery: passed.
- Schema SHA256 before/after: `278B8F024CED178A943B9E22FB14B9CD3BC7AEC3E339269E9DD20969B4B20843`.
- Serial workspace tests, typecheck, lint, build (81/81 routes), Actionlint,
  Gitleaks, controlled-release 5/5, and provider-spend 4/4: passed.

Source checkpoint `473eaf1d6a9ec468165520685e2718eeefea5124` is pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree were
verified.

## Open gates

No managed Supabase SQL, provider variable, Vercel build, Railway deploy, or
tenant data changed. Managed catalog/RLS/data parity, supported backup/PITR
recovery, Auth identity, audit recovery, invoice-specific runtime canary
evidence, and bounded spend approval remain required before any canary.
