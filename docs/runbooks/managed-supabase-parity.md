# Managed Supabase parity and release gate

## Current read-only baseline

Target project: `aqqrtkmtcsfkbyyqxowv` (`ERP`). The last connector audit found
`ACTIVE_HEALTHY`, PostgreSQL 17.6.1.121, 55/117 migrations applied through
`20260729233017`, 62 ordered source migrations pending, and 88 public tables
with RLS enabled. Supabase advisors reported 11 security WARNs and one
performance WARN.

## Hard stop

- Do not run `supabase_apply_migration`, `supabase_execute_sql`, a Storage
  mutation, Vercel deploy, or Railway deploy while spend protection is active.
- Keep `docs/operations/managed-supabase-parity-plan.json` at
  `hostedApplyApproved=false`.
- Keep ERP write selectors and tenant allowlists closed.
- Do not treat `ACTIVE_HEALTHY`, RLS enabled, or a successful build as proof of
  schema parity or production readiness.

## Required approval sequence

1. Capture a supported backup and restore it into a disposable PostgreSQL 17
   target; fingerprint before/after and verify audit-chain recovery.
2. Reconcile duplicate Purchase Orders and confirm an audit-recovery tenant.
3. Review the ordered 10-batch suffix; never skip or partially apply it.
4. For each approved batch, verify migration ledger, table/index/FK state, RLS
   and privileges, advisor deltas, and rollback evidence.
5. Verify Railway readiness, exact deployed SHA, protected browser smoke, and
   spend budget before a single tenant canary.

## No-cost local checks

```powershell
pnpm verify:managed-supabase-parity-plan
pnpm test:provider-spend-guard
pnpm test:database-release-plan
```

The connector audit is read-only evidence. It does not authorize applying the
62 pending migrations or deploying a new build.
