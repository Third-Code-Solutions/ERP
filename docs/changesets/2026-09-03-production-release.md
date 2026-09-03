# Production release live record

- Date: 2026-09-03
- Status: PLANNED / NOT DEPLOYED
- Release owner: Agent 13 — CI/CD & Ops
- Product closure: Agent 01 — Product/PRD Guardian
- Governing handoff: `docs/handoffs/2026-09-03-production-release.md`
- Release authority: ADR-020 and `.github/workflows/deploy-production.yml`

This is an append-only release evidence template. Replace bracketed placeholders as gates
complete; retain failed attempts and superseded deployment identities instead of deleting
them. Never paste secret values, database URLs, auth tokens, or customer data.

## Source custody

| Evidence | Value | Status |
|---|---|---|
| Reviewed base | `a444ca91e8cc9673f754421541a476e29b85351d` | VERIFIED |
| Atomic input | `e06f15825c59c727057010f864036d09e935b5e1` | VERIFIED |
| Finance input | `4369a01a469572754865ec5118f6cd44a7382aff` | VERIFIED |
| Atomic integration commit | `e385321574ee66b84a459066d8e3d0bd8b40b4ea` | VERIFIED — conflict-free merge; required input is an ancestor |
| Finance integration commit | `bd1ae9cb6a0c75410b43136f3766f930779a4235` | VERIFIED — conflict-free merge; required input is an ancestor |
| AI audit repair commit | `c12440071830b0a65dd9aa527060b5136a5beb3b` | VERIFIED — 21/21 focused route tests, Web TypeScript, and focused ESLint passed under Node 22.23.2 |
| Viewer backend-policy commit | `526268377e923537f746c0a440b6ac5d4c7651e3` | PARTIAL — 68/68 shared policy/search tests and shared-types TypeScript passed; full API collection awaits release CI |
| Viewer Web/browser commit | `5821cf462a54129fae5f1749f01500c4ebc78dbb` | PARTIAL — 76/76 focused route/navigation/rendered-control tests, Web TypeScript, and focused ESLint passed under Node 22; live browser verification awaits promotion |
| Similar-items authorization repair | `9fbee9e493abdc3638cc1609985fc6bc78e9ce46` | VERIFIED — Viewer receives private HTTP 403 before provider/quota/audit/retrieval; intended Commercial access preserved; 6/6 focused route tests, Web TypeScript, and focused ESLint passed under Node 22.23.2 |
| Scope/password mutation security repair | `f0e2763a00db48d3841ec7afcb41b697e07f9798` | VERIFIED locally — Viewer scope writes are denied before DB and write+audit is transactional; password changes are server-controlled, exact-identity reauthenticated, least-privilege, redacted, and fail closed; focused 32/32, Web typecheck, lint, and diff checks passed |
| AI authorization/audit boundary repair | `b7d282a394f2825b458ee992426573f2a159ce0a` | VERIFIED — chat and similar-items require assistant-use permission before work; mandatory audit precedes quota/provider calls; failures are private and redacted; 28/28 focused tests, Web TypeScript, and focused ESLint passed under Node 22.23.2 |
| Similar-items audit-input redaction | `21d1ec8de469b4642df30f35b5f7086ccddda5bc` | VERIFIED — raw descriptions and hashes were removed from request/result audit events; only a fixed category and normalized character count remain; 7/7 focused tests and Node 22 Web typecheck passed |
| Mounted Cortex provider-mutation repair | `2c7d47590853edf14f6d683f05a3c82e5336f4d0` | VERIFIED — chat/embed use exact central capabilities and content-free mandatory audits before body/downstream provider, quota, retrieval, or write work; Viewer is denied; 24/24 focused tests and Node 22 Web typecheck passed |
| Production password verification gate | `3215861f947dbcf5b98fcd7b3205c53d465ce69b` | VERIFIED locally — protected workflow now runs the existing browser rotation/restoration harness and production authentication suite; actionlint and pinned-action reference checks passed under Node 22 |
| Production database target/recovery gate | `0940f3fcfbe5f9acf2868d0278942fdec087a6d0` | VERIFIED locally — both connection URLs are exact-project/host/database checked; the hosted ledger must already be current; migration apply is disabled while PITR is unavailable |
| Web release identity gate | `a99dfc3b0b0bce89e2f92da253368dd73b0a2833` | VERIFIED locally — Vercel receives the exact GitHub release SHA as `APP_REVISION`, and both health endpoints must return its 12-character revision before browser tests run |
| Live password-recovery request proof | `f200a0a738d40bd72ea359c927e8893dbc07a385` + `e65f3a3f07affdf38951676fcbd5c088e24656eb` | VERIFIED locally — opt-in test requires the exact production URL and Supabase host, sends one un-intercepted recovery request, persists no trace/screenshot/video, and is enabled in the protected no-skip workflow; provider execution awaits promotion |
| Independent security review | code HEAD `2c7d47590853edf14f6d683f05a3c82e5336f4d0` | GO — no P0/P1; complete mounted provider-backed POST inventory reviewed; 137/137 focused tests across 18 files, Web typecheck, dependency audits, gitleaks, actionlint, pinned-action references, and diff check passed |
| WO-11 test-fixture repair | `50bc167cc682c01115ff7a2fcd42fbbb139527a9` | VERIFIED — CI exposed an ambiguous text replacement after new legitimate scope checks; the test now targets exact AST scopes and is line-ending independent; 59/59 contract tests and 95/95 focused PPRF tests passed under Node 22.23.2 |
| Reviewed PR | `https://github.com/Third-Code-Solutions/ERP/pull/29` | IN PROGRESS — first run passed type/lint/security/invariants and exposed the repaired WO-11 test-fixture defect |
| Exact merged `main` release SHA | `[40-character sha]` | NOT RUN |
| Candidate clean status | `git status --short --branch` before push | VERIFIED after this record was committed; no uncommitted candidate changes |
| Combined diff/conflict review | Independent Agent 12 review at code HEAD `2c7d4759`; integration merges `e3853215` and `bd1ae9cb` | VERIFIED — no merge conflicts; no remaining P0/P1 |

