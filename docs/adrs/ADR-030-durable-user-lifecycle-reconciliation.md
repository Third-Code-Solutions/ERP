# ADR-030: Durable user lifecycle reconciliation

- Status: Proposed; not implemented or approved for production
- Date: 2026-09-13
- Scope: Platform lifecycle changes, invitation revocation and the future approved tenant retained-history Suspend workflow

## Evidence and problem

`PlatformAdministrationService.updateUserStatus` calls Auth before its database transaction and compensates from an earlier user snapshot. Revocation now has fresh locked admission (PR #75), but still has a remote-effect/commit boundary. Web `deleteUser` deletes Auth before a public-user delete that can fail against immutable audit history. None is a durable two-system transaction.

The installed Auth SDK returns HTTP-success user data without validating the identity or requested lifecycle state. The separately scoped response-binding adapter addresses false acknowledgements, not remote settlement.

Supabase exposes server-side [user updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) and [user reads](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid). Its [Auth update handler](https://github.com/supabase/auth/blob/master/internal/api/admin.go) applies the ban in its own transaction; the [user model](https://github.com/supabase/auth/blob/master/internal/models/user.go) clears `banned_until` for an explicit unban. These interfaces do not establish a documented operation-fencing or terminal-request-lookup contract. A local timeout is not evidence that the remote operation stopped.

## Proposed decision

Keep `users.account_status` as effective ERP access authority. Preserve identities and immutable history. Do not activate ADR-022 memberships or introduce physical deletion as recovery.

Use two focused tenant-owned ledgers:

- `user_lifecycle_commands`: target user and tenant, per-user generation, requesting actor/authority/support context, optional invitation, exact idempotency key/hash, expected generation/status, desired status/reason, immutable accepted result and processing state (`pending`, `completed`, `superseded`, `reconciliation_required`). This is the durable outbox.
- `user_lifecycle_provider_attempts`: command/tenant/user binding, desired blocked/unblocked state, attempt number, claim/lease, reserved/dispatched/confirmed/rejected/unknown state, dispatch/response times and scrubbed response/settlement evidence.

Require forced RLS and denied direct browser access, tenant-composite target references, indexed query paths and append-only audit evidence. A platform actor may belong to another tenant: follow ADR-027's explicit platform authority rather than creating a false target-tenant actor FK.

### Database admission

Revalidate current actor, tenant/support context, target, expected generation, platform-owner protection and business eligibility under bounded nonblocking locks. Keep user-before-invitation ordering. Admit the audit chain before audited command insertion. Exact retries return the original accepted operation; changed key reuse conflicts.

Suspension/disablement commits effective inactive status, reason, command and audit atomically before any Auth request. Invitation revocation joins that transaction where applicable. Reactivation records intent but keeps the account inactive. Queue only opaque command identity after commit; lost enqueue is recovered from the database.

### Provider execution and uncertainty

Persist dispatch before network I/O and release database locks. Finalization rechecks generation; stale workers may record evidence but cannot finalize newer intent. Do not reverse effective suspension because Auth synchronization failed, and never compensate using stale status memory.

A lease expiry, worker crash, repeated same-state request or provider readback does not prove an earlier dispatched request settled. Local generation fencing cannot prevent a late remote write. Unknown dispatched attempts therefore remain distinct, durable evidence and block conflicting provider operations and effective reactivation until settlement is established. An automatic retry must not erase that ambiguity.

Use existing BullMQ scheduling and database recovery patterns, not notification-delivery tables whose states cannot represent this uncertainty. The Cortex provider-attempt accounting supplies a useful reserved/dispatched/unknown pattern; do not couple lifecycle code to AI billing.

### Last-active-administrator invariant

Proposed PostgreSQL protection applies to every decrease in active owner/admin capacity: role demotion, status change, tenant departure or physical deletion. Require another active owner/admin in the old tenant and hold a conflicting survivor row lock through commit. Preserve separate platform-owner protection. Prove multirow statements, concurrent cross-writer changes and stronger isolation behavior before accepting a migration; a count query alone is insufficient.

Do not require an already-zero-admin tenant to gain an administrator during unrelated writes. No last-admin exception is assumed. Auth-first writers must be removed or fail closed before the guard is relied upon: a database rejection after a remote ban is not adequate protection.

## Contracts and rollout

Current lifecycle commands contain only status/reason and current UI claims completion from a user summary. Add typed operation identity, effective ERP status, requested state and provider synchronization status; render accepted/pending/confirmed/reconciliation-required truthfully. Server-side authorization and exact command replay must remain authoritative across page refreshes and retries.

Expected ownership: Agent 04 additive migration/schema; Agent 05 shared contract, command/worker/recovery authority; Agent 03 platform and tenant action integration; UI owner explicit confirmation, pending/recovery states; Agent 13 CI/recovery/rollout evidence. Document exact handoffs before implementation.

Deploy additive schema and dormant recovery code first, then cut over all relevant producers together after accounting for in-flight Auth operations. Rollback disables producers/workers while retaining inactive access and pending evidence; it must not restore Auth-first writes. Existing database/Storage recovery prerequisites still apply.

## Acceptance evidence

- Database rejection makes zero Auth calls; committed decreases survive enqueue failure, worker crash and provider outage.
- Exact idempotent retries preserve one accepted command; changed reuse conflicts.
- Concurrent last-admin decreases cannot both commit, including multirow and privileged direct database paths.
- Late responses cannot finalize newer commands; unknown earlier dispatches cannot be bypassed by opposite commands or readback.
- Reactivation remains denied until a confirmed current unban and resolution of earlier conflicting attempts.
- Invitation activation/revocation, cross-tenant denial, support authority and platform-owner protection remain correct.
- Browser journeys distinguish effective ERP access from Auth synchronization, including lost response and reload.
- Migration replay and rollback strategy preserve identities, RLS and historical evidence.

## Decisions still required

The user approved Suspend for retained-history users, not universal suspension. Exact operational-reference eligibility remains unanswered. Also unresolved: whether the tenant Suspend command includes an Auth ban or ERP-only denial, and who may establish settlement of unknown provider attempts with what evidence. A conservative unresolved-request quarantine policy has been asked separately. Do not invent a time-based settlement guarantee or claim this proposed ADR resolves those choices.
