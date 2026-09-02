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

## Remaining work

Agent 03 must remove the active non-Won local Web writer and select this Core
transaction without fallback. Agent 11 then verifies visible handling of both
returned and rejected failures before independent QA and safe browser proof.
