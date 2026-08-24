# Production Deployment Report

- Source baseline: `175eb35a5e40301e2dc82bd0414992633664c6fc`
- Status: `CURRENT AUDIT DEPLOYMENT BLOCKED`
- Authorized workflow: `.github/workflows/deploy-production.yml` (ADR-020)
- Public Web target: `https://thirdcode-erp.vercel.app`
- Public Core target: `https://third-code-erp-api-production.up.railway.app`
- Public CAD target: `https://abi-ops-cad-worker-production.up.railway.app`

No production mutation or deployment has occurred in this audit.

Local candidate verification is complete: lint, typecheck, production build,
2,468 runnable tests, dependency audits, Gitleaks, actionlint, documentation,
type-safety, App Router and build/ops static gates pass. A disposable database,
authenticated browser target and live DocuSeal provider path were unavailable,
so their cases remain blocked/skipped rather than inferred.

## Current provider evidence

- GitHub repository: public `Third-Code-Solutions/ERP`; default branch `main`.
- Baseline CI run `32583431563` and promotion run `32583433713` succeeded for
  `175eb35a` on 2026-08-22.
- The promotion's GitHub gates all reported success, but Railway marked the Core
  provider deployment `SKIPPED` because no watched Core path changed. The no-op
  was valid for that baseline change; the workflow does not read provider status
  or prove service identity, so the deploy label is not convergence evidence.
- GitHub API currently reports `main` is not branch-protected.
- Workflow environment `production` has the required credential names, but its
  environment metadata has no protection rules or deployment branch policy.
- Vercel project `thirdcode-erp` reports Node 22.x and the canonical production
  URL. Production environment variable names include the database, Core routing,
  Supabase, CAD and OpenAI boundaries; values were not read.
- Vercel deployment `dpl_piz7EeuKvsV5XFkqW5UfZWVK6DkB` is Ready; public health
  exposes deployment revision `dpl_piz7EeuK` but no Git SHA.
- Railway Core deployment `9d5f7c2f-d33f-4a4c-84be-18d4bcfb3af3` is healthy
  but identifies source `044e09bf`; CAD deployment `d59ebaf1-00ec-42b1-ad4f-c97a26cc9cc5`
  is healthy with an image digest but no source SHA. Process remains 404.
- Linked Supabase is `ACTIVE_HEALTHY` on PostgreSQL 17.6.1.121. Current advisors
  fail the repository posture gate (10 security WARN; 342 unindexed FKs).
- Failure run `32581336124` applied migrations/deployed providers and then failed
  authenticated E2E; no automatic rollback restored the partial release.

## Rollback evidence

- Current Web rollback target: `dpl_piz7EeuKvsV5XFkqW5UfZWVK6DkB`; previous
  Ready artifact: `dpl_6BnVcioDqZ93Ep5NYKwR5heTheqU`.
- Capture current Railway Core `9d5f7c2f...` and CAD `d59ebaf1...` before a future
  promotion. The workflow does not currently automate their restoration.
- Database policy is additive forward repair. No current backup/restore or
  quarterly rollback-drill evidence was available, so rollback is documented
  but not proven.

## Release decision

Do not dispatch the workflow. AUD-007 is an active Critical confidentiality
finding; AUD-004, AUD-006 and the external portion of AUD-014 remain High product
or integration gates; AUD-021 proves VO/COC DocuSeal completion is not connected;
AUD-015 disproves the documented protected change-control assumption; and AUD-016
disproves fail-closed identity/rollback. The audit branch must not be pushed while
the public-repository data decision remains unresolved.
