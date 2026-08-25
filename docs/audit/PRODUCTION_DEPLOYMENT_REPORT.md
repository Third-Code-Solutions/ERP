# Production Deployment Report

- Source baseline: `175eb35a5e40301e2dc82bd0414992633664c6fc`
- Status: `LOCAL CANDIDATE VERIFIED; HOSTED PROMOTION NOT STARTED`
- Authorized workflow: `.github/workflows/deploy-production.yml` (ADR-020)
- Public Web target: `https://thirdcode-erp.vercel.app`
- Public Core target: `https://third-code-erp-api-production.up.railway.app`
- Public CAD target: `https://abi-ops-cad-worker-production.up.railway.app`

No production mutation or deployment has occurred in this audit. The candidate
is published as PR #13 and the repository is private. Its guarded E2E cleanup,
Storage readback, migration, scanner, monitor, and promotion steps have not run
against a provider.

Local candidate verification is complete: lint, typecheck, production build,
2,718 passing tests, dependency audit, Gitleaks, actionlint, storage/boundary
helpers, and a disposable PostgreSQL 17 DocuSeal migration proof pass. Database
integration suites requiring a disposable DATABASE_URL, authenticated Sales
browser proof, and live DocuSeal/provider callbacks remain unexecuted.

## Current provider evidence

- GitHub repository: private `Third-Code-Solutions/ERP`; default branch `main`.
- Published branch and tag histories no longer contain the two workbook paths.
  GitHub Support must purge the server-side refs for twelve historical merged
  pull requests before object reclamation can be claimed.
- PR #13 Actions runs `32825026450` and `32825026609` were denied before runner
  allocation because GitHub reports failed payments or insufficient Actions
  spend. This is not source-test evidence.
- GitHub Free does not permit protections/rulesets for this private repository.
  The production environment has no protection rules or branch policy, and
  administrators can bypass it.
- Vercel project `thirdcode-erp` reports Node 22.x and the canonical production
  URL. Production environment variable names include the database, Core routing,
  Supabase, CAD and OpenAI boundaries; values were not read.
- The current public Vercel, Core, and CAD health/ready endpoints return 200,
  but they serve the prior deployment rather than PR #13. Live health does not
  establish candidate release identity.
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

## Promotion conditions

Promotion requires GitHub Actions capacity, a successful hosted PR run including
Snyk/Semgrep/Trivy, a configured Snyk token if no eligible organization secret
exists, explicit merge control, the separately confirmed exact-tenant E2E purge,
and then the deployment workflow's provider readbacks. A GitHub plan upgrade or
equivalent controlled repository is needed to enforce protected private-branch
and production-environment controls. No rollback drill has been executed.
