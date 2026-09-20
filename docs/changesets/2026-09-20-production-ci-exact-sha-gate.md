# Production exact-SHA CI gate — 2026-09-20

## Outcome

Production promotion now fails closed before any Supabase, Railway, or Vercel
mutation unless the canonical `CI` workflow has a completed successful `push`
run on `main` for the exact `GITHUB_SHA` being promoted. The gate requires the
database reproducibility, credential-free browser, security, build, type,
lint, invariant, actionlint, and unit-test jobs to be present exactly once and
green. Pull-request-only authenticated E2E is not treated as push evidence;
the production workflow still runs its own authenticated E2E after deployment.

## Changed files

- `.github/workflows/deploy-production.yml`
  - grants read-only Actions/Checks access;
  - runs `scripts/verify-production-ci.mjs` immediately after checkout/tool
    setup, before protected credentials and provider mutation;
  - includes the gate contract in local release tests.
- `scripts/lib/production-ci-gate.mjs`
  - pure exact-SHA/run/job evidence evaluator.
- `scripts/verify-production-ci.mjs`
  - read-only GitHub CLI adapter for the canonical `ci.yml` workflow.
- `scripts/verify-production-ci.test.mjs`
  - covers success, missing/mismatched run, pending run, missing/non-green
    database/browser jobs, and duplicate evidence.
- `package.json`
  - adds `test:production-ci`.

## Verification

- `pnpm --config.engine-strict=false test:production-ci` — PASS (6/6).
- `node --check scripts/verify-production-ci.mjs` — PASS.
- `node --check scripts/lib/production-ci-gate.mjs` — PASS.
- `pnpm --config.engine-strict=false ci:actionlint` — PASS.
- `git diff --check` — PASS.

No dependency, migration, hosted data, provider configuration, merge, or
production deployment was performed.
