# Atomic opportunity stage transitions

## Agent 05 scope

- Reproduced and fixed the Core API accepting Lost/Closed Lost transitions
  without a reason.
- Proved every shared non-Won transition through the existing atomic service
  boundary.
- Added exact-role, tenant, current-membership, KYC, regression/lost-reason,
  audit/SLA rollback, idempotency replay/key-reuse/concurrency, and strict-result
  coverage.
- Extended the rollback-contained HTTP canary with the missing-Lost-reason
  rejection and zero-idempotency-row assertion.

## Changed areas

- `apps/api/src/crm/opportunity-stage-transition.service.ts`
- `apps/api/src/crm/opportunity-stage-transition.service.spec.ts`
- `apps/api/integration/opportunity-stage-transition.http.integration.spec.ts`

Source commit: `9496d282`.

No schema, dependency, shared API type, Web, demo-data, environment, credential,
or deployment change was made.

## Verification

- Node 22.23.2 and pnpm 10.33.0: VERIFIED.
- Focused final service suite: PASSED, 63/63.
- Focused neighboring CRM/auth suites: PASSED, 128/128.
- Full API unit/contract suite: PASSED, 187 files / 912 tests.
- API typecheck, full API source lint, and API production build: PASSED.
- Diff check and Gitleaks over 1,770 commits: PASSED.
- Protected PostgreSQL HTTP canary: BLOCKED, one environment-gated skip because
  `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` were unavailable.

## Agent 03 scope

- Removed the active non-Won local opportunity-stage writer, separate semantic
  audit, and best-effort SLA rollover from the Pipeline server action.
- Routed every stage command through the existing tenant Core selector and
  atomic stage-transition client without fallback.
- Added deterministic non-Won command keys without changing the established
  Won retry-key namespace.
- Added strict committed-result checks for opportunity, tenant, from/to edge,
  destination, and non-conversion fields before any revalidation.
- Added handled selector, transport, typed rejection, and invalid-result tests
  proving no local stage effects or cache refresh occur on failure.

Web source commit: `0ed1bdbc`.

### Agent 03 verification

- Node 22.23.2 and pnpm 10.33.0: VERIFIED.
- Red action suite: FAILED as expected, 14 new non-Won cases / 13 existing
  passes.
- Final focused action suite: PASSED, 27/27.
- Focused and neighboring Web suites: PASSED, 3 files / 212 tests.
- Web plus configured E2E TypeScript projects: PASSED.
- Full Web source lint: PASSED.
- Web production build: PASSED, including 89 generated static pages; non-fatal
  webpack cache serialization warnings were emitted.
- Diff check: PASSED.
- Gitleaks 8.30.1: PASSED, no leaks found.

No Core/API source, Pipeline UI component, shared auth, schema, dependency,
demo-data, environment, credential, or deployment change was made by Agent 03.

## Agent 11 scope

- Added one shared Pipeline action-result runner so returned errors and rejected
  action Promises follow the same handled UI path.
- Wired `StageAdvanceButton` and `PipelineBoard` to clear stale errors on each
  attempt, show failures through their existing accessible alerts, and run
  refresh/success work only after an error-free result.
- Preserved exact regression `reason_required` handling, Lost reason forwarding,
  keyboard semantics, pending/disabled double-submit guards, and the absence of
  optimistic stage persistence.
- Added deterministic regression coverage for thrown failure, returned failure,
  stale-error clearing, retry, and success-only refresh behavior.

Pipeline source commit: `7e8e0a60`.

### Agent 11 verification

- Node 22.23.2 and pnpm 10.33.0: VERIFIED.
- Red rejected-action reproduction: FAILED as expected, 1/1.
- Final focused action-result suite: PASSED, 3/3.
- Focused plus neighboring Pipeline suites: PASSED, 3 files / 44 tests.
- Web plus configured E2E TypeScript projects: PASSED.
- Full Web source lint: PASSED.
- Web production build: PASSED, including 89 generated static pages.
- Diff check: PASSED.
- Pinned Gitleaks 8.30.1 full-history scan: PASSED, 1,775 commits / no leaks.

No route, server action, Core/API, shared auth, component-library, schema,
dependency, demo-data, environment, credential, or deployment change was made
by Agent 11.

## Remaining work

Independent QA must review the combined branch and return `GO` or `BLOCK`.
After QA, the designated browser verifier must exercise the supplied identity
matrix and the returned/rejected failure states in a real browser. Safe positive
persistence proof remains limited to a disposable or rollback-contained fixture.