## Defect closure

| Release blocker | Required proof | Evidence | Status |
|---|---|---|---|
| AI query audit is fail-closed | Audit failure returns typed non-success; zero provider calls/stream; successful audit is append-only, tenant/actor/project scoped, bounded and redacted | Chat 21/21 initial repair plus final combined chat/similar-items suite 28/28; both routes now audit before quota/provider work and fail with private generic 503 | VERIFIED locally |
| Viewer sees all tenant-safe reads | 11-role capability/API/navigation/direct-route/refresh evidence; Viewer allowed on every required read | Shared policy/search 68/68 and focused Viewer Web 76/76 passed; hosted 11-role matrix awaits promotion | PARTIAL |
| Viewer cannot write | No mutation controls plus direct server-action/API/service denials for representative create/update/delete/approve/issue/upload/submit/transition/admin attempts | Shared policy/search and focused Viewer Web gates passed; direct similar-items provider POST returns private 403; scope create/update/delete now deny before DB and write controls are absent; full hosted checks await promotion | PARTIAL |
| Tenant isolation | Same-tenant reads only; foreign tenant reads/writes denied independently of role | `[test/report]` | NOT RUN |
| Functional matrix closure | Candidate matrix has no non-VERIFIED row required by the all-feature/all-role release objective | `[counts/artifact]` | NOT RUN |

## Candidate quality gates

Record exact command, run URL/artifact, pass/fail/skip counts, and candidate SHA.

| Gate | Evidence | Pass | Fail | Skip | Status |
|---|---|---:|---:|---:|---|
| Locked dependency install | `[run]` |  |  |  | NOT RUN |
| Formatting/lint | Focused/full Web ESLint across repair slices; final Agent 12 focused lint | exit 0 | 0 |  | PASSED locally; full CI pending |
| Type safety | Web and shared-types TypeScript checks across repair slices | exit 0 | 0 |  | PASSED locally; full CI pending |
| BUILD OPS/static invariants | `[commands/run]` |  |  |  | NOT RUN |
| Unit/contract/integration tests | `[commands/run]` |  |  |  | NOT RUN |
| PostgreSQL 17 reproducibility | `[run/artifact]` |  |  |  | NOT RUN |
| Security: gitleaks/SAST/dependency/container | Agent 12: dependency audits clean; gitleaks scanned 1,861 commits/46.60 MB; actionlint/action refs passed | exit 0 | 0 |  | PASSED for supported local gates; protected CI pending |
| Production build/routes | `[run; route count]` |  |  |  | NOT RUN |
| 11-role browser/API matrix | `[run; role and row counts]` |  |  |  | NOT RUN |
| Critical persistence/refresh journeys | `[run; workflow counts]` |  |  |  | NOT RUN |

Known limitations or exceptions: `[none, or explicit BLOCKED item — never convert to PASS]`

## Database release preflight

