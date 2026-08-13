# Free self-hosted CI

## Purpose

GitHub-hosted jobs are currently blocked before startup by the organization
billing state. This repository therefore has a manual, short-lived self-hosted
verification lane that uses the developer-owned Windows machine and consumes no
GitHub-hosted runner minutes.

The existing `.github/workflows/ci.yml` remains the preferred hosted lane when
the account restriction is removed.

## Security boundary

- The current `Third-Code-Solutions/ERP` repository is public, so the
  transient GitHub-runner path is not eligible: its script intentionally
  refuses to attach a self-hosted runner to a public repository. Do not change
  repository visibility or attach a runner without explicit owner approval.
  If the repository later becomes private under an approved policy, retain all
  controls below.
- Only `kurtgav` can dispatch the workflow.
- Workflow has `contents: read` permission.
- No pull request, push, or fork event can start the local runner.
- The runner is repository-scoped, started for one job, and explicitly stopped,
  deregistered, and erased immediately afterward.
- The runner is never installed as a Windows service.
- No production database, Supabase, Vercel, Railway, or application secrets are
  supplied to the job.
- PostgreSQL and Redis bind only to `127.0.0.1`.
- Test database is always `erp_self_hosted_ci`.
- Workflow uploads no artifacts.
- Workflow does not upload a dependency cache. The developer-owned machine
  already retains its pnpm store; remote cache storage is unnecessary.

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

For the current public repository, run the local lane directly without
registering a GitHub runner:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/ci/run-wsl1-database-lane.ps1 `
  -Distribution ThirdCodeERP-Test
```

The current-source lane passed on 2026-08-13. It uses only the disposable WSL
PostgreSQL/Redis services and does not contact GitHub or production providers.

If the repository is later made private with explicit approval, push the target
branch first, then use the transient runner flow:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/ci/run-transient-github-runner.ps1 `
  -Repository '<github-owner>/<repo>' `
  -Ref agent-02/third-code-erp-landing
```

The script verifies the active GitHub identity and private repository, downloads
GitHub Actions Runner 2.336.0, validates its SHA-256 digest, registers a unique
short-lived runner, waits for it to become online, dispatches the manual
workflow, waits for the result, removes the registration, and deletes the local
runner work directory.

If Windows retains a transient handle, the script erases runner credentials
first and warns that the non-secret work directory needs a later cleanup retry.
Confirm GitHub runner count, local runner-process count, and credential-file
count are all zero before treating security cleanup as complete.

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

This CI alternative does not change runtime traffic. Project updates are
already Core-only; a self-hosted pass does not authorize hosted deployment,
tenant canary, or a direct-database rollback writer.
