# Managed Supabase parity and release gate

## Purpose

Use this runbook to distinguish a repository migration-ledger check from a
fresh provider observation. The two are not interchangeable.

## Current repository record

The machine-checked record retains the dated 2026-08-22 hosted snapshot in
[`../operations/managed-supabase-parity-plan.json`](../operations/managed-supabase-parity-plan.json):

- target `aqqrtkmtcsfkbyyqxowv` (`ERP`);
- PostgreSQL 17;
- 157 recorded hosted migrations through `20260901141949`;
- 172 source migrations through `20260912142153`, with a 15-migration
  source-only suffix relative to that dated snapshot;
- zero recorded duplicate Purchase Order groups;
- production promotion remains gated by the protected workflow.

The source-only claim-authority batch adds `20260912130031` and
`20260912131004`; it does not update the recorded hosted count or head. Its
batch-level `hostedApplyApproved=false` explicitly requires fresh approval,
backup/PITR and Storage recovery evidence, and isolated restore/migration
rehearsal. The historical top-level approval is not approval for this new batch.
Preflight the retention index's size and lock impact and release the Core and
legacy Web retention guards together. Recovery retains client privilege denials
and the index; roll forward or disable attachment submission rather than restore
unsafe grants. Privileged database-owner lifecycle operations remain an explicit
administrative boundary.

The dependent source-only KYC artifact batch adds `20260912142153`, also with
`hostedApplyApproved=false`. It preserves existing evidence and foreign keys,
closes direct client artifact mutations and identified account/opportunity
deletion paths, and removes the remaining user-table TRUNCATE privilege.
Authenticated reads, account/opportunity business edits and controlled
privileged user deletion remain unchanged. Apply the same backup, Storage,
restore, index/lock and integrated application gates as the claim batch. Local
privilege tests are not evidence of a production restore.

Run the local source-consistency check before changing any migration or parity
documentation:

```powershell
pnpm test:managed-supabase-parity-plan
pnpm verify:managed-supabase-parity-plan
```

It does not contact Supabase and does not prove the current target is still at
that boundary. The snapshot must be refreshed through an authorized read-only
provider plan before a release decision.

## Hard stop

- Do not apply SQL, repair migration history, mutate Storage, deploy Vercel or
  Railway, or change a provider environment from this runbook alone.
- Do not report a dated observation as a current provider check.
- Keep `hostedApplyApproved=false` until the accountable production-change
  approval explicitly says otherwise.
- Keep tenant allowlists and write selectors closed until the authenticated
  release evidence below exists.

## Required release evidence

1. Fresh read-only target verification with project identity, migration ledger,
   PostgreSQL major version, and duplicate Purchase Order preflight recorded.
2. Backup/PITR and Storage recovery evidence plus an isolated restore drill.
3. A zero-skip database/API integration lane against an isolated target.
4. Tenant isolation, RLS, privilege, audit-chain, financial total, and
   authenticated browser-flow verification.
5. Verified Vercel, Railway, and Supabase credentials; exact release SHA;
   rollback path; and approved spend ceiling.

Follow [`database-release.md`](./database-release.md) and the guarded release
workflow only after all of those conditions are satisfied.

## Historical evidence

Older 55-migration and migration-gap material is retained in dated changesets,
blockers, and architecture records. It is audit history, not a current target
claim.
