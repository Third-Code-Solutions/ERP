# Route, role, and workflow QA repairs

Agent 05 scope: Core API composition and daily-task date handling. No hosted writes or deployment.

- Registered the existing ProcessModule in AppModule. The Process Health controller existed but was absent from the production module graph, matching the browser's `Cannot GET /v1/process/health` failure.
- Added production module-composition regression coverage, complementing existing isolated Process controller and service tests.
- Corrected My Tasks/dashboard Manila boundaries for instants before 08:00 local time. Generation inputs remain date-only values.
- Corrected scheduled and default on-demand cadence generation to create the current Manila day's tasks. Previously the 07:00 run shifted to Manila and added another day.
- Added midnight/year-boundary and scheduled/on-demand date regressions.

Verification after integration under Node22:

- PASSED: Web route/cadence regressions, 18 tests across `route-qa.test.tsx`, `inngest-cadence.test.ts`, `cadence-engine.test.ts`.
- PASSED: Core composition, Process controller/service/e2e, and six Finance database HTTP suites: 23 tests across 10 files. Finance ledger/receivables/payables/cash/reconciliation checks include authorization, tenant isolation and rollback against local `erp_self_hosted_ci`.
- PASSED: `pnpm --filter @third-code-erp/api build` and API/Web lint; Web typecheck (including configured E2E TypeScript projects).
- PASSED: local browser Process Health returns real Core data; Admin material/rate/mapping saves persist; PO dialog creates a draft with expected amounts; 390px responsive Admin proof.
- PASSED: final `pnpm --filter @third-code-erp/web build`, complete Web typecheck and lint, and 18 Web regressions after restoring a temporary dependency-cleanup problem. No source assertions were relaxed. Temporary verification scripts/logs are outside the repository.
- Production-build browser login could not use the loopback identity provider: the existing production CSP permits Supabase HTTPS origins and only permits loopback identity services in development. Security policy was preserved. The later development-browser checks below supersede the initial blocked keyboard, punchlist and task-error checks.
- NOT RUN: hosted deployment and hosted mutation/provider delivery. The first combined Process run had a transient five-second initialization timeout; isolated and final combined reruns passed without changing assertions or timeouts.

## Route and usability integration

The coordinator added task generation/refresh controls for admin/owner, linked their Admin entry, connected punchlist creation and permit/project navigation, clarified KYC/PPRF prerequisites, repaired Admin column overflow and PO dialog accessibility, aligned delivery choices with Core's issued-only rule, added Finance setup navigation, and corrected misleading no-response CNPS/review badges and doubled opportunity currency symbols. Financial rules and persisted schemas are unchanged.

See `docs/handoffs/2026-09-07-route-feature-qa.md` for explicit inspected routes, remaining lifecycle coverage, and integration setup gaps. This is a verified first repair batch, not a claim of complete ERP readiness.

Diagnosis handed to Agent 03: owner/admin have no default personal cadence template; the generation server action had no UI caller; account KYC queue does not include the separate opportunity KYC tracks. Empty queues alone do not establish a backend defect.

→ Handoff to Agent 03 completed for the first repair batch. Continue with the remaining lifecycle gaps listed in the handoff. Changes remain local and uncommitted; no push or deployment was requested.

## Follow-up through September 8

- Used all 11 supplied hosted demo identities. Confirmed role-specific task rows, Finance/CX/Design/Procurement entry points, Owner user management, and Viewer direct-write-route denial. No hosted business data was changed.
- Connected account and opportunity KYC queues with independently recoverable data states, tenant-scoped joins, and existing PPRF review links.
- Connected warranty first-ticket portal issuance and actual ticket detail links. The project selector resets issued-link state on project change.
- Replaced Design's raw document UUID field with related uploaded documents and an upload-workspace link. Server action rejects unrelated documents, invalid/sibling design IDs and approved-design revisions; version and audit writes are transactional with row locking.
- Removed seven duplicate project tab bars, keeping the shared role-aware navigation and active-page accessibility marker.
- Fixed Viewer PO creation controls, current-status labels, and list totals using the existing shared committed-status definition. No financial calculation policy or schema was introduced.
- Fixed Manila task due/completion display and warranty reschedule conversion. Added exact UTC/day-boundary regressions.
- PO modal Escape and Cancel now restore trigger focus. At 390px, the dialog is 352px wide with no page overflow and internal line-item scrolling.
- Removed the warranty success page's unverified email-delivery assertion.

Local browser evidence: corrected fake-auth CORS allowed normal login; task generation failure is announced without false success; refresh remains available; punchlist creation persisted; warranty portal issuance, client ticket submission, staff queue/detail, acknowledgement and scheduling persisted. Final reschedule verification passed on a fresh development origin: stored 02:00 UTC rendered as 10:00 Manila, and saving/reloading/reopening retained 10:00. The earlier origin served a stale client bundle despite server recompilation; the fresh origin rendered the current labelled input. Hosted outbound delivery remains unverified.

Follow-up checks: 153 Web tests passed across 18 focused/neighboring files after correcting the document test to compose shared navigation. This includes 64 design/proposal action tests, 13 document role tests and seven KYC source/permission tests. Final Web production build, full configured typecheck and lint passed. Core build/lint and 23 tests passed; no Core code changed during the follow-up. Design concurrency is covered by transaction/locking assertions, but a concurrent database replay was not run. No commit, push, migration or deployment.

Warranty schedule database readback confirmed the final UI save preserved 02:00 UTC / 10:00 Manila and appended a `status_change` audit entry. The unchanged schedule produced an empty diff, with no timezone drift.

## Production release authorization — September 8

The user subsequently requested pushing and deploying this complete repair batch. Release scope is this isolated worktree, through a reviewed PR to `main` and the existing `Production promotion` workflow. No schema migrations or unrelated original-workspace edits are included. The workflow verifies the migration ledger, deploys the exact Railway API/CAD services and Vercel project, and runs production health/auth checks. Deployment status is tracked by the PR and workflow run; earlier statements above describe the pre-release QA phase.
