# Security release gate runbook

## Purpose

This runbook governs the security checks required before an ABI OPS production
promotion. It does not authorize a deployment, a provider change, an exception,
or a weakened check.

## Required evidence

For the exact immutable `main` commit selected for release, the **Required
security gates** workflow must show successful, non-skipped jobs for all of:

1. `Gitleaks secret scan` — full repository history.
2. `Snyk dependency scan` — every detected locked dependency project.
3. `Semgrep SAST scan` — source scan with Semgrep's community rules.
4. `Trivy filesystem scan` — vulnerabilities, secrets, and misconfiguration.

The workflow uses read-only repository permissions and immutable third-party
action/image references. A scanner finding, unavailable scanner, failed image
pull, missing credential, cancelled job, or skipped job is a failed release
gate. Do not substitute a local success or a previous run from another commit.

## Snyk prerequisite

`SNYK_TOKEN` is a required repository Actions secret. The workflow first
asserts that it exists and then passes it only as an environment variable to
the Snyk container; it must never appear in a command argument, report,
artifact, source file, or release note.

Do not create a Snyk account, purchase a plan, change billing, or add a token
as part of a release. If the owner has not provisioned a valid token, the Snyk
job must fail and promotion remains blocked.

## Release procedure

1. Agent 13 identifies the normal merge commit on `main` and confirms all
   preflight/rollback evidence for that exact commit.
2. Run or obtain the Required security gates workflow for that commit. Preserve
   the run URL and the four job outcomes without exposing provider secrets.
3. Agent 12 verifies that all four jobs passed and that the production workflow
   still has its protected-environment, source-identity, data-boundary,
   migration, tenant/RLS, and audit controls intact.
4. Only after a dated Agent 12 PASS may Agent 04 start the separately
   authorized, explicitly read-only production schema/migration parity stage.

## Stop conditions

Stop and retain **NO-GO** when any required job is red, unavailable, skipped,
or tied to a different commit; when the production environment lacks its
approval/branch protection; when a self-hosted runner is not independently
accepted; or when current tenant-isolation/audit evidence is absent. Never
disable, conditionalize, or mark a scanner `continue-on-error` to unblock a
release.
