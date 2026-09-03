# Project-detail Opportunity Core cutover — Agent 05

## Outcome

The authoritative Core Opportunity stage command can now retain the Project
panel's TCV, GP, and closing-date edits in the same transaction as stage,
weighted TCV, audit, SLA rollover, idempotency completion, and any Won handoff.
This removes the API-contract reason for a Web-local prewrite or silent field
loss.

## Changed areas

- `packages/shared-types/src/erp-api/opportunity-stage-transition.ts`
  adds strict optional commercial command fields and safe integer limits.
- `apps/api/src/crm/opportunity-stage-transition.service.ts`
  locks and preserves existing commercial values, persists supplied edits,
  computes weighted TCV with an exact integer intermediate, and audits changes.
- Focused shared, Core service, and protected HTTP integration tests cover the
  command boundary, persistence, audit, rollback, replay/key reuse, concurrency,
  and the rollback-contained PostgreSQL canary contract.

Source commit: `cb3d7b3d`.

No schema, dependency, Web, demo-data, environment, credential, or deployment
change was made.

## Verification

- Node 22.23.2 / pnpm 10.33.0: VERIFIED.
- Focused shared contract: PASSED, 9/9 after a reproduced 1-failure red.
- Focused Core service: PASSED, 67/67 after a reproduced 2-failure red.
- Full shared suite: PASSED, 66 files / 442 tests.
- Shared and API typechecks: PASSED.
- Scoped source ESLint: PASSED, zero errors and warnings.
- API production build: PASSED.
- Unrelated delivery-controller timeout: PASSED in isolation, 24/24; the broad
  API run was stopped before a final total and is not reported as green.
- Protected PostgreSQL HTTP canary: SKIPPED, 1/1, because its required database
  opt-in environment was absent; no live persistence proof is claimed.
- Diff/whitespace check: PASSED.
- Pinned Gitleaks 8.30.1: PASSED, 1,794 commits / no leaks.

## Handoff

Agent 03 should send the panel fields through
`transitionOpportunityStageThroughCoreApi` in camelCase, normalize the date-only
control to an explicit-offset RFC 3339 value, keep a stable full-command
idempotency key, remove the local writer with no fallback, and revalidate only
after the unchanged strict Core result is validated.

## Agent 03 — Project route and action

Source commit: `9f83cbd8`.

- Replaced the mounted Project-detail Opportunity stage action's local
  Opportunity update and separate audit with the tenant-selected Core command.
- Forwarded the complete normalized command with stable content-derived
  idempotency and no selector, transport, typed-error, or invalid-result
  fallback.
- Calendar-valid Project-panel dates become Philippine midnight with an
  explicit `+08:00` RFC 3339 offset; omitted values remain omitted and GP stays
  signed.
- Enforced exact Owner/Admin/Sales direct-action authorization and strict
  returned Opportunity/tenant/edge/destination/conversion validation.
- Limited revalidation to validated success, including the committed Won
  Project path and returned Project ID.
- Passed central `canCreate` and `canMutate` decisions from the Project route to
  the Agent 11-owned panel.
- Added focused action and AST-backed route contracts, including all thirteen
  roles and a reachable-call-graph prohibition on local update, audit, and SLA
  effects.

Verification: focused/neighboring Web tests PASSED 94/94; Web and configured
E2E TypeScript PASSED; full Web source ESLint PASSED; production build PASSED
with 89/89 pages; diff checks PASSED; final pinned Gitleaks PASSED over 1,798
commits. WO-11 was PARTIAL at 4/5 because its out-of-scope stale
exact-text Pipeline mutation fixture could not construct the mutation; the
main invariant passed, and the failure reproduced under pinned Node 22.23.2 /
pnpm 10.33.0.

Next: Agent 11 consumes the route permission props, includes `project_id` in
the stage form, and provides recoverable reason/error/pending UX without any
local or pre-Core write.
