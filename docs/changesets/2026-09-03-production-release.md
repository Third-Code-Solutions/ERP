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
| Atomic integration commit | `[sha]` | NOT RUN |
| Finance integration commit | `[sha]` | NOT RUN |
| AI audit repair commit | `[sha]` | NOT RUN |
| Viewer backend-policy commit | `[sha]` | NOT RUN |
| Viewer Web/browser commit | `[sha]` | NOT RUN |
| Reviewed PR | `[url / number]` | NOT RUN |
| Exact merged `main` release SHA | `[40-character sha]` | NOT RUN |
| Candidate clean status | `[command/output reference]` | NOT RUN |
| Combined diff/conflict review | `[artifact; conflicts and owner decisions]` | NOT RUN |

## Defect closure

| Release blocker | Required proof | Evidence | Status |
|---|---|---|---|
| AI query audit is fail-closed | Audit failure returns typed non-success; zero provider calls/stream; successful audit is append-only, tenant/actor/project scoped, bounded and redacted | `[test/report]` | NOT RUN |
| Viewer sees all tenant-safe reads | 13-role capability/API/navigation/direct-route/refresh evidence; Viewer allowed on every required read | `[test/report]` | NOT RUN |
| Viewer cannot write | No mutation controls plus direct server-action/API/service denials for representative create/update/delete/approve/issue/upload/submit/transition/admin attempts | `[test/report]` | NOT RUN |
| Tenant isolation | Same-tenant reads only; foreign tenant reads/writes denied independently of role | `[test/report]` | NOT RUN |
| Functional matrix closure | Candidate matrix has no non-VERIFIED row required by the all-feature/all-role release objective | `[counts/artifact]` | NOT RUN |

## Candidate quality gates

Record exact command, run URL/artifact, pass/fail/skip counts, and candidate SHA.

| Gate | Evidence | Pass | Fail | Skip | Status |
|---|---|---:|---:|---:|---|
| Locked dependency install | `[run]` |  |  |  | NOT RUN |
| Formatting/lint | `[command/run]` |  |  |  | NOT RUN |
| Type safety | `[command/run]` |  |  |  | NOT RUN |
| BUILD OPS/static invariants | `[commands/run]` |  |  |  | NOT RUN |
| Unit/contract/integration tests | `[commands/run]` |  |  |  | NOT RUN |
| PostgreSQL 17 reproducibility | `[run/artifact]` |  |  |  | NOT RUN |
| Security: gitleaks/SAST/dependency/container | `[run/artifacts]` |  |  |  | NOT RUN |
| Production build/routes | `[run; route count]` |  |  |  | NOT RUN |
| 13-role browser/API matrix | `[run; role and row counts]` |  |  |  | NOT RUN |
| Critical persistence/refresh journeys | `[run; workflow counts]` |  |  |  | NOT RUN |

Known limitations or exceptions: `[none, or explicit BLOCKED item — never convert to PASS]`

## Database release preflight

| Evidence | Required value | Actual evidence | Status |
|---|---|---|---|
| Supabase identity | `aqqrtkmtcsfkbyyqxowv`; session pooler user `postgres.aqqrtkmtcsfkbyyqxowv`; port `5432` | `[redacted verifier artifact]` | NOT RUN |
| Read/write boundary separation | `PRODUCTION_DATABASE_URL` read-only; migration URL separately write-scoped | `[redacted policy check]` | NOT RUN |
| Source/provider parity | Ordered counts and checksums agree before apply | `[source count / provider count / checksums]` | NOT RUN |
| Pending migration review | Additive only; tenant/RLS/audit/index/constraint review complete | `[review link; pending count]` | NOT RUN |
| Exact-target dry-run | No unexpected or destructive statement | `[workflow artifact]` | NOT RUN |
| Fresh PostgreSQL 17 replay | Schema rebuild, database tests, empty diff | `[run/artifact]` | NOT RUN |
| Production data boundary | Clear; only dedicated `buildops-e2e` allowlisted | `[scan artifact]` | NOT RUN |
| Backup | Provider backup ID `[id]`, created `[UTC]`, retention `[value]` | `[provider evidence]` | NOT RUN |
| PITR | Coverage begins `[UTC]`, verified through planned release window `[UTC]` | `[provider evidence]` | NOT RUN |
| Isolated restore test | Backup/PITR point `[id/UTC]` restored to `[isolated target]`; checks `[result]` | `[artifact]` | NOT RUN |
| Forward-fix/PITR authority | Agent 04 owner `[name/ref]`; integrity decision path recorded | `[approval]` | NOT RUN |

## Protected promotion authorization

- Exact `main` SHA: `[sha]`
- GitHub production-environment approver: `[identity]`
- Approval timestamp (UTC): `[timestamp]`
- Workflow run URL/ID: `[url/id]`
- Dispatch reason: `[reviewed reason/change reference]`
- Required secret/variable presence check: `[PASS artifact; names only, no values]`
- No-deploy checklist disposition: `[all clear / BLOCKED with item]`

### Pre-release rollback identities

| Surface | Exact prior deployment/revision | Health before release | Status |
|---|---|---|---|
| Vercel `thirdcode-erp` | `[deployment id/url/revision]` | `[health/ready]` | NOT RUN |
| Railway Core API service `c45b3d01-036a-4663-a524-0713d782fce3` | `[deployment id/revision]` | `[health/ready]` | NOT RUN |
| Railway CAD service `328c6650-306e-4a3c-80dc-7566e80ba86a` | `[deployment id/revision]` | `[health]` | NOT RUN |
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
| Authenticated 13-role matrix | All 13 roles; no skips; Viewer reads all tenant-safe modules and cannot write | `[Playwright/API artifact]` | NOT RUN |
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
- Security acceptance by Agent 12: `[GO/BLOCK and evidence]`
- Database acceptance by Agent 04: `[GO/BLOCK and evidence]`
- Operations acceptance by Agent 13: `[GO/BLOCK and evidence]`
- Remaining P0/P1 findings: `[none, or explicit list]`
- Remaining limitations/P2/P3: `[explicit list]`
- Customer/management communication reference: `[link/not required]`
