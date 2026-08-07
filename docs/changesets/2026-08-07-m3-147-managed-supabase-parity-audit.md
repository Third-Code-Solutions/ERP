# M3.147 - Managed Supabase parity audit

## Read-only findings

- Project `aqqrtkmtcsfkbyyqxowv`: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.121,
  region `ap-northeast-2`, PAVI Pro organization.
- Managed migration ledger: 55 migrations through
  `20260729233017_notification_outbox_foundation`.
- Source migration ledger: 101 migrations; 46 later migrations are not
  applied remotely, including the customer-invoice draft workflow.
- Managed catalog: 88 public tables; no
  `customer_invoice_draft_create_requests`; `invoices` and `cost_entries`
  have RLS enabled.
- Security advisors: 14 notices. Performance advisors: 253 notices.
- Sampled logs: Postgres 53 rows / 8 errors; API 10 rows / 0 errors.

## Release decision

Do not apply the 46-migration set or enable a hosted canary. Recent duplicate
Purchase Order uniqueness failures and the parity gap require branch or
disposable replay, duplicate-data remediation, backup/PITR, identity, audit,
and rollback evidence first. No SQL, variables, deployments, or tenant data
were changed; no provider-spend mutation occurred.
