# Reconciliation Checklist

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
