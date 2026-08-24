# Test and Verification Evidence

- Source baseline: `175eb35a5e40301e2dc82bd0414992633664c6fc`
- Evidence start: 2026-08-24 Asia/Singapore
- Required local runtime: Node 22.23.2, pnpm 10.33.0

| Check | Status | Command/evidence | Notes |
| --- | --- | --- | --- |
| Git baseline | PASSED | fast-forward `main`; branch from `175eb35a` | Initial tree clean; audit files now intentionally dirty |
| Runtime | PASSED | `node --version`; `pnpm --version` | Official Node 22.23.2 runtime; pnpm 10.33.0 |
| Locked install | PASSED | `pnpm install --frozen-lockfile` | Lifecycle-enabled and `--ignore-scripts` runs; no lock drift |
| Typecheck | PASSED | `pnpm typecheck` | 5/5 tasks under required runtime; independently rerun after all source changes |
| Lint | PASSED | `pnpm lint` | Root ESLint gate passed |
| Unit/integration suite | PARTIAL | monorepo run + final affected-workspace rerun | 2,468 passed; 162 DB-backed skipped because no disposable `DATABASE_URL` |
| Production build | PASSED | `pnpm build` | API webpack + Next 15.5.23; 116 pages |
| Actionlint | PASSED | `pnpm ci:actionlint` | actionlint 1.7.12 verified artifact |
| Workflow action refs | PASSED | `pnpm verify:workflow-action-refs` | Pinned refs resolved |
| Documentation authority | PASSED | `pnpm verify:doc-authority` | 16/16 source-authority assertions |
| Type-safety static gate | PASSED | `pnpm verify:type-safety` | Independent rerun scanned 1,467 source files |
| App Router boundary | PASSED | `pnpm verify:app-router-boundaries` | 116 pages |
| Build/ops invariants | PASSED | `pnpm verify:build-ops-invariants` | Static release invariants passed |
| Secret scan | PASSED | `pnpm ci:gitleaks` | 810 commits / ~19.32 MB; no leaks detected |
| Production dependency audit | PASSED | `pnpm audit --prod --audit-level low` | No known vulnerabilities |
| All dependency audit | PASSED | `pnpm audit --audit-level low` | No known vulnerabilities |
| AI worker tests | PASSED | worker venv `pytest -q` | 8/8; venv is Python 3.13 and not authoritative image runtime |
| CAD worker tests | PASSED | worker venv `pytest -q` | 21/21; one Starlette/httpx deprecation warning |
| AI worker image | PASSED | Docker build + import smoke | `ABI OPS AI Worker` imported |
| CAD worker image | PASSED | Docker build + import smoke | LibreDWG 0.13.4; `ABI OPS CAD Parser` imported |
| Process remediation targeted | PASSED | API Vitest AppModule + Process source | 3 files / 13 tests independently rerun by orchestrator |
| Scope/embedding remediation targeted | PASSED | Web Vitest exact changed tests | 3 files / 15 tests independently rerun by orchestrator |
| DocuSeal/e-sign Core targeted | PARTIAL | focused API Vitest | 100 passed; 1 database integration case skipped |
| Scope/e-sign/AI Web targeted | PASSED | focused Web Vitest | 36/36 passed |
| Shared signing contracts targeted | PASSED | focused shared-types Vitest | 8/8 passed |
| Upload reservation migration/contracts | PASSED | database/shared focused Vitest + migration verifier | Additive ledger, RLS/grants, constraints, exact bigint quota helper and 9 shared contract cases |
| Upload reservation Core authority | PASSED | API focused Vitest from `apps/api` | 8 files / 186 tests: reserve/sign races, complete/release, Storage, auth, observability, environment and intake regression |
| Upload reservation API typecheck/lint | PASSED | API `tsc --noEmit`; scoped ESLint | Exit 0 after final lifecycle fixes; no manifest/lock drift |
| Upload reservation independent review | PASSED | Principal 4 final re-review | Two defect cycles repaired; final bodyless, replay-race and oversized-object review PASS |
| Core post-fix full suite | PASSED | final `pnpm test` Core task | 188 files / 821 tests |
| Web post-fix full suite | PARTIAL | final affected-workspace rerun | 157 files / 982 passed; 2 database-backed files skipped |
| DocuSeal provider-ID correlation | PASSED | focused Web Vitest + full Web suite | Distinct ID/slug persisted for BOM/VO/COC; 12/12 focused |
| Post-fix API/Web typecheck and lint | PASSED | root workspace scripts | Independently rerun after final fixture correction |
| Database audit-coverage runtime gate | BLOCKED | `pnpm verify:audit-coverage` | Requires disposable `DATABASE_URL`; no hosted database was substituted |
| Live Core basic health | PASSED | `/health`, `/ready` | 200; readiness reported DB and Redis `ok` |
| Live Process registration | FAILED | compare `/v1/today` and `/v1/process/health` | Known route 401; Process route 404 — AUD-002 |
| Workbook privacy/provenance | PARTIAL | read-only artifact-tool scan | 108 business rows / 85 hashed accounts / 66 remarks; owner decision pending |
| GitHub repository visibility | FAILED | `gh repo view` | Public repository contains AUD-007 workbooks |
| Main branch protection | FAILED | GitHub branch-protection API | HTTP 404: branch not protected |
| Production environment protection | FAILED | GitHub environments API | Workflow environment has no protection rules/policy |
| Baseline hosted promotion | PARTIAL | Actions run `32583433713` | GitHub passed; Core provider deploy was a legitimate watched-path `SKIPPED`, and workflow did not assert live identity |
| Database migration replay | NOT RUN | disposable Postgres/Supabase lane | No disposable database configured locally |
| Supabase security advisors | FAILED/PARTIAL | authenticated linked CLI readback | 10 WARN + 1 intentional INFO; leaked-password protection disabled; helper warnings need design review |
| Supabase performance advisors | FAILED | authenticated linked CLI readback | 466 items: 342 unindexed FKs, 122 unused indexes, 1 duplicate-index WARN, 1 info |
| Provider 24-hour error spot-check | PASSED/PARTIAL | Vercel/Railway logs | No 5xx/error-level events; does not prove alerts/SLOs |
| Production artifact identity | FAILED | GitHub/Railway/Vercel metadata + live health | Core identifies older source; health lacks revision; workflow has no convergence assertion |
| Rollback automation/drill | FAILED/BLOCKED | workflow + run `32581336124` | Failed E2E left partial release; no automatic rollback or current drill evidence |
| Trusted-PR duration | FAILED | Actions run `32582890004` | ~10 minutes vs repository objective <8 minutes |
| Authenticated browser E2E | BLOCKED | isolated hosted Playwright target | Credentials/isolated data target unavailable locally |
| Snyk/Semgrep/Trivy | NOT RUN | required by AGENTS | Jobs are absent from current CI — AUD-011 |
| GitHub branch CI | NOT RUN | PR checks | Branch not yet pushed |
| Production promotion | NOT RUN | ADR-020 workflow | Release-blocking P1 findings remain |

The first typecheck attempt used the wrong child pnpm from the workstation and is
not repository evidence; it was corrected by prepending the pinned Node runtime.
The first full post-fix test run found one stale ERP Core client fixture for the
new durable DocuSeal result shape. Only that fixture was corrected; its 171-test
file and the full monorepo suite then passed. No failed/blocked/skipped check is
represented as green.
