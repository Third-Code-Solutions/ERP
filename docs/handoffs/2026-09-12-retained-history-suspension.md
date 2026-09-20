# Retained-history suspension: authority prerequisites

## Approved boundary

User approved Suspend for users with retained history. Preserve Auth identity, public user records and append-only evidence. This is not approval to suspend every user or to invent a permanent-erasure policy. Existing Auth-first deletion is unsafe and must not be presented as repaired before the complete replacement is verified.

## Sequential ownership

1. Agent 01/main records this bounded approval and source-backed acceptance criteria.
2. Agent 12 architecture review is read-only: identify retained-history predicate, current suspension authority, last-active-admin and concurrency requirements. Existing platform-owner suspension is not a tenant-admin API.
3. Agent 05 completes the independently useful authority prerequisite in `apps/api/src/admin/user-role-assignment.service.ts` and its spec: current transaction must reject inactive actors/tenants even if an earlier HTTP check passed. Preserve current capability, tenant and idempotency boundaries. No schema, suspension endpoint or platform service changes in this prerequisite.
4. Main independently reviews/tests that prerequisite, records evidence and integrates. A complete suspension endpoint, retained-history read contract and UI require the following security contracts; they are not claimed by this prerequisite.

## Complete workflow acceptance criteria

- Tenant-scoped target and current active actor with admin.users authority; prohibit self-suspension and unauthorized owner changes.
- Protect platform owner and the last active workspace administrator under concurrent role/status changes.
- Server-confirmed retained history; no reliance on client flags or a best-effort UI audit list.
- Atomic account-status update, reason and immutable semantic audit; exact idempotent replay without repeating effects.
- Explicit confirmation and truthful suspended/error/uncertain states. Do not call Auth deletion or claim a provider ban that did not occur.
- Verify current Core and RLS denial after suspension, retained history unchanged, stale/concurrent requests, other-tenant denial, failure rollback and accessible browser flow.

The existing database account status already gates Core and tenant RLS. The current platform status service calls Auth before its DB transaction and is not directly reusable for this tenant workflow. A complete design must address shared role/status serialization before implementation. Hosted deployment remains held by existing recovery prerequisites.

## Reviewed prerequisite lock contract

Actor UPDATE NOWAIT, tenant SHARE NOWAIT, nonblocking audit-chain admission before ledger INSERT, existing idempotency replay, then target UPDATE NOWAIT. A blocking target lock would invert the platform-owner-user then tenant UPDATE path. The ledger INSERT itself has an audit trigger, so row NOWAIT alone is insufficient. Transaction-local one-second lock timeout bounds unique-key waits against older in-flight writers; wrapped SQLSTATE 55P03 maps to a retryable conflict outside the rolled-back transaction. Do not use SKIP LOCKED or change persistent database settings.

Five unit regressions reproduced inactive actor/tenant replay before this change. Independent real PostgreSQL admission/concurrency tests are required before shipping it. This does not establish last-active-admin safety across all writers and does not complete the suspension feature. Retained operational-reference scope has been asked separately; no generic FK-based or automatic-membership eligibility is approved by this note.
