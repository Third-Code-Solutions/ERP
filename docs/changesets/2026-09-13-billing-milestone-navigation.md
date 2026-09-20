# Billing milestone navigation and source traceability

## Delivered locally

- Project billing accepts bounded, single-value `milestonePage` URL state and
  preserves unrelated/repeated query parameters. Native pagination supports
  history, first-page recovery and disabled boundaries.
- Milestone cards expose every readiness blocker and exact claim/invoice source
  links plus project progress/turnover navigation. Existing invoices, BOM totals,
  certification, posting and monetary rules are unchanged.
- Empty projects, empty/out-of-range pages, malformed filters and unavailable
  Core evidence remain distinct. Existing invoices remain visible when optional
  milestone access or transport fails. Dates are UTC-safe; inconsistent concurrent
  row/count snapshots render actual rows with a reported count, not invented ranges.
- The Core adapter validates request/result project, page, limit, total-page math,
  row bounds and duplicate claim IDs. Session/client failures become structured
  unavailability, not a whole-page exception.
- Core billing now requires the existing `finance.read` permission, matching Web
  access. Fresh membership checks also require active user and tenant records.
  No new permission grant, migration, dependency or database write path.
- CI requires the billing browser suite and retains responsive screenshots.

## Regression evidence

- Protected Nest tests reproduced nine unauthorized roles receiving financial
  data before the permission repair. Four permitted roles remain allowed.
- PostgreSQL regressions reproduced stale-role and inactive-user/tenant admission
  before the fresh membership repair. Synthetic fixtures remain in the disposable
  loopback database with immutable audit evidence; no hosted data was used.
- Adapter regressions reproduced wrong-scope/page response acceptance and two
  uncaught access-acquisition exceptions. Browser regressions reproduced hidden
  blockers and missing pagination. CI contract test failed before adding the suite.
- New helper tests first failed because the helper did not exist; initial route
  test setup also needed a React import. These are not claimed as old product bugs.

## Verification

- PASSED: 61/61 focused Web tests, including actual asynchronous billing page
  rendering and all 13 canonical role projections; zero skips.
- PASSED: 25/25 API/protected-controller/service and actual PostgreSQL tests;
  includes 27-claim pagination, tenant/project exclusion, fresh lifecycle denial
  and unchanged audit history on reads; zero skips.
- PASSED: 57/57 combined Chromium regressions, including six new billing cases;
  one worker, zero retries and zero skips.
- PASSED: Web and configured E2E typechecks; targeted Web/API source ESLint;
  10/10 build-ops contract tests; actionlint and diff whitespace checks.
- Main inspected production-styled card screenshots at 320, 768, 1024 and 1440px,
  including mobile horizontal reveal of every readiness blocker. The narrow
  table scrolls locally without document overflow.
- Independent Astra Web review found the access error-boundary issue; Luna fixed
  it and main reran all focused Web tests. Main reviewed the separate API changes.

## Release boundaries

Browser fixtures exercise real components, CSS, links and pagination helper with
controlled source responses; they are not mounted Next authentication, end-to-end
Core delivery or hosted all-demo-account proof. Protected Nest role checks and
PostgreSQL authority tests provide separate evidence, not a substitute for that
hosted verification. Rows/counts remain separate database reads, not one snapshot.

This branch inherits the unmerged release stack through PR #78. No production
deployment or hosted migration apply was performed. Full CI, push/PR status and
provider checks must be recorded against the final commit. Existing database and
Storage backup/recovery, isolated rehearsal and hosted preflight requirements
remain release gates. Full ERP roadmap and retained-history Suspend remain open.

Handoff: Agent 05 API/adapter, Agent 03 route, frontend/browser owners, then Agent
13 CI. See the matching billing milestone handoff for path boundaries.
