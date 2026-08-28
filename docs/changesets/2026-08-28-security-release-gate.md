# Agent 12 changeset — fail-closed security release gate

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Decision:** **NO-GO** for production; no Agent 12 PASS has been issued.

## Changed controls

- Added `.github/workflows/security-scan.yml`, a separate required security
  workflow for pushes/PRs to `main` and manual dispatch.
- The workflow has independent, failing jobs for Gitleaks, Snyk, Semgrep, and
  Trivy. It uses read-only repository permissions, immutable action/image
  references, and read-only source mounts for container scanners.
- Added `docs/runbooks/security-release-gate.md`, which documents the exact
  evidence and fail-closed Snyk prerequisite. No package dependency, provider
  setting, credential, production target, database, runner, billing, merge, or
  deployment changed.

## Current release-security review

- **Production environment: FAILED.** GitHub's `Production` environment has
  zero protection rules, no deployment branch policy, and administrator bypass
  remains allowed. The current production workflow therefore lacks the required
  approval boundary.
- **Release identity/CI: FAILED.** PR #14 is still an unmerged branch, and the
  current hosted CI evidence is failed/skipped rather than a complete green run
  for an immutable `main` SHA. The Actions budget remains configured to stop
  usage. The isolated runner group has no accepted runner.
- **Hosted scanner execution: FAILED.** The workflow run for candidate commit
  `39d05056035f878024a38ebb48419c7bb6e8aab7` failed all four jobs before any
  scanner step ran, consistent with the organization-level stop-usage budget.
  GitHub did not retain a failed-job log for those jobs. This is fail-closed
  evidence only; the candidate is not an immutable `main` release commit.
- **Snyk: BLOCKED.** Accessible repository, production-environment, and
  organization Actions secret inventories have no `SNYK_TOKEN`.
  The new job intentionally fails if it remains absent; no Snyk account,
  payment, billing change, or token was created.
- **Semgrep/Trivy: BLOCKED.** Their pinned commands were attempted locally but
  Docker's Linux engine pipe was unavailable, so neither scan produced a
  passing result. This is not treated as a successful local substitute.
- **Gitleaks: PASSED locally.** Pinned Gitleaks 8.30.1 scanned 1,579 commits
  and reported no leaks. This is source evidence only, not the required hosted
  run for the release commit.
- **Tenant/audit source contracts: PASSED locally.** The database RLS policy
  contract, BUILD OPS invariants (including forced RLS and append-only audit
  checks), and production data-boundary contract passed. No current
  production-schema or authenticated-role-matrix evidence exists for the final
  release commit.
- **Production target validation: FAILED.** The preflight found that the
  deployment workflow lacks an immutable-main/green-CI assertion, its migration
  URL validation does not prove host/TLS/project identity, and its Vercel step
  mutates a production environment variable. These are Agent 13 release-control
  findings; they were not altered in this Agent 12 change.

## Verification

| Check | Status |
| --- | --- |
| `pnpm ci:actionlint` | PASSED |
| `pnpm verify:workflow-action-refs` | PASSED |
| `pnpm test:database-repro-policy-contract` | PASSED (3 tests) |
| `pnpm test:build-ops-invariants` | PASSED (15 tests) |
| `pnpm test:production-data-boundary` | PASSED (5 tests) |
| `pnpm ci:gitleaks` | PASSED (1,579 commits; no leaks) |
| Snyk dependency scan | BLOCKED — `SNYK_TOKEN` absent |
| Semgrep SAST scan | BLOCKED — local Docker Linux engine unavailable |
| Trivy filesystem scan | BLOCKED — local Docker Linux engine unavailable |
| Hosted security workflow for candidate `39d05056035f878024a38ebb48419c7bb6e8aab7` | FAILED — all four jobs failed before steps |
| Hosted security workflow for exact immutable `main` release SHA | NOT RUN / BLOCKED |

## Handoff to Agent 04 — blocked

Do **not** begin read-only production parity yet. Agent 12 cannot provide the
required PASS until the production environment is protected, an immutable
`main` release SHA has complete green CI/security evidence, a valid owner-owned
`SNYK_TOKEN` is available, the Semgrep/Trivy gates run successfully, and the
self-hosted runner path (if used) passes its independent containment review.
After those inputs exist, Agent 04 may perform only the handoff's explicitly
read-only parity report against the exact target and commit.
