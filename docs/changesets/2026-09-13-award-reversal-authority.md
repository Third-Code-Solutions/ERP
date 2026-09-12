# Authenticated award and reversal authority

## Changes

- Authenticated award actions recheck current active membership, capability and
  tenant inside the transaction, holding lifecycle locks through persistence.
  Locked BOM admission is scoped and transactional; public signing policy and the
  shared award helper remain unchanged.
- Reversal shares award creation's advisory identity, locks the scoped handoff,
  and conditionally records one transition. Concurrent requests cannot overwrite
  the first reversal's reason, actor or audit evidence. Existing downstream
  cancellation behavior is preserved.
- Lock waits are bounded. Authority conflicts return safe retry guidance after
  rollback. Committed mutations remain successful when cache invalidation fails,
  with an explicit refresh warning; ambiguous failures do not claim rollback.
- Both authenticated actions emit sanitized structured outcome logs.
- The panel retains controlled input values, freezes uncertain requests for exact
  retry, prevents duplicate dispatch synchronously, rejects stale-scope responses
  and separates committed success from refresh failure. Lifecycle cleanup supports
  React Strict Mode. Existing design tokens and responsive layout are preserved.

## Verification

- PASSED: 16 actual-action synthetic PostgreSQL regressions, no skips. Covers
  current lifecycle/capability admission, cross-tenant denial, concurrent reversal,
  lifecycle lock contention, audit rollback, safe conflict mapping, truthful
  post-commit refresh warnings and exact authenticated award receipt replay.
- PASSED: independent Astra review of server admission and lock ordering.
- PASSED: WO-13 contract, action source ESLint, Actionlint and BUILD OPS static
  invariants. New browser suite is included in the existing credential-free CI gate.
- PASSED: 2 component tests and 4 Chromium journeys without skips, including
  duplicate award/reversal submissions, preserved custom values, exact retries,
  refresh warnings/failures, scope replacement and Strict Mode. Keyboard behavior
  and layout were checked at 320/768/1024/1440px; the 320px screenshot was inspected.
  Browser actions are controlled boundaries, not hosted end-to-end proof.
- PASSED: Web type checking and panel source ESLint. Fresh branch CI and hosted
  all-role verification remain pending.

## Release

Not deployed. No schema, dependency, public-signing policy or production-data
change. Production recovery evidence and the pending migration boundary remain
release gates. The separate PR85 client-import build fix was pushed as
`0610138db28b44a081798835314a77869ee8a9a1`; its replacement CI is running.
The complete ERP roadmap is not yet finished.
