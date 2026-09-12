# Legacy schedule preview and import

- Added an authenticated Core preview of the latest project/tenant-scoped stored L1 schedule. Validation reports source row issues before import.
- Added Web preview, task/date/predecessor review, explicit confirmation, pending/error states and safe retry. Source ID plus content fingerprint prevents committing a changed preview. Original legacy JSON and curves remain intact; no labour estimates are inferred.
- Added Core client and action response scope validation. Import revalidates schedule, progress and project routes after verified success.
- Fixed manual-create idempotent replay: internal request hash is removed before strict public task serialization.
- Fixed forward predecessor references: import writes sequential topological layers so each predecessor is visible to the immediate database scope trigger. Source-index IDs, task codes, returned row order and atomic rollback remain unchanged. A regression covers row 0 → row 2 → row 1 plus an independent task and replay.
- PASSED: Core schedule service/controller/protected suites (12 tests), Web schedule client/actions (8 tests), shared schedule contracts (5 tests), API and Web TypeScript checks, focused production-file ESLint.
- Local checks use Node 24.16.0 with pnpm engine enforcement overridden; repository CI Node 22 remains the required runtime gate. Initial ESLint invocation included ignored test files and failed on ignore warnings; rerun on production files passed.
- Follow-up predecessor-order regression: PASSED service suite (8 tests), API TypeScript, service ESLint and diff check. Disposable PostgreSQL replay belongs to the database verification agent.
- PASSED: isolated Chromium against the real component and application stylesheet with mocked actions: preview, explicit confirmation, failure/retry, snapshot fingerprint submission, success, keyboard link focus and no document overflow at 320/768/1024/1440 pixels. This is component interaction proof, not authenticated persistence proof.
- Added six disposable PostgreSQL integration cases for dependency links, concurrent retry, edited replay, tenant denial, code collisions and audit rollback. TypeScript and discovery passed locally; real execution requires the Node 22 disposable CI database lane. No new migration.
- Deployment remains gated on CI. No production data was mutated during local verification.
