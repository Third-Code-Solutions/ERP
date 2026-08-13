# M3.136 - Project update fallback guard

Date: 2026-08-07
Source commit: `5a44ce8`
Provider state: unchanged

## Change

- require a tenant-backed profile and `project.update` before target reads;
- apply the shared Project status-transition policy to Core and compatibility
  paths;
- use the profile tenant for compatibility predicates and semantic audit;
- reject terminal status reopens before any write;
- add focused capability-denial and terminal-reopen regressions.

## Validation

- focused Web Project action tests: 4/4;
- serial workspace tests: shared 27/229, database 47/51 files with 141
  compatibility skips, API 112/480, Web 89/583;
- production build: Next 81/81 routes and Nest compile;
- typecheck, lint, migration verifier, Actionlint, Gitleaks,
  controlled-release 5/5, provider-spend 4/4.

## Boundary

This is compatibility hardening, not full migration. The non-canary fallback
still writes directly and does not yet inherit Core membership locking,
idempotency, optimistic concurrency, or transaction-bound audit semantics.
No Supabase SQL, Vercel deployment, Railway deployment, feature flag, or
hosted tenant data changed. Keep provider actions closed until the fallback is
migrated and hosted parity/backup/rollback/identity/audit/spend gates clear.
