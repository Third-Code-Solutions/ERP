# Reconciliation Checklist

## Current alignment run — 2026-08-14

- [x] Recheck current live `/dashboard`, auth redirect, console and requests.
- [x] Re-read current PRD, prompt pack and working agreement.
- [x] Reconcile authority wording/version and current capability matrix.
- [x] Add executable authority-document drift checks.
- [x] Re-run focused contracts, typecheck, build and live smoke after edits.
- [x] Push and deploy verified alignment changes.
- [x] Keep real ABI templates, DoA matrix, pricing decision, exact tenant
  identity and human sign-off as explicit external blockers.

- [x] Read `docs/PRD.md`, `docs/PROMPTS.md`, `docs/BUILD_OPS_AGENTS.md`, `AGENTS.md`
  and `CLAUDE.md`.
- [x] Confirm repository root, remote, branch and dirty-worktree boundary.
- [x] Inventory current Web routes, Core modules, API routes, schema/migrations,
  storage paths and hosting configuration.
- [x] Probe current Vercel, Railway API and Railway CAD health/readiness endpoints.
- [x] Refactor the three BUILD OPS Markdown authorities before code changes.
- [x] Add/update source-backed feature parity matrix and focused regressions.
- [x] Run focused WO/static/database/API/Web tests and fix scoped failures.
- [x] Run local typecheck, lint, build, full tests and browser smoke.
- [x] Recheck exact provider deployment identity, hosted migration parity and logs.
- [x] Deploy current Web/Core changes to live production; schema/RLS gates are
  green, while audit-hash and BUILD OPS data gates remain explicitly reported.
- [x] Write final audit report with exact completion state and remaining blockers.

## Enterprise hardening run — 2026-08-14

- [x] Reproduce and fix the main CI Unit Tests failure.
- [x] Reproduce and fix the main CI Postgres reproducibility failure.
- [x] Add regression coverage without weakening RLS or release safety.
- [x] Add a fail-closed production contamination/promotion guard; hosted scan
  remains blocked by two rows in the foreign E2E tenant.
- [x] Trace and improve the BOM loading path; verify source-level empty/error
  preservation and responsive auth surfaces; authenticated hosted BOM timing
  remains NOT RUN until the release boundary is clear.
- [x] Review changed diff and run focused then full gates.
- [ ] Recheck exact deployment identity and production health; deploy only if green.
- [ ] Write the enterprise hardening changeset and audit update.

## Enterprise hardening continuation — 2026-08-15

- [x] Add a fail-closed production boundary evaluator and promotion gate.
- [x] Confirm the hosted read-only scan is review-required for two foreign-tenant
  E2E rows; no production data was changed.
- [x] Parallelize independent BOM page hydration without changing tenant,
  provenance, or empty-state behavior.
- [x] Fix the RFQ creation HTTP contract false timeout under full-suite load.
- [x] Run the full monorepo test suite: all runnable tests passed.
- [ ] Obtain the exact ABI tenant cleanup/retention/backup manifest before any
  production data action or release promotion.

## Full repository audit and production repair — 2026-08-24

- [x] Read the attached request, `docs/PRD.md`, `AGENTS.md`, and applicable ADRs.
- [x] Fast-forward clean local `main` to `origin/main` and create
  `agent-01/full-repository-audit`.
- [x] Instantiate exactly five requested principal subagents, sequentially where
  ownership overlaps.
- [x] Record dependency-install and baseline quality-gate results before fixes.
- [x] Complete per-file coverage and architecture/connectivity matrices.
- [x] Challenge and consolidate all audit findings.
- [x] Remediate Critical/High findings or document exact blockers.
- [x] Independently verify fixes and negative/security cases; browser/DB cases
  remain explicitly blocked by unavailable isolated targets.
- [x] Make the release decision; do not dispatch production while gates fail.
- [x] Verify current live URLs, deployment identities, logs, and rollback targets
  read-only; do not claim the local diff is deployed.
- [x] Write the required changeset and create a local conventional commit.
- [ ] Push/open a PR only after the owner/DPO contains AUD-007 and production
  protections are approved and proven.
