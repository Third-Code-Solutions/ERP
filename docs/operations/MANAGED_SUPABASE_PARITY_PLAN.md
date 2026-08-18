# Managed Supabase parity record

## Current machine-checked record

The canonical machine record is
[`managed-supabase-parity-plan.json`](./managed-supabase-parity-plan.json).
It records a **dated, read-only** provider-ledger and source-plan observation
captured on 2026-08-17:

- Target: `aqqrtkmtcsfkbyyqxowv` (`ERP`, PostgreSQL 17).
- Recorded hosted migration ledger: 144 applied through
  `20260815100000_wo_12_site_inspection_access.sql`.
- Current source plan: 147 migrations through
  `20260817110000_explicit_server_only_rls_policies.sql`.
- Ordered pending suffix: three migrations in one review batch. The suffix is
  source-only and has not been applied to Supabase.
- Recorded duplicate Purchase Order groups: zero.
- Hosted application changes remain unapproved here:
  `hostedApplyApproved=false`.

The last committed provider-source evidence is recorded at
`b742c5d5a3d4bd696eba57aa9f7ac48fcd52bb9a`; the repository source plan is an
uncommitted worktree validated by the guard below. The record is not a claim
that the source-only suffix has been applied to the provider.

Run the repository-only guard:

```powershell
pnpm test:managed-supabase-parity-plan
pnpm verify:managed-supabase-parity-plan
```

The guard proves only that the declared applied boundary, source count, source
head, and ordered pending suffix remain internally consistent with
`supabase/migrations`. It makes no network request and cannot establish current
Supabase state, data integrity, RLS behavior, backups, credentials, or release
readiness.

## Refresh procedure

An authorized operator must obtain a fresh, read-only provider-source plan
against the exact project and preserve its redacted evidence outside the
repository. Only then may they update the dated snapshot fields, evidence
commit, and release documentation. Every refresh must retain:

1. the exact project identity and PostgreSQL major version;
2. applied/source counts and both migration heads;
3. pending suffix order and duplicate Purchase Order preflight result;
4. the evidence capture date and Git commit;
5. `hostedApplyApproved=false` unless a separate production change approval
   explicitly authorizes an apply.

## Production release gate

Parity alone is not an enterprise release decision. Before any production
database or application change, require current evidence for all of the
following:

1. an authorized fresh read-only plan matching the target project;
2. backup/PITR and isolated restore-drill evidence, including Storage recovery;
3. zero-skipped database and API integration checks against an isolated target;
4. tenant-isolation, RLS, privileges, audit-chain, financial-reconciliation,
   and authenticated browser-flow evidence;
5. validated provider credentials, exact deployment identity, rollback path,
   and an approved spend ceiling.

The deployment and database-release runbooks remain the execution authority for
those operations. Do not use this source-consistency guard as a substitute for
them.

## Historical record

The historical 55-migration source-gap and duplicate-Purchase-Order snapshots
remain in dated changesets and blocker records for audit traceability. They are
not current state and must not be copied into release status reports.
