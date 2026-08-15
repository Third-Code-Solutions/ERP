# Procurement contract test harness timeout

## Changed

- Added an explicit 30-second timeout to the RFQ creation HTTP contract test.
- The contract starts a Nest application and is sensitive to cold module
  collection and monorepo CPU contention; the production request path remains
  covered by the same response and service-authority assertions.

## Verification

- PASS — focused procurement controller suite: 8 passed.
- PASS — full monorepo test suite: all runnable tests passed; database-backed
  integration tests remain environment-skipped when disposable credentials are
  unavailable.
