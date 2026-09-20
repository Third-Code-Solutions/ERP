# Production CI run ordering

## Outcome

The production gate now chooses the newest canonical CI run for the exact
release SHA before considering attempts within that run. Previously, an older
successful run with more retries could mask a newer failed or pending run.
The GitHub adapter and evidence evaluator share the same selection function.

## Verification

- PASSED: `node --test scripts/verify-production-ci.test.mjs` (10 tests).
  Regressions cover newer failed and pending runs in both input orders, plus
  a pending retry superseding its earlier successful attempt.
- PASSED: `node --check scripts/verify-production-ci.mjs`.
- PASSED: `node --check scripts/lib/production-ci-gate.mjs`.
- PASSED: `git diff --check`.

No dependencies, database changes, provider mutations or deployments. Hosted
release evidence remains a separate gate. Agent 13 hands off to the main agent
for independent review and integration.
