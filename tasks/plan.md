# ABI OPS / BUILD OPS Reconciliation Plan

## Objective

Refactor the three BUILD OPS Markdown authorities against current ERP source,
then close safe feature gaps across frontend, backend, routing, API, storage,
hosting and deployment. Preserve existing production-facing routes and tenant,
audit, migration and release controls.

## Acceptance criteria

- `docs/PRD.md`, `docs/PROMPTS.md` and `docs/BUILD_OPS_AGENTS.md` contain no
  interactive go-ahead/wait instructions for repository work and no stale claims
  that contradict current source.
- Current Web/Core/API/Storage/hosting surfaces and retained legacy compatibility
  features are documented with clear source-backed versus provider-backed status.
- Each missing in-scope feature found by the audit is implemented as a focused
  vertical slice with automated regression coverage, or marked BLOCKED with exact
  missing evidence.
- Local static, unit, API/database, typecheck, lint, build and relevant browser
  gates pass, or failures are reported with root cause.
- Live Vercel/Railway health and exact release identity are checked. Deployment or
  hosted mutation is claimed only when observed in this task.
- Final audit reports PASS, FAIL, BLOCKED or NOT RUN for every relevant gate.

## Ordered work

1. Baseline repository, dirty-worktree boundary, current source feature inventory,
   migration head and live HTTP/browser evidence.
2. Refactor three authority Markdown files. Add changeset and run documentation
   contradiction/format checks.
3. Map WO-00 through WO-18 to source, tests, migrations, routes and changesets.
   Reuse existing implementation; implement only confirmed missing gaps.
4. Run focused gates, then full local gates. Fix failures in scoped code while
   preserving unrelated dirty work.
5. Verify Vercel Web, Railway Core/CAD, Supabase migration/readiness, storage and
   protected boundaries. Deploy only through exact configured targets when release
   gates pass and task authorization covers it.
6. Review diff and write final audit changeset/report.

## Known external boundaries

- Real ABI Excel templates and real Togal export are not present in repository;
  WO-09/Togal real-file acceptance cannot be claimed without them.
- ABI Delegation-of-Approval matrix is not confirmed; keep routing configurable and
  cutover closed until source evidence exists.
- Commercial spreadsheet margin sign-off and President-level meeting acceptance are
  human evidence, not unit-test substitutes.
- Hosted provider state can diverge from source; health 200 alone is not release
  parity.
