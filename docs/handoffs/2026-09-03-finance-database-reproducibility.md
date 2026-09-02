# Finance database-reproducibility handoff

## Finding and impact

The protected `Database Reproducibility (Postgres 17)` job fails repeatably on
the current auth PR and prevents the dependent CI build and trusted E2E jobs
from running. The failing checks are the first summary assertions in:

- `apps/api/integration/finance-payables.http.integration.spec.ts` line 425;
- `apps/api/integration/finance-receivables.http.integration.spec.ts` line 325.

The same run reports 77 passing integration tests and two failures. Unit,
TypeScript, lint, security, actionlint, and BUILD OPS invariant jobs pass. The
root cause and actual response difference must be reproduced; test expectations
must not be relaxed merely to make the gate green.

Evidence: PR #15 Actions run `33634034468`, database job `100263429961`.

## Accounting authority

- ADR-012: invoice issuance and receivable state are transactionally linked to
  balanced immutable journals; payment state derives from allocation evidence.
- ADR-013: posted supplier bills control AP and corrections use bill-owned
  reversals; PO status alone is not settlement evidence.
- ADR-014: cash settlement and aging derive from active posted allocation
  evidence, never manual paid toggles.
- Every read and fixture remains tenant scoped; Finance capability enforcement
  and Viewer denial must remain intact.

## Acceptance criteria

1. Reproduce both failures against the same Postgres 17 migration/seed path as
   the protected workflow and record the exact expected-versus-actual fields.
2. Identify a deterministic root cause in implementation, fixture lifecycle,
   date handling, migration state, or test isolation. Do not infer it from line
   numbers alone.
3. Implement the smallest correction consistent with ADR-012 through ADR-014.
   Do not disable a trigger, RLS check, capability guard, journal constraint,
   allocation rule, or assertion without evidence that the contract changed.
4. Add or strengthen regression coverage for the proven failure mode. Results
   must be independent of wall-clock date and test execution order where the
   product contract requires deterministic seeded evidence.
5. Preserve unauthenticated 401, Viewer 403, tenant isolation, pagination, and
   receivable/payable aggregate correctness.
6. Pass the two focused integration files, relevant neighboring Finance tests,
   complete API TypeScript/lint, migration reproducibility, and the protected
   database workflow. Report every unavailable check explicitly.

## Sequential ownership

1. Principal Agent 3 is the sole source editor and acts within Agent 05 API
   scope unless the reproduction proves a schema/migration defect. If schema
   changes are required, stop and return an Agent 04 handoff before editing.
2. Principal Agent 4 independently reviews accounting semantics, tenant/RBAC
   boundaries, determinism, regression coverage, and the database gate.
3. Principal Agent 5 performs an isolated API/runtime verification only after
   QA is green if the fix changes observable endpoint behavior. No browser or
   production mutation is required for a test-infrastructure-only correction.

No production deployment is authorized. ADR-020 still requires reviewed
`main` and all protected checks to pass before release.
