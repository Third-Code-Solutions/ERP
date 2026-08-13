# Provider spend guard

## Purpose

Prevent an accidental paid build or deployment while Third Code ERP is still
reconciling hosted Supabase data. This runbook is source and CI policy only;
it does not query a billing API and never changes provider settings.

## Controls

- `apps/web/vercel.json` must keep `git.deploymentEnabled=false`.
- Workspace `package.json` files and GitHub workflows must not contain Vercel
  deploy commands (`vercel deploy`, `vercel --prod`) or Railway deploy
  commands (`railway up`, `railway deploy`, `railway redeploy`).
- `plan:controlled-release` treats the spend report as a required component.
  Missing or failed spend evidence blocks the aggregate plan even when
  `/ready` is green.

## Validation

```powershell
node scripts/verify-vercel-spend-guard.mjs
pnpm test:provider-spend-guard
pnpm test:controlled-release-plan
node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs --json
```

The controlled plan is read-only. It does not apply SQL, enable feature flags,
create a Vercel/Railway deployment, or change billing settings. A green spend
component is necessary but not sufficient: database parity, duplicate-data
mapping, audit recovery, rollback, protected canary, exact SHA/provider
identity, and explicit owner spend approval remain required.

## Recovery

If the guard fails, stop. Remove the deploy command or restore the disabled
Vercel Git setting, rerun the focused tests, then rerun the controlled planner.
Do not bypass the guard with a manual provider action while hosted release gates
are review-required.
