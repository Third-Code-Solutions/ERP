# GitHub Actions billing prevents release verification

**Date:** 2026-08-25
**Severity:** P0 release-control failure
**Scope:** `Third-Code-Solutions/ERP` pull request #13

## Evidence

GitHub Actions runs `32831241685` and `32831241686` completed without usable
job logs. Each required job has the same GitHub annotation:

> The job was not started because recent account payments have failed or your
> spending limit needs to be increased.

Affected required checks: Actionlint, Semgrep OSS SAST, Snyk dependency scan,
and Trivy filesystem scan. The dependent CI checks were skipped. This is a
GitHub account billing/capacity condition, not source-code test evidence.

## Release impact

PR #13 is mergeable but `UNSTABLE`; it must not be merged or deployed while
the required hosted quality and security gates are red.

## Required account action

An owner or billing manager must resolve the failed payment or adjust the
GitHub Actions spending limit for `Third-Code-Solutions`. After that, rerun the
two failed workflow runs and continue only when all required checks succeed.

## Verified prerequisites already complete

- Supabase production migrations are applied.
- Production E2E data is removed and verified absent.
- The private `documents` bucket reads back at 100 MiB with the approved 18
  MIME types and denies direct anonymous uploads.
- PR #13 source revision is `444955e583892af7da9b15d0fe9c83b35c957f11` and
  its release-branch history contains neither removed workbook artifact.
