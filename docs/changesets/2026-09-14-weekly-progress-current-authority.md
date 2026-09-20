# Weekly progress transaction-time authority

Status: locally implemented and independently verified; CI and release pending.
Not deployed.

## Changes

Core weekly capture and WAR locking now recheck the current actor's active
account and existing capability, then the active tenant, under transaction-held
shared locks. Both commands take the canonical tenant audit-chain lock before a
scoped project update lock. Admission is fail-fast with bounded lock waiting.
Wrapped PostgreSQL lock contention/deadlock errors become safe conflict
responses; unrelated failures retain their original behavior.

This closes the gap between the earlier request guard and the evidence write.
Commands, response contracts, capabilities, injected clock behavior, cutoff rules,
replay/version ordering and list reads are unchanged. No schema or UI change.

## Verification

The initial two actual-PostgreSQL regressions failed: a suspended actor could
commit a capture and lock an existing period. Synthetic evidence and immutable
audit history were retained; no production data was involved.

- PASSED: 74 focused tests without skips: 47 actual-PostgreSQL authority cases,
  11 existing PostgreSQL write/immutability cases, 11 service cases and 5 HTTP
  controller/protected-route cases.
- PASSED: explicit capture and lock capability matrices for all 13 roles,
  invited/suspended/disabled actors, inactive tenants, stale-role demotion,
  foreign/retired projects and actor/tenant/project/audit contention. Denials
  assert unchanged durable evidence and audit history.
- PASSED: API types, dedicated integration/unit types, production-source ESLint
  and diff checks. Integration files are excluded by the existing lint config.
- Initial contention tests exposed six raw PostgreSQL lock errors; all now
  receive safe conflicts. Unrelated exception identity remains tested.
- CI/build verification is pending. No UI changed, so no new mounted browser
  test was added. Synthetic role matrices are not live demo-account E2E proof.

## Remaining boundaries

Durable capture/lock receipts, canonical cutoff binding, stable Web retry keys
and unknown-result UI handling remain separate work. Legacy non-Core writes and
read admission are not repaired by this mutation-only slice.

No production mutation or migration. Existing database recovery and coordinated
release gates remain mandatory; clean synthetic tests are not recovery proof.
