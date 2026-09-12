# Schedule dependency integrity

## Change

- Reject indirect predecessor cycles and reachable broken or cross-level chains before Core writes a task.
- Reject level edits that invalidate existing child or successor relationships, including terminal dependents.
- Serialize graph-changing edits using the same tenant/project row lock already used by create and import; lock the project before the task.
- Preserve explicit predecessor clearing, valid resequencing, optimistic revisions, current membership checks and transactional audit writes. Existing UI surfaces the conflict message while retaining the draft.

## Verification

- PASSED: reproduced three defects before the fix: reciprocal predecessor cycle and incoming parent/predecessor level violations were incorrectly accepted.
- PASSED: 19 schedule service tests and six schedule HTTP/controller tests, including malformed/valid chains, scoped graph lookup and clear repair.
- PASSED: API TypeScript, dedicated schedule integration TypeScript, focused production-file ESLint, repository type-safety scan and diff whitespace check.
- Independent Astra source/test review found no must-fix defects; it did not execute PostgreSQL tests.
- Added PostgreSQL proofs for three-task cycles, unchanged task/audit snapshots on rejection, valid repair, incoming-level protection and opposing concurrent edits on distinct database connections with exactly one committed semantic update.
- NOT RUN locally: PostgreSQL integration execution; Docker's Linux engine is unavailable. The disposable CI database lane must execute these before release.
- First full local API run encountered a 15-second inventory HTTP-test timeout; its isolated three-test suite passed in 355 ms. A full rerun without concurrent typechecking passed all 1,228 tests across 247 files with zero skips. No timeout or test was weakened. Locked-runtime CI remains pending.

## Boundary and recovery

No migration, third-party source, new dependency, business-data rewrite or UI redesign. Graph integrity is enforced by the located Core writers; privileged direct SQL is outside this guard. Existing RLS denies direct anonymous/authenticated table access. No production mutation or deployment is claimed at this checkpoint. Promote only through ADR-020 after green gates; restore the prior reviewed service release if needed, preserving all business data.
