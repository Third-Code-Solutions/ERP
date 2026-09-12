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
- Extended the existing release role-access matrix within its current eleven authenticated sessions: every role visits the configured project's schedule; import preview visibility follows schedule-management capability (admin, owner and SD/PM/PE among seeded roles). The admin session also verifies procurement stacking and no document overflow at 390px, then restores its viewport. Missing/invalid `E2E_PROJECT_ID` fails before login; no business mutation is submitted. Hosted execution remains pending release verification.
- PASSED: E2E TypeScript after the role-access extension. Hosted role matrix execution is NOT RUN locally.

## Release evidence

- PR #62 merged as `644434a6a09b40c5d8000a8d4afcdcae9c57a61b`. CI run `34683981671` passed lint, types, unit tests, security, database reproducibility/transaction tests with no skips, build and trusted-PR browser smoke.
- Production run `34684525034`, attempt 1, deployed Web/API/CAD and passed health/readiness. Web confirmed revision `644434a6a09b`.
- Production Chromium: 11 expected, 1 unexpected, zero skipped/flaky. The new role test failed before the schedule heading because repository `E2E_PROJECT_ID` referenced a nonexistent project; the independent route inventory successfully rendered the schedule using an existing tenant-scoped record. Full release verification was not green.
- Read-only Supabase checks verified all eleven demo role profiles belong to `buildops-e2e`, and project `11111111-1111-4111-8111-111111111111` exists there and is not deleted. Added a Production-environment `E2E_PROJECT_ID` override pointing to that controlled fixture; repository-wide settings and business data were unchanged. Previous inherited binding: `60678948-fc79-40bb-8ff3-33aa27f6ad21`. Removing the environment override restores that prior configuration if needed.
- Attempt 2 reruns the guarded release on the same code SHA. Its final production verification remains pending.
