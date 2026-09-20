# Finance Storage lifecycle authorization

## Verified scope

Independent read-only security review and main source inspection found that both methods in `apps/web/src/app/api/finance/reconciliation/import/sign/route.ts` use Auth identity followed by a privileged tenant/role lookup, without active-user or active-tenant enforcement. Legacy signing and cleanup can therefore bypass the lifecycle boundary already enforced by Core and authenticated profile RLS.

This is an existing access-control correction within the approved hardening objective. It does not decide all-users suspension policy, delete identities, change account statuses, apply hosted DDL or revoke already-issued URLs.

## Sequential ownership

1. Agent 12 completed the read-only review: use existing `getUserProfile()` and retain `finance.manage_cash`, tenant-prefix validation, feature gates, audit ordering and Core no-fallback semantics. Its authenticated RLS authority requires active user and tenant.
2. Agent 03 owns the route and adjacent route test correction, plus the existing auth-profile regression test if needed. Write and run RED regressions before replacing the privileged lookup. No provider writes, new dependencies, shared helper redesign or unrelated edits.
3. Main, in Agent 12 RLS-test scope, strengthens `packages/database/src/__tests__/platform-administration.database.test.ts` to verify actual authenticated profile visibility for active, suspended and disabled users/tenants. This file is separate from Agent 03's files. Main independently reviews and reruns focused tests/types/lint. Mocked hidden profiles must not be represented as PostgreSQL RLS proof. Agent 13 then verifies the separate candidate through CI before any release.

## Acceptance

- Both methods reject unavailable active profiles before Storage, Core or audit calls.
- Authorized active profiles retain existing behavior and capability checks.
- Foreign-tenant cleanup and failed Core calls cannot fall back to privileged Storage.
- Existing signed URLs, in-flight requests and universal session revocation remain outside this narrow fix; no stronger revocation claim is made.

The working branch depends on KYC PR #68. Do not mix this correction into that PR or bypass its database recovery hold.
