# M3.137 - Project update Core cutover

Date: 2026-08-07  
Source commit: `927a2c3`  
Provider state: unchanged

## Change

- remove direct Web `projects` writes and duplicate Web audit;
- read the current Project through tenant-scoped Core;
- verify Core-returned Project and tenant identity before mutation;
- send the Core `updatedAt` value as the optimistic-concurrency token;
- delegate all Project update policy and commit behavior to NestJS;
- encode Project IDs in Core PATCH URLs;
- cover read failure, tenant mismatch, terminal conflict, and capability denial.

## Validation

- focused Web action tests: 5/5;
- Core client tests: 116/116;
- serial workspace tests: shared 27/229, database 47/51 files with 141
  compatibility skips, API 112/480, Web 89/584;
- production build: Next 81/81 routes and Nest compile;
- typecheck, lint, migration verifier, Actionlint, Gitleaks,
  controlled-release 5/5, provider-spend 4/4.

## Boundary

Core/API or session failure now fails closed; the action does not retry through
direct SQL. No Supabase migration, hosted data write, Vercel deployment,
Railway deployment, feature-flag enablement, or provider mutation occurred.
The old `ERP_PROJECT_WRITES_VIA_API` configuration surface is now obsolete and
is tracked for cleanup after protected runtime evidence.
