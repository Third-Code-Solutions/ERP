# Remediation Tracker

- Baseline: `175eb35a5e40301e2dc82bd0414992633664c6fc`
- Status: `LOCAL AUDIT COMPLETE — PRODUCTION NO-GO`

| Priority | Finding | Status | Owner | Dependency | Verification | Release |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | AUD-002 Process routes unregistered | VERIFIED LOCALLY | Principal 3 / Agent 05 | Promotion for live proof | AppModule test and full Core gates pass; live remains 404 | BLOCKED |
| P1 | AUD-003 Viewer Scope mutation | VERIFIED LOCALLY | Principal 3 / Agent 03 | Browser target | Negative action/UI tests pass; browser unavailable | BLOCKED |
| P1 | AUD-004 upload quota/object integrity | PARTIAL — LOCAL RESERVATION, WRITER, CONCURRENCY, CORRELATION, AND RECONCILIATION INVARIANTS VERIFIED | Agents 04/05/03/12/13 | Hosted documents-bucket size/MIME enforcement and readback; authenticated direct-browser Storage DML denial/readback; exact-tenant hosted canary/drain/release identity | Core writer 21 files / 138 tests plus intake repairs; Web 228 focused / 1,022 full / Playwright 5/5; report 19/19; PG16 contention 3/3; correlation 10/10; reconciliation API 5 files / 133 tests, DB 8/8, PG16 plan verifier; independent PASS | BLOCKED |
| P1 | AUD-005 DocuSeal durable evidence | VERIFIED LOCALLY | Agents 05/12 | Provider/database E2E | 100 Core + 36 Web + 8 shared targeted tests; full gates | BLOCKED |
| P1 | AUD-006 fractional BOM quantity | BLOCKED | Agents 01/04/05/03 | Exact representation ADR | Migration/RLS/commercial E2E | BLOCKED |
| P0 | AUD-007 public business workbooks | BLOCKED | Owner/DPO/Agent 12 | Visibility/quarantine/history authority | Sanitized fixture/history/access review | BLOCKED |
| P2 | AUD-011 missing required scanners | BLOCKED | Agents 12/13 | `SNYK_TOKEN`, workflow implementation | Real PR scanner artifacts | BLOCKED |
| P1 | AUD-014 e-sign identity/config | PARTIAL/BLOCKED | Agents 05/14/12 | O-04 templates; provider/browser proof; assurance decision | Config/signatory/webhook negatives pass | BLOCKED |
| P1 | AUD-015 unprotected production controls | BLOCKED | Agent 13 / owner | Exact GitHub access-control approval | Rule readback + negative push/dispatch | BLOCKED |
| P1 | AUD-016 release identity/rollback | OPEN | Agent 13 / providers | Workflow/provider revisions + rollback design | Changed/no-op/mismatch/rollback drill | BLOCKED |
| P1 | AUD-021 non-BOM DocuSeal completion | BLOCKED | Agents 01/14/04/05/12 | VO/COC transition authority, O-04 templates, possible additive lookup model | DB isolation/replay + provider/browser E2E | BLOCKED |
| P1 | AUD-001 governance authority drift | BLOCKED | Agent 01 / owner | Explicit AGENTS sign-off | Stack/path/toolchain contract | N/A |
| P2 | AUD-009 embedding cache collision | VERIFIED LOCALLY | Principal 3 / Agent 08 | None | Exact-input/provider/model tests and full suite pass | READY |
| P2 | AUD-008 docs/copy drift | VERIFIED LOCALLY | Agent 01 / Web | None | Doc/route registration gates pass | READY |
| P2 | AUD-010 environment matrix | PARTIAL | Agents 12/13 | Required/optional owners + provider access | Static + provider parity | PENDING |
| P2 | AUD-012 Python reproducibility | VERIFIED LOCALLY | Agents 06/08/12/13 | GitHub CI execution and any later image publication | AI 8/8 + CAD 22/22; two clean builds/smokes each; SBOM identity 75/81 packages with zero diffs; high/critical scans and independent review PASS | PENDING |
| P2 | AUD-013 monitoring evidence | BLOCKED | Agent 13 / owner | Provider projects/owners | Synthetic event/alert | BLOCKED |
| P2 | AUD-017 embedding dimension contract | VERIFIED LOCALLY | Principal 3 / Agent 08 | None | 1,536 exact/mismatch tests and full suite pass | READY |
| P2 | AUD-018 Supabase security advisors | BLOCKED/PARTIAL | Agents 04/12 / owner | Auth UX and helper/RLS decisions | Advisor + auth/RLS tests | BLOCKED |
| P2 | AUD-019 Supabase FK/index debt | OPEN | Agents 04/13 | Workload/query-plan prioritization | Additive migration + advisor delta | PENDING |
| P3 | AUD-020 CI duration | OPEN | Agent 13 | Job profiling | Trusted PR under 8 min | PENDING |

Local closure requires executable evidence, not a source diff. Principal 4
independently verified the first remediation slice; the orchestrator independently
reviewed subsequent slices and reran their affected gates. Repository-wide
full-suite results remain timestamped snapshots. `READY` means locally verified
only and does not authorize release.
