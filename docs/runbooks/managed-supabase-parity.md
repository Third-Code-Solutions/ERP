# Managed Supabase parity and release gate

## Purpose

Use this runbook to distinguish a repository migration-ledger check from a
fresh provider observation. The two are not interchangeable.

## Current repository record

The machine-checked record is the dated 2026-08-17 observation in
[`../operations/managed-supabase-parity-plan.json`](../operations/managed-supabase-parity-plan.json):

- target `aqqrtkmtcsfkbyyqxowv` (`ERP`);
- PostgreSQL 17;
- 144 recorded hosted migrations through `20260815100000`;
- 147 source migrations through `20260817110000`, with an ordered three-file
  source-only suffix pending review;
- zero recorded duplicate Purchase Order groups;
- no approval for a hosted apply.

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
