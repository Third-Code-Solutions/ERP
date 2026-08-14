# WO-02 audit coverage blocker

## Current status — superseded 2026-08-14

The historical 71/86 coverage result below is no longer current. The
read-only verifier now reports **170/170 tenant-scoped tables** with exactly
one enabled audit trigger:

```text
node --env-file=apps/web/.env.local scripts/verify-audit-coverage.mjs
```

This resolves the audit-trigger coverage finding. It does not by itself clear
audit-hash recovery, production demo-data boundaries, or the remaining
provider/owner release gates.

## Status

BLOCKED for the database half of WO-02. The read-only verifier found 71 of 86
tenant-scoped application tables with exactly one enabled `audit_*` trigger.

Missing coverage:

`cortex_conversations`, `cortex_edges`, `cortex_messages`, `cortex_nodes`,
`cortex_provenance`, `documents`, `embeddings`, `financial_sequences`,
`notification_deliveries`, `notification_outbox`, `po_line_items`,
`project_comments`, `scope_items`, `users`, and `vendors`.

## Evidence

- `node --env-file=apps/web/.env.local scripts/verify-audit-coverage.mjs`
- Result: `Audit coverage: 71/86 tenant-scoped tables`
- Hosted migration ledger has 55 applied versions; the current local workspace
  has 56 migrations and provider-linked `origin/main` has 124. The previously
  observed 55/55 equality was a historical snapshot, not current source parity.

## Required before DDL

1. Provision a disposable/staging database with a verified restore path.
2. Design an additive migration with one trigger per missing mutable table and
   preserve the append-only `audit_log` rules.
3. Replay the full migration ledger and run cross-tenant, mutation, audit-chain,
   rollback, and provider-advisor checks.
4. Apply to the hosted target only after the recovery and staging gates pass.

The design proposal is now at
`docs/proposals/2026-08-12-wo-02-audit-calendar.sql` and passes
`pnpm test:wo-02-sql-proposal`. Creating the Supabase disposable branch is the
next external step; Supabase reports a recurring cost of `$0.01344/hour`, so
explicit confirmation is required before provisioning it.

No hosted DDL, audit row, or production data was changed during this check.
