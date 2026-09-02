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

## Agent 11 remediation

- Replaced optional conversion Lost copy with a dedicated required-reason
  dialog shared by the conversion control and Board Lost path.
- Classified Board Lost before submission so it never sends an avoidable blank
  request or reuses regression-only wording; true regressions retain their
  existing dialog behavior.
- Added programmatic textarea labels, required state, and a shared 1,000-character
  boundary.
- Added a stable per-caller submission guard that rejects blank/oversized
  required reasons, forwards a trimmed reason exactly once, and suppresses a
  duplicate while the first action is pending.
- Preserved the typed returned/rejected error runner, visible alerts, retry
  clearing, success-only refresh, keyboard semantics, Won behavior, role
  controls, and no-optimistic-write behavior.

Pipeline remediation commit: `60c73bac`.

### Agent 11 remediation verification

- Node 22.23.2 and pnpm 10.33.0: VERIFIED through direct pinned targets.
- Four behavior-first red cycles: VERIFIED for missing textarea contract,
  missing Lost UI, missing blank/trim/pending guard, and missing reason-kind
  classification.
- Final focused plus neighboring Pipeline suites: PASSED, 4 files / 52 tests.
- Web plus configured E2E TypeScript projects: PASSED.
- Full Web source lint: PASSED.
- Web production build: PASSED, including 89 generated static pages.
- Diff check: PASSED.
- Pinned Gitleaks 8.30.1 full-history scan: PASSED, 1,778 commits / no leaks.

No scripts, route, server action, Core/API, shared auth, schema, dependency,
demo-data, environment, credential, or deployment change was made by this
remediation.

## Remaining work

The stale cross-surface WO-11 oracle is repaired. It now parses the authoritative
Core service and Web action with the repository's installed TypeScript compiler
and structurally verifies tenant-scoped Account/track reads, dual-track and
legacy KYC behavior, shared state/reason rules, Core persistence/audit/SLA
ownership, unconditional Web Core delegation, strict returned-result checks,
and the absence of Web-local fallback writers. Mutation-sensitivity tests prove
the gate fails when Core KYC or Account tenant scoping is removed, when Web Core
delegation is removed, or when a local Opportunity writer is added.

Contract-gate commit: `50339af8`.

### WO-11 contract-owner verification

- Pinned Node 22.23.2 and pnpm 10.33.0: VERIFIED.
- Stale-oracle baseline: FAILED as expected, 0/1 (`downstream stage set`).
- Final WO-11 contract gate: PASSED, 5/5.
- Focused Core stage-transition suite: PASSED, 63/63.
- Web action lane: PASSED, 21 files / 226 tests, including 27/27 Pipeline
  action cases.
- API and Web typechecks: PASSED.
- Root application-source lint plus explicit script lint: PASSED.
- API and Web production builds: PASSED; Web generated 89 static pages.
- `node --check` for both contract scripts: PASSED.
- Prettier: NOT RUN because the repository does not install a Prettier binary.

No Core/API/Web product source, shared auth, schema, dependency, demo data,
environment, credential, or deployment state changed. The protected PostgreSQL
HTTP canary remains BLOCKED by the same absent `DATABASE_URL` and
`ERP_API_INTEGRATION_EXPECTED=1` bindings; no live database proof is claimed.

Independent QA must rerun the combined branch. After QA, the designated browser
verifier must exercise the supplied identity matrix and returned/rejected
failure states. Safe positive persistence proof remains limited to a disposable
or rollback-contained fixture.
