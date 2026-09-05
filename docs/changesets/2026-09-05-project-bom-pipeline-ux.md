# Projects, BOM and Pipeline UX repair

## Delivered scope

- Projects: responsive cards/table, labeled search/status/type/sort, URL-backed
  filters, truthful counts, useful project metadata, empty/reset states.
- BOM index: current non-archived version per project, searchable history,
  pagination, exact centavo formatting and no double-counted version totals.
  Retired or unavailable projects no longer generate editor links.
- BOM editor: one project navigation row; expandable location rollup; contained,
  keyboard-focusable line table; responsive add-line form with accessible names;
  supplier panel opens only for a selected line instead of covering mobile pages.
- Pipeline: URL-backed search/stage/owner filters, consistent board/list stages,
  canonical opportunity links, keyboard stage actions, explicit won confirmation,
  retained probability/GP/weighted value/expected close, and creation in both views.

Existing design tokens guided the redesign. No new runtime dependencies, database
migrations, pricing changes, provider configuration, or production writes.

## Verification ledger

- PASSED: web Vitest suite, 215 files / 1,786 tests. Two database-dependent tests
  explicitly skipped because this invocation had no disposable hardened DB env.
- PASSED: post-fix focused regression suite, 28 files / 277 tests.
- PASSED: final web lint and production build, including type validation and all
  102 static pages. The first build caught a Date/string mismatch in expected-close
  presentation; corrected server serialization and rerun passed.
- PASSED: full typecheck command earlier in the pass (including E2E configurations).
- PASSED: Gitleaks 8.30.1 staged scan (96 KB), no leaks found.
- PASSED: App Router boundaries (132 pages), web DB boundary (zero direct write
  routes), type-safety contract (1,611 source files), git diff whitespace check.
- PASSED: actual Chrome against loopback auth/PostgreSQL, Projects cards/table,
  BOM empty/current editor, Pipeline alias/filter reset. All four route surfaces
  fit widths 320/768/1440 with document width equal to viewport width after fixes.
- PASSED: local-only BOM creation and line addition (quantity 2 x PHP100 = PHP200).
  Fixtures remain only in the local verification tenant, not production.
- Browser limitation: loopback auth harness does not serve Realtime; expected
  WebSocket handshake 404 warnings prevent claiming a clean Realtime verification.
  Pipeline populated-card behavior is unit/role tested, not live-data browser tested.

## Remaining coverage and release

This is a workspace UX repair, not whole-ERP certification. Large-BOM virtualization,
all project subroutes, live provider integrations, and full approval/procurement
journeys were not re-certified. Production deployment NOT RUN for this request.
Rollback is a code revert; no production data migration is involved.
