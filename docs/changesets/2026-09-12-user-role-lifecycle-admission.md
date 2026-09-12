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

Local runtime was Node 24/pnpm 10 with the existing engine override; required Node 22 CI remains authoritative. The mixed-version test changes deadlock_timeout only inside its synthetic older transaction to make the application's timeout deterministic. It does not prove default detector victim selection or that all repository writers are deadlock-free.

## Remaining work

This is an authority prerequisite for approved retained-history suspension, not that feature's completion. The unsafe Auth-first deletion path is not yet replaced. Retained business-reference eligibility, last-active-admin protection across all writers, the complete suspension command and UI, and their tests remain required. Existing migration/Storage recovery holds continue; no production deployment is claimed.