| Evidence | Required value | Actual evidence | Status |
|---|---|---|---|
| Supabase identity | `aqqrtkmtcsfkbyyqxowv`; session pooler user `postgres.aqqrtkmtcsfkbyyqxowv`; port `5432` | Authenticated dashboard shows project `ERP`, branch `main`, Production; session-pooler identity remains to be rechecked by the protected workflow without printing its URL | PARTIAL |
| Read/write boundary separation | `PRODUCTION_DATABASE_URL` read-only; migration URL separately write-scoped | `[redacted policy check]` | NOT RUN |
| Source/provider parity | Ordered counts and checksums agree before apply | `[source count / provider count / checksums]` | NOT RUN |
| Pending migration review | Additive only; tenant/RLS/audit/index/constraint review complete | Candidate and currently live source `175eb35a5e40301e2dc82bd0414992633664c6fc` have the identical `supabase/migrations` tree `d7ae4988fa0165dcc69fb60b95f249d72168811a`; exact-target dry-run must still prove zero pending migrations | PARTIAL |
| Exact-target dry-run | No unexpected or destructive statement | Workflow enforces exact Supabase pooler/project/database identities, requires a current production ledger, and runs a dry-run; hosted evidence awaits promotion | PARTIAL |
| Fresh PostgreSQL 17 replay | Schema rebuild, database tests, empty diff | `[run/artifact]` | NOT RUN |
| Production data boundary | Clear; only dedicated `buildops-e2e` allowlisted | `[scan artifact]` | NOT RUN |
| Backup | Provider backup ID `[id]`, created `[UTC]`, retention `[value]` | Authenticated Supabase dashboard shows latest restorable physical backup at `2026-09-02T17:24:30Z`; backup identifier is not exposed in the list view | PARTIAL |
| PITR | Coverage begins `[UTC]`, verified through planned release window `[UTC]` | Authenticated Supabase dashboard reports PITR is not enabled; workflow now blocks any pending migration and performs no apply | NOT APPLICABLE to this code-only release; BLOCKED for any database-changing release |
| Isolated restore test | Backup/PITR point `[id/UTC]` restored to `[isolated target]`; checks `[result]` | `[artifact]` | NOT RUN |
| Forward-fix/PITR authority | Agent 04 owner `[name/ref]`; integrity decision path recorded | `[approval]` | NOT RUN |

## Protected promotion authorization

- Exact `main` SHA: `[sha]`
- GitHub production-environment approver: `kurtgav` (required-reviewer rule added on 2026-09-03; self-review prevention is disabled)
- Approval timestamp (UTC): `[timestamp]`
- Workflow run URL/ID: `[url/id]`
- Dispatch reason: `[reviewed reason/change reference]`
- Required secret/variable presence check: GitHub environment/repository metadata confirms every workflow-required secret and `E2E_PROJECT_ID` name exists; values were not read or printed
- No-deploy checklist disposition: `[all clear / BLOCKED with item]`

### Pre-release rollback identities

| Surface | Exact prior deployment/revision | Health before release | Status |
|---|---|---|---|
| Vercel `thirdcode-erp` | deployment `dpl_piz7EeuK`; source `175eb35a5e40301e2dc82bd0414992633664c6fc` | `/api/health` and `/api/ready` HTTP 200 on 2026-09-03 | VERIFIED |
| Railway Core API service `c45b3d01-036a-4663-a524-0713d782fce3` | deployment `b727f219-e027-4043-ad3e-1da96008652a` | `/health` and `/ready` HTTP 200 on 2026-09-03 | VERIFIED |
| Railway CAD service `328c6650-306e-4a3c-80dc-7566e80ba86a` | deployment `d59ebaf1-00ec-42b1-ad4f-c97a26cc9cc5` | `/health` HTTP 200 with `dwg_support=true` and `evidence_only=true` on 2026-09-03 | VERIFIED |
| Database | `[backup id / PITR UTC]` | `[parity/integrity]` | NOT RUN |

## Promotion timeline

Append one row per material event; do not overwrite failed attempts.

| UTC | Workflow/job | Target | Result | Immutable ID or artifact | Notes |
|---|---|---|---|---|---|
| `[time]` | Pre-mutation gates | Candidate SHA | NOT RUN | `[artifact]` |  |
| `[time]` | Migration dry-run | Supabase `aqqrtkmtcsfkbyyqxowv` | NOT RUN | `[artifact]` |  |
| `[time]` | Additive migration apply | Supabase `aqqrtkmtcsfkbyyqxowv` | NOT RUN | `[artifact]` |  |
| `[time]` | Core deploy | Railway API service | NOT RUN | `[deployment id]` |  |
| `[time]` | CAD deploy | Railway CAD service | NOT RUN | `[deployment id]` |  |
| `[time]` | Web deploy | Vercel `thirdcode-erp` | NOT RUN | `[deployment id/url]` |  |
| `[time]` | Hosted verification | All targets | NOT RUN | `[artifact]` |  |

