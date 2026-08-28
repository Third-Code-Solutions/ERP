# Production release-control handoff

## Outcome

Added `docs/handoffs/2026-08-28-production-release.md`, a strict Agent 13 →
Agent 12 → Agent 04 → Agent 13 → post-deploy release sequence for PR #14's
normal-merge candidate.

## Current decision

Production remains **NO-GO**. The record preserves these current blockers:

- hosted CI run `33083718479` failed and skipped dependent jobs; earlier
  evidence identifies a GitHub Actions billing/spending condition;
- the selected ERP-only self-hosted runner group has zero runners pending the
  separate security/UAC containment decision;
- Snyk, Semgrep, and Trivy do not have current required-gate evidence;
- the final candidate has no current target-specific read-only production
  schema/migration parity report; and
- ABI O-01/O-14 plus the fractional-quantity/DUPA decision remain unresolved,
  so commercial workflow readiness cannot be claimed.

## Boundaries and verification

- PASSED: documentation-only release-control work; no code, PRD, provider,
  production, billing, runner, credential, migration, or deployment setting
  changed.
- NOT RUN: CI remediation, security scans, production parity access, provider
  preflight, promotion, rollback, and live verification. Each is deliberately
  assigned to a later owner with a fail-closed exit criterion.
