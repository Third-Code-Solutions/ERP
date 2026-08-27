# Finance reconciliation HTTP-canary CI recovery handoff

> **Status — superseded as a Finance/API remediation (2026-08-27).** The
> initial run attribution below was corrected by Agent 05. It remains in this
> record for traceability; the current required owner is Agent 13 for complete
> dual-lane self-hosted CI validation, followed by Agent 12 security rereview.

## Superseding evidence and decision

Agent 05 established the following from a fresh exact disposable raw
PostgreSQL 17/Redis replay under Node 22:

- self-hosted run
  [`33075859440`](https://github.com/Third-Code-Solutions/ERP/actions/runs/33075859440)
  failed during raw database Vitest **before** it executed the API integration
  matrix;
- the original retained `78/79` API JSON observation is therefore not evidence
  from that GitHub Actions run and cannot diagnose its failure;
- the fresh full API integration matrix passed 79 of 79 tests with zero
  failures, pending, or skipped tests; and
- the exact Finance reconciliation protected HTTP canary passed with verbose
  output in 1.03 seconds.

The Finance canary failure is non-reproducible in the exact disposable replay.
Agent 05 made **no code, test, schema, or workflow change**, and no database
contract evidence invokes Agent 04. The stale/local JSON report is retained as
superseded evidence rather than deleted, but it must not be presented as a
failure of run `33075859440`.

This does not make CI green: the current self-hosted workflow needs a fresh
end-to-end run that exercises its required raw PostgreSQL, local Supabase Auth,
API integration, build, smoke, secret-scan, and cleanup stages. A failure in
that fresh run remains a real gate failure and must retain diagnostic output.

## Current ordered ownership

### 1. Agent 05 — complete; no implementation change

**Outcome:** the exact verbose canary and full 79-test API integration replay
passed in a newly rebuilt raw PostgreSQL 17/Redis environment. The prior API
failure lead is closed with no source change and no handoff to Agent 04.

> → Handoff to Agent 13. Reason: only a fresh full workflow can establish
> whether the original run's raw-database failure and all required downstream
> gates now pass together. Inputs: Agent 05's non-secret Node 22 repro/result,
> the current recovery-PR commit, and the existing local-Supabase Auth-lane
> handoff. Expected output: one fresh complete self-hosted run with required
> reports and cleanup evidence.

### 2. Agent 13 — full dual-lane CI validation

**Required output:** provision a fresh eligible ephemeral runner and run the
exact recovery-PR commit. Preserve both required database lanes and parse
machine-readable no-skips reports for raw database, local Supabase Auth, and
full API integration. Retain non-secret results for workflow validation, build,
runtime smokes, the existing secret scan, and unconditional cleanup.

**Must not:** rerun only the focused Finance test; use a cached/stale local
report as workflow evidence; disable, conditionally omit, or retry a failed
stage into a green result; use production credentials or deploy.

**Exit criteria:** every required stage in one newly dispatched workflow run
passes, with zero-skip reports and successful cleanup. Any raw-database failure
must identify its actual test and diagnostic output before a new owner is
selected.

> → Handoff to Agent 12. Reason: full CI evidence and local disposable-runtime
> handling need an independent security review. Inputs: final workflow diff,
> run URL, report summaries, and cleanup evidence. Expected output: a bounded
> security decision and any remaining promotion blockers.

### 3. Agent 12 — security rereview

**Required output:** verify that the final workflow retains mandatory test
selection, tenant/auth/audit protections, zero-skip enforcement, disposable
credential containment, loopback-only local services, and cleanup. Record any
broader Snyk/Semgrep/Trivy gap separately; this non-reproducible Finance result
does not close those gates.

## Original observation (superseded; retained for traceability)

The initial record incorrectly attributed the report at
`tmp/self-hosted-ci/api-integration-vitest.json` to self-hosted run
`33075859440`. The report itself recorded:

- 79 tests total: 78 passed, one failed, zero pending or skipped;
- the failing required test:
  `apps/api/integration/finance-reconciliation-workflow.http.integration.spec.ts`;
- the test's own protected HTTP assertions cover authentication, tenant scope,
  feature gates, idempotency, reconciliation, voiding, audit evidence, and
  transaction rollback; and
- the JSON result contains `Error: STACK_TRACE_ERROR` and a Vitest stack ending
  at line 272, rather than the underlying application, database, or harness
  failure.

This was a valid failed local report but was not valid run-attributed CI
evidence. It has been superseded by the fresh Agent 05 replay above. The test
remains mandatory whenever the raw-lane API integration matrix is invoked; it
must never be converted to a skip, excluded from the matrix, retried until
green, or otherwise suppressed. The host's default Node 24 cannot execute this
repository because its declared runtime is Node 22; all repro and validation
must use the repository-required Node 22 runtime.

## Original planned delivery contract (superseded)

- **Goal:** make the finance reconciliation protected HTTP canary emit a
  deterministic, diagnosable failure when broken and pass as part of the full
  disposable API integration matrix.
- **In scope:** the Core API test/service/controller contract if that is the
  cause; conditional database/bootstrap/RLS work only if Agent 05's evidence
  proves a database contract defect; CI rerun and security review.
- **Out of scope:** production data or credentials, hosted Supabase changes,
  provider billing, deployments, financial-policy changes, migrations authored
  only to hide a test failure, and modifying the separate local-Supabase Auth
  lane repair.
- **Data boundary:** all reproduction uses a newly rebuilt disposable
  PostgreSQL 17 database and disposable Redis only. The canary's existing
  transaction rollback is required but does not replace fresh-lane setup and
  teardown.

## Original acceptance criteria (superseded)

1. The exact failing spec has a deterministic Node 22 reproduction in the raw
   database lane, using one worker and the same required environment contract
   as CI. Its human-readable output identifies the real failure operation and
   source location; the machine-readable Vitest report remains available for
   the no-skips assertion. Logs must not disclose a database URL, credential,
   or test-data value beyond what is safe for source control.
2. Agent 05 records the observed cause before changing behavior. A timeout,
   test harness failure, test setup defect, database-contract issue, and
   Finance implementation defect are distinct outcomes; no one may be inferred
   from the current `STACK_TRACE_ERROR` sentinel.
3. The smallest root-cause correction preserves ADR-015: matching and
   reconciliation evidence remain tenant-bound, idempotent, transactionally
   revalidated, auditable, and immutable after reconciliation except through a
   logged void. Authentication, capability checks, tenant concealment, strict
   DTO validation, feature gates, and rollback assertions remain required.
4. The focused canary passes with zero failed, pending, skipped, or todo tests.
   The full API integration report then passes all executed tests with zero
   failures/pending/skips; the current 79-test baseline may increase but may
   not be reduced to create a pass.
5. The raw PostgreSQL migration/reproducibility/RLS lane remains required and
   passes. The separate required local-Supabase Auth API lane described in
   `docs/handoffs/2026-08-27-self-hosted-ci-auth-lane-repair.md` is preserved;
   neither database lane is a substitute for the other.
6. A fresh eligible self-hosted run executes the repaired full matrix, the
   dual database lanes, build, runtime smokes, and existing secret scan. A
   successful rerun is CI evidence only; it does not establish production
   database parity, replace missing hosted security gates, or authorize a
   deployment.

## Original ownership plan (superseded)

Stages are strictly sequential. Each receiving agent re-reads `AGENTS.md`,
this handoff, and its scoped instructions; preserves unrelated in-progress
changes; records a dated changeset; and hands off with command output and
non-secret evidence. No stage commits or removes another agent's work.

### 1. Agent 05 — API & Backend Logic: diagnose and repair

**Reason:** the failing asset is a protected Core API HTTP integration test and
the finance reconciliation application boundary.

**Inputs:** this report; ADR-015; the exact test file; the API Vitest config;
`scripts/ci/run-wsl1-database-lane.ps1`; the JSON report above; and the
currently required raw-lane environment contract.

**Required output:**

1. Reproduce the one test against a fresh raw PostgreSQL 17/Redis lane under
   Node 22 and one worker. Keep a verbose/human-readable diagnostic alongside
   JSON output and the existing no-skips check so the underlying failure is
   retained rather than collapsed to `STACK_TRACE_ERROR`.
2. Trace the failing operation through the fixture, Nest application setup,
   guards, controller, service, database transaction, and cleanup. Record the
   precise cause and classify it as application, test/harness, or database
   contract before writing the fix.
3. Implement the smallest API/test-harness correction in Agent 05's scope and
   add a regression assertion that fails for the original cause. Do not relax
   a guard, feature gate, tenant constraint, audit assertion, idempotency
   contract, strict validation, or rollback boundary to make the canary pass.
4. Run the focused test and complete API integration matrix with zero skips.
   If the evidence implicates a schema, migration, RLS, extension/bootstrap,
   grants, or database invariant, stop after recording the evidence and hand
   off to Agent 04; do not patch database behavior directly.

**Must not:** use production state, modify a historical migration solely for
CI, bypass a capability/tenant check, replace protected HTTP verification with
direct service or SQL calls, increase a timeout without proving that the test
is otherwise correct, or mark the suite optional.

**Exit criteria:** a source-backed diagnosis and a passing focused plus full
API report, or a precise database-contract handoff with no speculative API
change.

> → Handoff to Agent 04 only if Agent 05 proves that the failure is caused by a
> database contract. Reason: schema, migration, RLS, grants, or raw-bootstrap
> semantics are schema responsibilities. Inputs: deterministic repro, exact
> failed operation, minimum database expectation, and Agent 05's unchanged
> API evidence. Expected output: a bounded database correction and replay/RLS
> proof, or an evidence-backed finding that the contract is already correct.

### 2. Agent 04 — Supabase/Drizzle Schema Lead: conditional database review

**Reason:** conditional only; enter this stage only on the evidence-based
handoff above.

**Required output:** determine whether the raw PostgreSQL 17 lane faithfully
reproduces the required Finance reconciliation database contract. If a change
is required, make the smallest additive, reviewable correction; validate forward
replay, tenant isolation/RLS, audit immutability, and the exact HTTP canary.

**Must not:** edit historical migrations, change financial reconciliation
semantics, weaken RLS or audit controls, or create a migration solely to make
test infrastructure green. If no database defect exists, document that outcome
and return the cause to Agent 05.

**Exit criteria:** the raw lane and canary pass with the database contract
proven, or the database hypothesis is falsified with reproducible evidence.

> → Handoff to Agent 13. Reason: the corrected API/database contract requires
> a clean end-to-end self-hosted CI verification. Inputs: final commit(s),
> focused/full report paths, any raw-lane change, and the known local-Supabase
> Auth-lane contract. Expected output: a fresh, fully observed self-hosted run
> with no omitted required stages.

### 3. Agent 13 — CI/CD & Ops: revalidate the full required lane

**Reason:** workflow evidence, runner lifecycle, and cross-lane no-skips
verification are CI/Ops responsibilities.

**Required output:** run a fresh ephemeral eligible self-hosted runner against
the exact recovery-PR commit. Preserve the raw PostgreSQL lane and the
separate Auth API lane, parse the focused/full API JSON reports, and retain
non-secret evidence of every required stage. A failed setup, cleanup, report,
or test is a failed CI run, not a conditional success.

**Must not:** alter production deployment definitions, use hosted database
credentials, weaken the actor/label guard, set `continue-on-error`, disable a
required test, or treat a rerun of only the focused test as full CI evidence.

**Exit criteria:** the exact run shows zero-skip raw database, Auth API, and
API integration reports followed by build, smoke, existing secret scan, and
successful cleanup.

> → Handoff to Agent 12. Reason: the new CI evidence and any diagnostic/report
> handling require an independent security review. Inputs: final diffs, run
> URL, report summaries, and cleanup evidence. Expected output: a security
> decision limited to this repair and any release-blocking findings.

### 4. Agent 12 — Security / DevSecOps: rereview

**Reason:** this is a protected Finance mutation path and its CI evidence must
not conceal a tenant, credential, audit, or test-selection regression.

**Required output:** verify that the repair retains tenant isolation,
authentication/capability enforcement, immutable audit evidence, process-only
disposable credentials, zero-skip report enforcement, and local-only database
boundaries. Rerun the applicable static and secret checks. Record any broader
Snyk/Semgrep/Trivy gap independently; it is not resolved by this canary repair.

**Exit criteria:** PASS only with evidence that the test remains mandatory and
security boundaries are unchanged; otherwise report the finding as a promotion
blocker.

## Release boundary

This handoff authorizes a local/CI diagnosis and repair only. It does not
restore hosted GitHub Actions billing, establish a read-only production
database/schema parity report, resolve ABI fractional-quantity/DUPA authority,
merge PR #14, or deploy. Production status remains **NO-GO** until those
independent gates have current evidence.
