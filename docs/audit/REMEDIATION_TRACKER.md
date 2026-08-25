# Remediation Tracker

- Baseline: `175eb35a5e40301e2dc82bd0414992633664c6fc`
- Status: `LOCAL AUDIT COMPLETE — PRODUCTION NO-GO`

| Priority | Finding | Status | Owner | Dependency | Verification | Release |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | AUD-002 Process routes unregistered | VERIFIED LOCALLY | Principal 3 / Agent 05 | Promotion for live proof | AppModule test and full Core gates pass; live remains 404 | BLOCKED |
| P1 | AUD-003 Viewer Scope mutation | VERIFIED LOCALLY | Principal 3 / Agent 03 | Browser target | Negative action/UI tests pass; browser unavailable | BLOCKED |
| P1 | AUD-004 upload quota/object integrity | PARTIAL — LOCAL RESERVATION, WRITER, CONCURRENCY, CORRELATION, RECONCILIATION, AND SERVER-ONLY STORAGE SOURCE CONTROLS VERIFIED | Agents 04/05/03/12/13 | Hosted bucket readback and direct-browser denial; exact-tenant hosted canary/drain/release identity | Exact 100 MiB/MIME bootstrap and policy-removal source; helper tests; Core/Web/PG local evidence | PARTIAL |
| P1 | AUD-005 DocuSeal durable evidence | VERIFIED LOCALLY | Agents 05/12 | Provider/database E2E | 100 Core + 36 Web + 8 shared targeted tests; full gates | BLOCKED |
| P1 | AUD-006 fractional BOM quantity | DECISION VERIFIED; IMPLEMENTATION PENDING | Agents 01/04/05/03 | ADR-029 vertical migration | Migration/RLS/commercial E2E | PARTIAL |
| P0 | AUD-007 public business workbooks | CONTAINED; GITHUB PURGE PENDING | Owner/DPO/Agent 12 | GitHub Support purge of historic PR refs | Private readback; fresh mirror branch/tag scan | PARTIAL |
| P2 | AUD-011 missing required scanners | SOURCE IMPLEMENTED; HOSTED EXECUTION UNAVAILABLE | Agents 12/13 | Restore Actions capacity; configure SNYK_TOKEN if no org secret exists | Real PR scanner artifacts | PARTIAL |
| P1 | AUD-014 e-sign identity/config | PARTIAL/BLOCKED | Agents 05/14/12 | O-04 templates; provider/browser proof; assurance decision | Config/signatory/webhook negatives pass | BLOCKED |
| P1 | AUD-015 unprotected production controls | PROVIDER PLAN CONSTRAINED | Agent 13 / owner | GitHub Pro/Team or equivalent protected private repository | Rule readback + negative push/dispatch | BLOCKED |
| P1 | AUD-016 release identity/rollback | PARTIAL — REVISION GATES IMPLEMENTED | Agent 13 / providers | Hosted execution and rollback drill | Changed/no-op/mismatch/rollback drill | PARTIAL |
| P1 | AUD-021 non-BOM DocuSeal completion | SOURCE IMPLEMENTED AND COLLISION-HARDENED | Agents 01/14/04/05/12 | Provider templates/callback and O-10 authority evidence | 12 webhook tests; PostgreSQL 17 uniqueness migration proof | PARTIAL |
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
