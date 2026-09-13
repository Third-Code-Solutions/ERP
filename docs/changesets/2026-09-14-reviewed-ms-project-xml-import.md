# Reviewed MS Project XML schedule import

Status: locally implemented and independently verified; CI and release pending.
Not deployed.

## Scope

ADR-034 adds a bounded exported-XML planning import alongside the existing manual
and legacy schedule flows. Native `.mpp`, resource/work/actual imports, calendar
reproduction and schedule synchronization are outside this slice. PRD O-04/O-09
remain unresolved; explicit reviewed mappings do not define company policy.

- Direct API dependency on the workspace's existing patched xmldom 0.8.15.
- Read-only source preview and explicit L1–L4 mappings, with unassigned owners in
  the initial UI and no invented labour, progress or commercial values.
- Current actor/tenant admission, fail-fast project/audit locks, atomic task
  insertion and append-only original receipts. Duplicate-source protection uses
  immutable provenance, not editable task codes alone.
- Web actions verify scope, source hash, request identity and original receipt
  mappings. Unconfirmed writes retain exact retry commands; refresh failure does
  not turn committed success into a claimed rollback.
- Schedule-page access checks and focused browser coverage added to CI.

## Verification

- PASSED: frozen offline dependency installation; only the direct dependency and
  existing lockfile importer entry changed.
- PASSED: 37 Core/parser/HTTP tests, including 18 actual-Postgres cases; 2 shared
  contract tests; 29 Web action/transport/page tests; all without skips.
- PASSED: 9 mounted Chromium cases, including exact uncertain retries, scope
  changes, bulk mappings, review pagination and keyboard/overflow checks at
  320/768/1024/1440 pixels. Mobile and desktop screenshots visually inspected.
- PASSED: API/shared/Web/E2E types, production-source ESLint, Actionlint and diff checks.
- The 500-task Postgres test completed locally in 1.18 seconds in the service
  lane. This is synthetic local evidence, not a production latency guarantee.
- Initial failures exposed malformed source handling, durable duplicate-source
  protection and permission-change component lifetime; regression cases now pass.
- Final CI/build and live all-role journeys remain pending. Mounted component
  tests do not establish deployed end-to-end behavior.

## Release

No schema migration or production mutation in this slice. Production remains
gated by the database recovery runbook and the coordinated pending release.
Local tests and a clean migration-built database do not prove production backup
restorability.

The immutable source-receipt lookup uses existing tenant/entity indexes followed
by a JSON source-hash filter. Growth in per-tenant import history can increase
filtering work; no constant-time or dedicated source-hash index is claimed.
