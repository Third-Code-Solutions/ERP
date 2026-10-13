# Award task Process UI — Agent 03

Finance and CX now read the Process queue through the Core award-task route.
Only unblocked `in_progress` rows offer completion. CX onboarding waiting for
NTP remains actionless. Managers retain the existing generic queue and task
transitions; unsupported roles cannot load either queue.

The new completion server action accepts a UUID and uses the current session's
participant capability. It forwards no client status, tenant, role or command
body to Core. Core remains authoritative for active handoff, tenant, BU and
current task state. Failures remain visible, and a committed completion with a
refresh failure is reported as success with a refresh warning. Structured action
logs contain trace, tenant, actor, action and outcome, without transport details.

Changed application files:
- `apps/web/src/app/(dashboard)/process/page.tsx`
- `apps/web/src/app/(dashboard)/process/actions.ts`
- `apps/web/src/app/(dashboard)/process/process-task-actions.tsx`
- `apps/web/src/lib/erp-core-client.ts`

Verification on Node 22.23.2:
- PASSED: focused Vitest actions, role-page rendering and Core adapters: 209 tests.
- PASSED: Playwright real Chromium component harness: 8 tests, covering keyboard
  completion, blocked/pending/closed rows, manager controls and visible failures.
  This harness stubs server actions; it does not establish API/database behavior.
- PASSED: Web and E2E TypeScript checks.
- PASSED: Next.js production build, including type validation and all 113 static
  pages, using the repository-required Node 22 runtime. An initial attempt with
  the shell's default Node 24 was rejected by the engine guard.
- PASSED: scoped production-source ESLint with zero warnings. Repository lint
  intentionally excludes test files; including them initially returned ignored-file warnings.
- PASSED: `git diff --check`.
- BLOCKED: integrated demo-tenant browser proof because no local Core with the
  new routes and current schema was available. The deployed Core was not used as
  a substitute. No hosted records were created or changed and no deployment ran.

The root coordinator retains release and integration ownership, including the
disposable current-schema PostgreSQL lane. Existing Core/migration changes were
preserved. No new dependencies or product policy were introduced.
