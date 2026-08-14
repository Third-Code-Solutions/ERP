# ABI OPS / BUILD OPS Reconciliation Plan

## Current alignment run — 2026-08-14

### Objective

Align the three current BUILD OPS authority files, capability matrix, blocker
records and deployed-release evidence with observed source and live production.
Close every source-verifiable inconsistency. Keep missing ABI artifacts,
business decisions, tenant identity and human sign-off fail-closed.

### Acceptance criteria

- [x] `docs/PRD.md`, `docs/PROMPTS.md` and `docs/BUILD_OPS_AGENTS.md` agree on
  authority hierarchy, version and machine-versus-human verification.
- [x] Current capability matrix records the deployed Web revision, Core status,
  auth-protected dashboard behavior, current audit coverage and open gates.
- [x] Historical blocker records distinguish resolved evidence from remaining
  external blockers; no stale release claim presents as current.
- [x] An executable authority-document verifier passes.
- [x] Focused source contracts, typecheck, build, live health and browser smoke
  pass after changes.
- [ ] External gates remain explicitly `BLOCKED` until exact source or owner
  evidence exists; no fabricated ABI template, approval matrix or tenant ID.

### Ordered slices

1. Reconfirm current source, provider identity and unauthenticated live route.
2. Reconcile authority wording, versions and current capability/release evidence.
3. Add a small verifier preventing future authority drift.
4. Run focused and broad local checks; review diff.
5. Push and deploy only the verified change set; recheck live health/browser.
6. Publish final audit with `PASS`, `FAIL`, `BLOCKED` and `NOT RUN` boundaries.

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

## Enterprise hardening run — 2026-08-14

### Bounded objective

Move the current product toward a defensible multi-company release by fixing the
observed release-gate failures first, then addressing the highest-risk production
data, runtime, and UI defects. “11/10” is treated as a quality target, not as a
claim that can be proven by one build or deployment.

### Acceptance criteria

- [ ] The two currently failing main-branch CI checks are reproduced, root-caused,
  fixed without weakening tenant or security controls, and pass locally.
- [ ] The release path fails closed when E2E/demo markers or unauthorized test
  identities are present in a production tenant; it never deletes data implicitly.
- [ ] Every production-data action has an exact target, dry-run/report, backup or
  restore evidence, and a reversible manifest. Missing ABI tenant/retention policy
  remains BLOCKED rather than guessed.
- [ ] The slow BOM route has a measured, source-backed remediation or remains an
  explicit performance defect with a regression budget and test.
- [ ] Changed backend/API/UI behavior has focused regression coverage, typecheck,
  lint, build, and relevant browser evidence.
- [ ] Only a verified, authorized release target is deployed; post-deploy health,
  protected routing, console, network, and rollback identity are recorded.

### Ordered increments

1. **Release-gate recovery:** reproduce `Unit Tests` and `Database Reproducibility`
   failures from main CI; fix the contract and add regressions.
2. **Production safety boundary:** add read-only contamination detection and
   promotion guards; inventory seed/test-account paths; do not purge hosted data.
3. **Runtime performance:** trace the BOM loading waterfall and remove avoidable
   serial work while preserving auth, tenant, and empty/error states.
4. **Enterprise UX/API hardening:** address only defects proven by source/runtime
   evidence, with one vertical slice per commit.
5. **Release verification:** run focused→full local gates, protected browser role
   evidence when authorized, exact provider identity checks, then deploy only if
   all applicable gates are green.

### Stop conditions

- A fix would weaken RLS, authorization, audit immutability, validation, or CI gates.
- Production cleanup needs an unresolved tenant identity, retention policy, backup,
  or delete/move manifest.
- A requested feature contradicts PRD authority or requires an unapproved schema or
  provider change.

### Current baseline

- Branch: `agent-13/ci-green-release-20260814` at `5e950866`.
- Worktree: clean before this run.
- Live web/core/CAD health: previously observed healthy, but hosted protected parity
  and production-data cleanliness remain unverified/failed boundaries.
- Release replay `31818071628`: Actionlint, Secret Scan, Lint, Type Check,
  Unit Tests, BUILD OPS Invariants, Database Reproducibility (Postgres 17), and
  Build passed. E2E remained skipped by workflow policy because this was a
  manual branch run without a configured PR E2E base URL.

### Continuation evidence — 2026-08-15

- Branch is now at `c690f7de` plus the uncommitted documentation and test-harness
  changes in this continuation.
- PASS — full `pnpm test`: all runnable tests passed; database-backed suites that
  require disposable credentials remain explicitly skipped.
- PASS — focused RFQ controller contract: 8/8 after bounding cold Nest startup
  at 30 seconds; no production controller behavior changed.
- PASS — web TypeScript typecheck after BOM hydration parallelization.
- PASS — read-only production boundary evaluator and workflow-contract tests.
- REVIEW REQUIRED — hosted scan found two E2E-prefixed records in the foreign
  tenant `e2e-qa-20260513-foreign`; production promotion remains closed.
- NOT RUN — authenticated hosted BOM timing and post-deploy browser verification
  for this branch because promotion is blocked by the unresolved data boundary.
