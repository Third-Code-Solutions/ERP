# User-role lifecycle admission

The Core role-assignment transaction now rechecks active actor and tenant status before accessing its idempotency ledger. Five regression cases demonstrated that the old code could return a completed role-change replay for an invited/suspended/disabled actor or a suspended/disabled tenant despite a stale allowed principal.

Actor/target UPDATE and tenant SHARE locks use NOWAIT. Nonblocking tenant audit-chain admission precedes the audited ledger INSERT. Successful exact replay remains before target validation. A transaction-local one-second lock timeout bounds older-version unique-key waits; wrapped PostgreSQL 55P03 and 40P01 become retryable conflicts outside the aborted transaction. Other errors still propagate. No persistent database setting, schema, permission, Auth identity or UI was changed.

## Verification

- Original five inactive cases: RED against prior service; GREEN after implementation.
- Main independently ran service/controller tests: 23/23 passed, zero skips.
- New real PostgreSQL admission suite: 12/12 passed independently, zero skips. Covers inactive actor/tenant, held actor/tenant/target/audit locks, durable user/ledger/audit equality after rejection, exact replay while target locked, observed user-before-tenant inversion, and bounded older-writer unique-key/audit contention.
- Existing role-assignment HTTP/database integration: 1/1 passed, zero skips.
- Dedicated strict TypeScript check including the new integration file passed. API source typecheck and source ESLint passed. Existing ESLint configuration does not cover integration files; no integration lint pass is claimed.
- Diff whitespace check passed. Synthetic fixtures and their immutable audit evidence remain in the existing disposable loopback database; no cleanup, hosted writes or external Auth calls occurred.

Local runtime was Node 24/pnpm 10 with the existing engine override; required Node 22 CI remains authoritative. The mixed-version test uses unchanged database timeout settings and accepts only the two valid deadlock-victim outcomes: new-command conflict with unchanged durable state, or old-writer 40P01 with exactly one valid new command and unchanged exact replay. It does not prove that all repository writers are deadlock-free.

### CI test correction

Run 34703171000 failed the initial mixed-version test. That test attempted a privileged `deadlock_timeout` change; a failure before its readiness signal was consumed without waking the peer. Local superuser runs hid this defect. Independently reproduced that ordinary roles cannot set this parameter. The original PID-only blocker check did not identify the actual lock type; no creator foreign-key wait was reproduced and the inspected ledger has no such constraint.

The corrected test removes that privileged setting, races readiness against peer failure, drains both transactions on exit, and verifies exact Lock/advisory and Lock/transactionid wait edges. Separate synthetic administrators hold their own actor locks while submitting the same tenant request key. No timeout was increased, production code changed or audit assertion disabled. Both disposable local database variants passed 12/12; main independently passed the CLI-equivalent variant and strict integration TypeScript. Fresh CI is required; no production rollout is claimed.

## Remaining work

This is an authority prerequisite for approved retained-history suspension, not that feature's completion. The unsafe Auth-first deletion path is not yet replaced. Retained business-reference eligibility, last-active-admin protection across all writers, the complete suspension command and UI, and their tests remain required. Existing migration/Storage recovery holds continue; no production deployment is claimed.
