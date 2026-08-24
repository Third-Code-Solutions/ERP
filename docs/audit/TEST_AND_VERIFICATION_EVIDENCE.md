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
| Upload reservation cleanup lane | PASSED | API document-domain Vitest from `apps/api` | 20 files / 125 tests; global bounds, terminal-only predicate, exact-path removal, retry/exhaustion, indeterminate max-attempt recovery, scheduler rollback, deadline, trace/redaction |
| Upload cleanup independent review | PASSED | Principals 3/4/5 final read-only re-reviews | Fairness, provider/finalization classification, stale ownership, max-attempt recovery, scheduler convergence and observability findings repaired |
| Core project-document writer serialization | PASSED | API document-domain and focused writer suites | 21 files / 138 tests at `4a245698`; every current Core project writer uses the shared lock; later intake repair passed 6/6 service and 11/11 boundary tests |
| Web reservation cutover | PASSED LOCALLY | focused Web Vitest, full Web Vitest, controlled Playwright | 6 files / 228 focused; 159 files / 1,022 full at `145098f0`; controlled browser 5/5; selectors remain off |
| Issuance readiness and exact selectors | PASSED | Core-client and upload-sign route Vitest | Core client 176/176; route 13/13; wildcard=false through real helpers and mismatch fails before Core/DB/Storage/audit |
| Generated report writer cutover | PASSED | weekly/inspection/proposal Vitest | Final failure matrix 3 files / 19 tests; project-linked metadata uses Core intake; pre-project inspection remains quota-exempt |
| Project quota cross-session matrix | PASSED | pinned disposable PostgreSQL 16 integration | 1 file / 3 tests; real lock waits; reservation/reservation and reservation/intake both orders at the exact 500 MiB boundary; no skip path |
| Document opportunity/project invariant | PASSED | pinned PostgreSQL 16 verifier plus database Vitest | Legacy preflight, nullable/mismatch/reparent/cascade, collision, exact catalog, and two-session schedule pass; 2 files / 10 tests and DB typecheck pass |
| Upload reconciliation authority | PASSED LOCALLY | focused API Vitest and API typecheck | 5 files / 133 tests; report-only classification, bounded scans, durable BullMQ rollover checkpoint, sanitized trace evidence, and no inferred legacy deletion |
| Upload reconciliation indexes | PASSED | database Vitest/typecheck plus pinned PostgreSQL 16 verifier | 8/8 tests; terminal/completed partial indexes are valid/ready and selected by the reconciliation query plans |
| Core full-suite snapshot | PASSED | pre-AUD-004-wave `pnpm test` snapshot | 188 files / 821 tests; later Core changes are evidenced by the scoped reservation, cleanup, writer and intake rows above, not by another recorded full Core rerun |
| Web post-fix full suite | PARTIAL | affected-workspace snapshot at `145098f0` | 159 files / 1,022 passed; later report commits have a focused 19/19 matrix, not a recorded full Web rerun |
| DocuSeal provider-ID correlation | PASSED | focused Web Vitest + full Web suite | Distinct ID/slug persisted for BOM/VO/COC; 12/12 focused |
| Post-fix API/Web typecheck and lint | PASSED | root workspace scripts | Independently rerun after final fixture correction |
| Python worker frozen tests | PASSED | `uv run --frozen --extra dev pytest -q` in each worker | AI 8/8; CAD 22/22 with one upstream Starlette/httpx deprecation warning; CAD deterministic digest fixed at `9c7ef2bb610b87471bccd101d412b71bde8714cdb6268462765e8ad916a76644` |
| Python worker clean-build reproducibility | PASSED LOCALLY | two `docker build --pull --no-cache` builds and smokes per worker | Both builds passed from unchanged source; Python 3.12.14 and UID 10001 in all smokes; CAD also proved LibreDWG 0.13.4 |
| Python worker SBOM identity | PASSED | Docker Scout 1.24.0 SPDX comparisons | Excluding only the top-level image tag: AI 75 dependencies / zero diffs; CAD 81 dependencies / zero diffs; independent review found no secret or local-path match |
| Python worker vulnerability scans | PASSED | fail-closed Docker Scout high/critical SARIF | Both scans exited zero with no vulnerable package detected; final images include `sqlite-libs=3.53.4-r0` |
| Python worker CI contract | PASSED LOCALLY / NOT RUN ON GITHUB | `verify:python-worker-artifacts`, actionlint, action-reference reachability | Static gates and independent DevOps review passed; immutable CI actions verified; branch has not been pushed and the job has no GitHub run artifact yet |
| Database audit-coverage runtime gate | BLOCKED | `pnpm verify:audit-coverage` | Requires disposable `DATABASE_URL`; no hosted database was substituted |
| Live Core basic health | PASSED | `/health`, `/ready` | 200; readiness reported DB and Redis `ok` |
| Live Process registration | FAILED | compare `/v1/today` and `/v1/process/health` | Known route 401; Process route 404 — AUD-002 |
| Workbook privacy/provenance | PARTIAL | read-only artifact-tool scan | 108 business rows / 85 hashed accounts / 66 remarks; owner decision pending |
| GitHub repository visibility | FAILED | `gh repo view` | Public repository contains AUD-007 workbooks |
| Main branch protection | FAILED | GitHub branch-protection API | HTTP 404: branch not protected |
| Production environment protection | FAILED | GitHub environments API | Workflow environment has no protection rules/policy |
| Baseline hosted promotion | PARTIAL | Actions run `32583433713` | GitHub passed; Core provider deploy was a legitimate watched-path `SKIPPED`, and workflow did not assert live identity |
| Targeted AUD-004 migration replay | PASSED | two pinned PostgreSQL 16 package verifiers | Reservation ledger/RLS/grants and opportunity/project correlation migrations pass independently |
| Full repository migration-ledger/hosted replay | NOT RUN | disposable full Supabase lane | Targeted AUD-004 migrations passed; the complete migration ledger and hosted target were not replayed |
| Supabase security advisors | FAILED/PARTIAL | authenticated linked CLI readback | 10 WARN + 1 intentional INFO; leaked-password protection disabled; helper warnings need design review |
| Supabase performance advisors | FAILED | authenticated linked CLI readback | 466 items: 342 unindexed FKs, 122 unused indexes, 1 duplicate-index WARN, 1 info |
| Provider 24-hour error spot-check | PASSED/PARTIAL | Vercel/Railway logs | No 5xx/error-level events; does not prove alerts/SLOs |
| Production artifact identity | FAILED | GitHub/Railway/Vercel metadata + live health | Core identifies older source; health lacks revision; workflow has no convergence assertion |
| Rollback automation/drill | FAILED/BLOCKED | workflow + run `32581336124` | Failed E2E left partial release; no automatic rollback or current drill evidence |
| Trusted-PR duration | FAILED | Actions run `32582890004` | ~10 minutes vs repository objective <8 minutes |
| Controlled local reservation browser E2E | PASSED | controlled Playwright fixture | 5/5 under Node 22/local Chrome |
| Hosted authenticated/provider canary | BLOCKED | exact-tenant hosted target | Provider bucket/direct-browser readback, release identity, credentials, and canary approval remain unavailable |
| Snyk/Semgrep/Trivy | NOT RUN | required by AGENTS | Jobs are absent from current CI — AUD-011 |
| GitHub branch CI | NOT RUN | PR checks | Branch not yet pushed |
| Production promotion | NOT RUN | ADR-020 workflow | Release-blocking P1 findings remain |

The first typecheck attempt used the wrong child pnpm from the workstation and is
not repository evidence; it was corrected by prepending the pinned Node runtime.
The first full post-fix test run found one stale ERP Core client fixture for the
new durable DocuSeal result shape. Only that fixture was corrected; its 171-test
file and the full monorepo suite then passed. No failed/blocked/skipped check is
represented as green.