## Deployed identities

| Surface | Required target | Deployed identity | Revision check | Status |
|---|---|---|---|---|
| Web | `team_n60dl3ccO8BFGFeUKQdqPhp3/thirdcode-erp` at `https://thirdcode-erp.vercel.app` | `[deployment id/url]` | `[release sha/deployment identity]` | NOT RUN |
| Core API | Railway project `a21fd382-80b2-4218-8025-11f420a062e3`, service `c45b3d01-036a-4663-a524-0713d782fce3` | `[deployment id]` | `[revision]` | NOT RUN |
| CAD worker | Railway project `a21fd382-80b2-4218-8025-11f420a062e3`, service `328c6650-306e-4a3c-80dc-7566e80ba86a` | `[deployment id]` | `[revision]` | NOT RUN |
| Supabase | `aqqrtkmtcsfkbyyqxowv` | `[migration ledger after apply]` | `[checksums/count]` | NOT RUN |

## Post-deploy verification

| Check | Expected | Evidence | Status |
|---|---|---|---|
| Web `/api/health` | HTTP 200; `abi-ops-web`; exact release identity | `[response metadata]` | NOT RUN |
| Web `/api/ready` | HTTP 200; database `up`; exact release identity | `[response metadata]` | NOT RUN |
| Core `/health` and `/ready` | HTTP 200 | `[response metadata]` | NOT RUN |
| CAD `/health` | HTTP 200; `dwg_support=true`; `evidence_only=true` | `[response metadata]` | NOT RUN |
| Public surface | Landing/login/robots/sitemap/manifest and protected redirect contracts pass | `[surface artifact]` | NOT RUN |
| Authenticated 11-role matrix | All 11 supplied production test roles; no skips; Viewer reads all tenant-safe modules and cannot write | `[Playwright/API artifact]` | NOT RUN |
| Password recovery UI | Sign-in links to recovery; validation and enumeration-safe/error states work in production browser | `[Playwright artifact]` | NOT RUN |
| Profile password change | Real production account rotates and restores its original credential; every supplied role renders the profile form | `[harness/Playwright artifact]` | NOT RUN |
| AI audit failure canary | Audit rejection prevents provider invocation and returns non-success without sensitive logs | `[safe disposable proof]` | NOT RUN |
| Critical workflow persistence | In-scope successful actions persist after refresh; denied roles cause no writes | `[disposable tenant evidence]` | NOT RUN |
| Tenant isolation | Foreign-tenant reads/writes denied | `[report]` | NOT RUN |
| Runtime/browser logs | No new release-correlated P0/P1, console, page, or failed-request errors | `[time-bounded artifacts]` | NOT RUN |
| Functional matrix | Counts reconciled to hosted evidence | `[matrix artifact/counts]` | NOT RUN |

## Rollback or incident record

- Rollback triggered: `[yes/no]`
- Trigger and first failing gate: `[description]`
- Incident reference: `[url/id]`
- Writes frozen at (UTC), if applicable: `[timestamp/not applicable]`
- Vercel rollback deployment: `[id/result]`
- Railway Core rollback deployment: `[id/result]`
- Railway CAD rollback deployment: `[id/result]`
- Database disposition: `[no change / forward fix / PITR restore]`
- Backup/PITR point used: `[id/UTC/not applicable]`
- Storage reconciliation: `[result/not applicable]`
- Post-rollback health/RBAC/tenant/log evidence: `[artifacts]`
- Residual impact and follow-up owner: `[details]`

## Final release disposition

- Outcome: `NOT DEPLOYED / BLOCKED / ROLLED BACK / DEPLOYED AND VERIFIED`
- Exact released SHA: `[sha]`
- Product acceptance by Agent 01: `[GO/BLOCK and evidence]`
- Security acceptance by Agent 12: `GO at code HEAD 2c7d4759; no P0/P1; 137/137 focused security/regression tests passed`
- Database acceptance by Agent 04: `[GO/BLOCK and evidence]`
- Operations acceptance by Agent 13: `[GO/BLOCK and evidence]`
- Remaining P0/P1 findings: `[none, or explicit list]`
- Remaining limitations/P2/P3: `[explicit list]`
- Customer/management communication reference: `[link/not required]`
