# Free self-hosted CI

## Purpose

GitHub-hosted jobs are currently blocked before startup by the organization
billing state. This repository therefore has a manual, ephemeral, self-hosted
verification lane that uses the developer-owned Windows machine and consumes no
GitHub-hosted runner minutes.

The existing `.github/workflows/ci.yml` remains the preferred hosted lane when
the account restriction is removed.

## Security boundary

- Repository must remain private.
- Only `kurtgav` can dispatch the workflow.
- Workflow has `contents: read` permission.
- No pull request, push, or fork event can start the local runner.
- The runner is repository-scoped, ephemeral, and deleted after one job.
- The runner is never installed as a Windows service.
- No production database, Supabase, Vercel, Railway, or application secrets are
  supplied to the job.
- PostgreSQL and Redis bind only to `127.0.0.1`.
- Test database is always `erp_self_hosted_ci`.
- Workflow uploads no artifacts.

Do not add `pull_request`, `pull_request_target`, or public-repository triggers
to this workflow.

## Prerequisites

- GitHub CLI authenticated as `kurtgav`.
- Node.js 22 and pnpm 10.
- WSL distribution `ThirdCodeERP-Test`.
- The distribution contains Alpine Linux and PostgreSQL 17.
- Git is available inside WSL. Redis 7.4.9 is checksum-pinned and built once by
  the database-lane script.

## Run

Push the target branch first. Then:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/ci/run-ephemeral-github-runner.ps1 `
  -Ref agent-02/third-code-erp-landing
```

The script verifies the active GitHub identity and private repository, downloads
GitHub Actions Runner 2.336.0, validates its SHA-256 digest, registers a unique
ephemeral runner, dispatches the manual workflow, waits for the result, removes
any remaining registration, and deletes the local runner work directory.

## Required green evidence

The workflow must pass:

1. locked dependency install;
2. Actionlint and pinned-action reference checks;
3. lint, typecheck, unit tests, and database release-planner tests;
4. clean replay of all migrations into PostgreSQL 17;
5. every database test with zero skips;
6. Nest transaction-boundary integration;
7. before/after schema fingerprint equality;
8. production build;
9. native Nest health, readiness, Redis/database, and unauthenticated-write
   smoke checks;
10. full-history Gitleaks scan.

Compilation alone is not release evidence.

## Rollback

1. Cancel the workflow run in GitHub.
2. Stop `run.cmd` if it is still present.
3. Delete the repository runner from GitHub **Settings > Actions > Runners** if
   automatic deregistration did not complete.
4. Run `scripts/ci/stop-wsl1-database-lane.ps1`.
5. Remove `.github/workflows/ci-self-hosted.yml` and the runner scripts in a
   rollback commit if this lane is no longer wanted.

This CI alternative does not change runtime traffic. Keep
`ERP_PROJECT_WRITES_VIA_API=false` until the full M1 canary gate is approved.
