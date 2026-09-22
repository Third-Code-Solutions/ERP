# Sales workflow release validation

The Sales rehearsal exposed a disabled stage command, UTC closing-date drift,
legacy-only dashboard aggregates, unrelated Cortex evidence, and a BOM link that
Sales could not open. The accompanying source changes correct those defects
without modifying role permissions, stored commercial values, Finance/KYC
approvals, contracts, or audit history.

## Verified before promotion

- Node 22 / pnpm 10.33 used by the coordinator for the combined checks.
- Shared-types suite: PASSED, 561 tests.
- Core stage/conversion unit and controller checks: PASSED, 101 tests.
- Web stage adapter, Core client and route policy checks: PASSED, 265 tests.
- Final database Cortex regressions: PASSED, 5 tests.
- Final Web Cortex/detail regressions: PASSED, 22 tests.
- Isolated PostgreSQL 17 stage HTTP, conversion HTTP, and Cortex generation
  integrations: PASSED, 3 cases exercising real transactions and rollback.
  The local-only database was copied from the `abi-ops-local` fixture, advanced
  through 27 pending migrations, and removed after the checks. The first attempt
  used the wrong local restore owner and failed on table privileges; rerunning
  against the actual isolated database owner passed. Hosted data was not used.
- Full workspace typecheck and lint: PASSED.
- Static business invariants, type-safety and App Router boundaries: PASSED.
- Provider spend guard and four contract tests: PASSED.
- Gitleaks 8.30.1: PASSED, 2,097 commits / no leaks.

The full local unit run and build are additional gates in progress at this
checkpoint. Environment-gated database suites in the ordinary unit command are
not counted as executed integrations; exact-SHA hosted CI must run database
reproducibility and its no-skips assertions before promotion.

## Production configuration and recovery

Read-only evidence confirmed both authority migrations present with forced RLS,
Core readiness healthy, and unauthenticated stage commands returning 401.
Both Web and Core stage/conversion flags were previously absent. The exact
populated tenant allowlists and required booleans are staged for the next
protected production promotion; Railway automatic deployment is suppressed.
No existing opportunity has been advanced by this repair at this checkpoint.

The authority runbook records exact provider targets, configuration, and prior
deployment rollback artifacts. Actual promotion and browser verification must
be linked from the release/PR record; source completion alone is not a claim
that production has changed.
