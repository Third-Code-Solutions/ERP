# ADR-029: Use Vitest V8 coverage for release-gating thresholds

- Status: Accepted
- Date: 2026-08-27
- Owners: Third Code Solutions Inc.

## Context

The controlled-trial release requires enforceable coverage evidence, not a
test command that merely reports whether individual tests passed. The
repository's current Vitest 3.2.6 suites run without a coverage provider:
Web, Core API, database, and shared-type tests can therefore succeed while
uncovered source paths remain invisible to the release gate.

AGENTS.md already requires at least 80% unit coverage for API business logic.
The coverage mechanism must make that existing policy executable without
shipping instrumentation, adding a hosted analytics service, or treating E2E
browser checks as a substitute for unit coverage.

## Decision

Add `@vitest/coverage-v8` as a direct, root-workspace **development-only**
dependency, version-aligned with the repository's Vitest 3.2.6 line. It is
authorized solely for test-time instrumentation under Node 22.

The release implementation must:

1. configure Vitest's `v8` provider in checked-in test configuration;
2. run coverage as an explicit CI release gate for the affected Vitest suites;
3. enforce numeric statement, branch, function, and line thresholds in that
   configuration, with failure causing the CI job to fail;
4. preserve the existing ≥80% API business-logic requirement and set source
   inclusions/exclusions narrowly enough that generated output, test files,
   declarations, fixtures, and framework glue cannot inflate the result; and
5. retain ordinary test commands for fast local iteration while the dedicated
   coverage command supplies the release evidence.

This decision covers the existing Vitest suites in `apps/web`, `apps/api`,
`packages/database`, and `packages/shared-types`. It does not replace:

- Playwright browser and role-matrix verification;
- database replay, RLS, migration, and audit checks;
- Node script contract/invariant tests; or
- the DXF parser's separate ≥85% Python coverage obligation.

## Alternatives considered

### No coverage provider or report-only collection

Rejected. A report that cannot fail CI provides no release assurance and does
not make the existing business-logic coverage policy enforceable.

### `@vitest/coverage-istanbul`

Rejected. It adds source-transform instrumentation and a separate reporting
model when this Node 22 monorepo can use the V8 runtime coverage provider that
is integrated with the selected test runner.

### Standalone `c8` or a hosted coverage service

Rejected. A standalone collector duplicates Vitest configuration and risks
divergent source inclusion. A hosted service adds cost, external data handling,
and an availability dependency without being necessary to fail the repository's
own release gate.

## Security and cost impact

- The package is a development dependency and must not be imported by product
  source, included in production artifacts, or enabled in deployed runtimes.
- Coverage runs only against the isolated local/CI test targets already
  authorized for the release. Reports must not contain secrets, production
  data, or service-role credentials; coverage output is treated as a transient
  build artifact and excluded from source control.
- The package enters the normal locked dependency graph and is subject to the
  repository's existing audit, secret-scanning, and frozen-lockfile gates.
- It adds one test-only package plus V8 collection CPU, memory, and artifact
  cost. Coverage may run separately from the fast feedback command, but it may
  not be skipped, cached as a false pass, or omitted from CI release evidence.

## Consequences

- Agent 13 owns wiring the dedicated coverage command, CI gate, artifact
  retention, and no-skips evidence; the applicable feature agents own
  increasing tests when a threshold exposes an uncovered path.
- Threshold changes, include/exclude changes, and provider upgrades are
  release-quality changes: they require review, a reproducible before/after
  report, and must not lower the API business-logic floor below 80%.
- README wording must describe the actual release state only after the gate has
  been run. The current `internal_alpha` badge is stale relative to the
  controlled-trial release-candidate objective, but it must not claim a live
  trial or deployment before the required evidence exists.
